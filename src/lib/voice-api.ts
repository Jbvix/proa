import { Buffer } from "node:buffer";
import type { VoiceContext, VoiceTurn } from "./voice-context";
import {
  ALANA_BYE,
  ALANA_GREET,
  ALANA_MISS,
  ALANA_ROLL,
  ALANA_XTE,
  isCannedKind,
  type CannedKind,
} from "./voice-copy";

export { ALANA_BYE, ALANA_GREET, ALANA_MISS, isCannedKind, type CannedKind };

const CANNED: Record<CannedKind, string> = {
  greet: ALANA_GREET,
  bye: ALANA_BYE,
  miss: ALANA_MISS,
  xte: ALANA_XTE,
  roll: ALANA_ROLL,
};

const SYSTEM = `Você é a rádio do passadiço do app Proa, da TugLife. Colega de bordo: português do Brasil, solta, amigável, como quem conversa no rádio no meio da vigia. Não é boletim, ATC nem atendente. Sem emoji. Não se apresente em toda resposta e NUNCA fale a palavra "Alana" nem "a lana", senão o microfone acorda. Se perguntarem quem você é: "Sou a rádio do passadiço. Pode mandar."

Tom: contrações (tá, tô, pra, a gente). Chame a tripulação pelo nome quando tripulacao[] tiver alguém. Não use "senhor" nem "comandante". Não encerre com "posso ajudar em mais alguma coisa". Sem lista numerada.

Papo do passadiço: pode distrair, zoar leve, café, cansaço da vigia, um futebol curto, uma história boba — 2 a 5 frases, no clima de bordo. Se a conversa escorrer demais, um gancho curto de volta pra derrota ("e o Hs tá de boa"). Não recuse papo fiado.

Viagem: responde QUALQUER pergunta da derrota, de qualquer tela. Nunca peça pra mudar de tela. Fatos só do CONTEXTO. Não invente posição, Hs, SOG, ETA, cidade, litros, RPM. Se faltar, diga que não tem.

Passagem por cidade / porto / praia: use cidades[]. eta é dia+hora ("hoje 21:40", "amanhã 08:15", "sáb. 21 set 04:10"). passou = já ficou pra trás. Se a cidade não está em cidades, não está nesta derrota — não invente. ETA do destino: mare.etaDia (preferir) ou mare.eta. Falta: mare.etaFalta. SOG atual constante.

Enchente na chegada: mare.enchenteIdeal, mare.fase, mare.m, mare.sogAlvoKn, mare.conselho. Enchente = maré subindo (estimativa, não tábua oficial).

Meteorologia / vento / corrente: meteo.tempo, ventoKn, ventoCard, rajadaKn, correnteKn, correnteCard. Altura de onda: mar.hsCasco (casco ao vivo), mar.hsPrev (previsão), mar.ondasMin, mar.estado, mar.balancoDeg. Maré: mare.

Posição: latLon + costa. costaNm = linha de costa, não cidade. XTE: xteNm, xteLado BB/EB/linha.

Combustível / RPM: combustivel.conselho, aFavor, contra, rpm.min–max, rpmSugerido.

Se alguém se apresentar, use o nome na hora e trate como colega. tripulacao[] são nomes que você já conhece.

Turno / vigia: turnos[] tem nome, fim (dia e hora) e faltaMin. Se pedirem pra AVISAR o fim de turno, confirme pelo NOME e o horário. O rádio chama o colega pelo nome na hora. Não invente turno que não está em turnos. Se faltar o nome ou a hora, pergunte.

Relatório / situação: 5 a 8 frases corridas — posição; SOG/rumo/falta; Hs; vento e corrente; RPM/combustível; ETA e enchente. Pergunta pontual = 2 a 5 frases. Papo = pode ser mais curto.

Agora (relógio local) está em agora. App: derrota GPX; mar ao vivo do casco; vento/corrente Open-Meteo; previsão nos waypoints. Não fale de código, API, chave, servidor.`;

type FetchOpts = RequestInit & { ignoreResponseError?: boolean };

