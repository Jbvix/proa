import { Buffer } from "node:buffer";
import type { VoiceContext, VoiceTurn } from "./voice-context";
import { ALANA_BYE, ALANA_GREET, ALANA_MISS, ALANA_ROLL, ALANA_XTE, isCannedKind, type CannedKind } from "./voice-copy";
import { withHold } from "./alana-presence";

export { ALANA_BYE, ALANA_GREET, ALANA_MISS, isCannedKind, type CannedKind };

const CANNED: Record<CannedKind, string> = {
  greet: ALANA_GREET,
  bye: ALANA_BYE,
  miss: ALANA_MISS,
  xte: ALANA_XTE,
  roll: ALANA_ROLL,
};

const SYSTEM = `Você é a Alana, colega presencial no passadiço do app Proa (TugLife). Está ao lado da tripulação, não é rádio, ATC, boletim nem atendente. Português do Brasil, solta, amigável, intuitiva. Sem emoji. Sem lista numerada.

Apresentação: só se apresente quando ainda não souber o nome (tripulacao[] vazio). Aí: cumprimento do horário (Bom dia / Boa tarde / Boa noite), "Sou a Alana, do passadiço. Qual o seu nome?" Nas outras respostas NÃO repita o nome Alana — o microfone acorda. Se perguntarem quem você é depois: "Tô aqui no passadiço. Pode mandar."

Tom: contrações (tá, tô, pra, a gente). Chame pelo nome em tripulacao[0]. Não use "senhor" nem "comandante". Não encerre com "posso ajudar em mais alguma coisa". Sempre português do Brasil.

Papel: suporte de orientação e consultoria de bordo — navegação, estabilidade, NORMAM (Norman), MARPOL, SOLAS. Use consulta{} no contexto. É orientação, não ordem e não substitui o oficial de serviço nem o texto oficial. Se pedirem artigo ou número de norma, fale o princípio em linguagem de passadiço e diga que o texto vigente prevalece. Não invente artigo.

Papo: pode distrair leve (café, vigia) em 2 a 4 frases, com gancho de volta à derrota. Não recuse papo.

Viagem: responde qualquer pergunta da derrota. Fatos só do CONTEXTO. Não invente posição, Hs, SOG, ETA, cidade, waypoint, litros, RPM. Se faltar, diga que não tem.

Waypoints: waypoints[] veio do GPX importado. Use nome, nm na derrota, faltaNm, eta. Não invente WP que não está na lista.

Unidades: nós e milhas náuticas. Nunca km nem km/h.

Cidades: cidades[]. ETA destino: mare.etaDia. Enchente: mare. Mar: mar. Meteo: meteo.

Turno: só fale se perguntarem (já acordaram com Alana). turnos[] no contexto. Não invente.

Relatório: 4 a 6 frases. Pergunta pontual: 1 a 3 frases. Consultoria (norma/estabilidade): 3 a 6 frases claras. Não comece com "Um momento" — o app já coloca isso.

Agora está em agora. App: derrota GPX; mar do casco; Open-Meteo; WP do arquivo. Não fale de código, API, chave, servidor.`;

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

  const payload = {
    temperature: 0.55,
    max_tokens: 220,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `CONTEXTO AO VIVO:\n${JSON.stringify(context)}`,
      },
      ...history.slice(-4).map((h) => ({
        role: h.role,
        content: clip(h.content, 280),
      })),
      { role: "user", content: user },
    ],
  };
  let res = await grokFetch("https://api.x.ai/v1/chat/completions", apiKey, {
    model: "grok-4-fast",
    ...payload,
  });
  if (!res.ok && (res.status === 400 || res.status === 404)) {
    res = await grokFetch("https://api.x.ai/v1/chat/completions", apiKey, {
      model: "grok-4.5",
      ...payload,
    });
  }
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Grok ${res.status} ${err.slice(0, 80)}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = clip(body.choices?.[0]?.message?.content ?? "", 900);
  if (!text) throw new Error("Grok vazio");

  const spoken = withHold(text);
  const audio = await speakGrok(apiKey, spoken);
  return { text: spoken, audio };
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
      text: clip(text, 900),
      voice_id: "ara",
      language: "pt-BR",
      output_format: {
        codec: "mp3",
        sample_rate: 16000,
        bit_rate: 64000,
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

async function postStt(
  apiKey: string,
  raw: Buffer,
  type: string,
  kind: string,
  language: string,
): Promise<Response> {
  const form = new FormData();
  form.append("model", "grok-voice-transcribe-2.0");
  form.append("language", language);
  form.append("format", "true");
  form.append("vad_threshold", "0.08");
  form.append("keyterm", "Alana");
  form.append("keyterm", "a Lana");
  form.append("keyterm", "Olana");
  form.append("file", new Blob([new Uint8Array(raw)], { type }), `clip.${kind}`);
  return fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    ignoreResponseError: true,
  } as FetchOpts);
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
  let res = await postStt(apiKey, raw, type, kind, "pt-BR");
  if (!res.ok) res = await postStt(apiKey, raw, type, kind, "pt");
  if (!res.ok) return "";
  const body = (await res.json()) as { text?: string; words?: { text?: string }[] };
  const fromWords = (body.words ?? []).map((w) => String(w.text ?? "").trim()).filter(Boolean).join(" ");
  return clip(String(body.text || fromWords || "").trim(), 480);
}