function clip(s: string, n: number) {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n);
}

function cannedStore(): Map<string, string> {
  const g = globalThis as { __proaAlanaTts?: Map<string, string> };
  if (!g.__proaAlanaTts) g.__proaAlanaTts = new Map();
  return g.__proaAlanaTts;
}

async function grokFetch(url: string, apiKey: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    ignoreResponseError: true,
  } as FetchOpts);
}

export async function askGrokVoice(
  apiKey: string,
  message: string,
  context: VoiceContext,
  history: VoiceTurn[] = [],
): Promise<{ text: string; audio: string | null }> {
  const user = clip(message, 720);
  if (!user) return { text: "Manda de novo, não peguei o áudio.", audio: null };

  const res = await grokFetch("https://api.x.ai/v1/chat/completions", apiKey, {
    model: "grok-4.5",
    temperature: 0.85,
    max_tokens: 700,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `CONTEXTO AO VIVO:\n${JSON.stringify(context)}`,
      },
      ...history.slice(-8).map((h) => ({
        role: h.role,
        content: clip(h.content, 400),
      })),
      { role: "user", content: user },
    ],
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Grok ${res.status} ${err.slice(0, 80)}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = clip(body.choices?.[0]?.message?.content ?? "", 2_200);
  if (!text) throw new Error("Grok vazio");

  const audio = await speakGrok(apiKey, text);
  return { text, audio };
}

export async function speakLine(
  apiKey: string,
  text: string,
): Promise<{ text: string; audio: string | null }> {
  const line = clip(text, 220);
  if (!line) return { text: ALANA_GREET, audio: null };
  const audio = await speakGrok(apiKey, line);
  return { text: line, audio };
}

export async function speakCanned(
  apiKey: string,
  kind: CannedKind,
): Promise<{ text: string; audio: string | null }> {
  if (!isCannedKind(kind)) return { text: ALANA_GREET, audio: null };
  const text = CANNED[kind];
  const cacheKey = `${kind}:${text}`;
  const hit = cannedStore().get(cacheKey);
  if (hit) return { text, audio: hit };
  const audio = await speakGrok(apiKey, text);
  if (audio) cannedStore().set(cacheKey, audio);
  return { text, audio };
}

async function speakGrok(apiKey: string, text: string): Promise<string | null> {
  try {
    const res = await grokFetch("https://api.x.ai/v1/tts", apiKey, {
      text: clip(text, 2_400),
      voice_id: "ara",
      language: "pt-BR",
      output_format: {
        codec: "mp3",
        sample_rate: 24000,
        bit_rate: 128000,
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 80) return null;
    return buf.toString("base64");
  } catch {
    return null;
  }
}

export async function hearGrok(
  apiKey: string,
  audioB64: string,
  mime = "audio/webm",
): Promise<string> {
  const raw = Buffer.from(String(audioB64).replace(/^data:.*?;base64,/, ""), "base64");
  if (raw.byteLength < 400 || raw.byteLength > 480_000) return "";
  const kind = mime.includes("ogg")
    ? "ogg"
    : mime.includes("mp4") || mime.includes("m4a")
      ? "m4a"
      : mime.includes("wav")
        ? "wav"
        : mime.includes("mpeg") || mime.includes("mp3")
          ? "mp3"
          : "webm";
  const type =
    kind === "ogg"
      ? "audio/ogg"
      : kind === "m4a"
        ? "audio/mp4"
        : kind === "wav"
          ? "audio/wav"
          : kind === "mp3"
            ? "audio/mpeg"
            : "audio/webm";
  const form = new FormData();
  form.append("model", "grok-voice-transcribe-2.0");
  form.append("language", "pt");
  form.append("vad_threshold", "0.18");
  form.append("keyterm", "Alana");
  form.append("file", new Blob([new Uint8Array(raw)], { type }), `clip.${kind}`);
  const res = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    ignoreResponseError: true,
  } as FetchOpts);
  if (!res.ok) return "";
  const body = (await res.json()) as { text?: string };
  return clip(String(body.text ?? "").trim(), 480);
}
