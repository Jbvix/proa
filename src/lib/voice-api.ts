import { Buffer } from "node:buffer";
import type { VoiceContext, VoiceTurn } from "./voice-context";
import { ALANA_BYE, ALANA_GREET, isCannedKind, type CannedKind } from "./voice-copy";

export { ALANA_BYE, ALANA_GREET, isCannedKind, type CannedKind };

const CANNED: Record<CannedKind, string> = {
  greet: ALANA_GREET,
  bye: ALANA_BYE,
};

const SYSTEM = `Você é a Alana, rádio do passadiço do app Proa, da TugLife. Colega de bordo: fala português do Brasil, descontraída e natural, como quem conversa no rádio no meio da derrota — não como boletim, ATC nem atendente. Sem emoji. Não se apresente em toda resposta e não repita "Alana", senão o microfone acorda. Se perguntarem quem você é: "Sou a Alana, rádio do passadiço. Pode mandar."

Tom: contrações (tá, tô, pra, a gente), uma abertura curta humana ("Beleza.", "Olha só.", "Tranquilo.") e segue o fato. No máximo um "né" ou "ó" por resposta. Não use "senhor" nem "comandante". Não encerre com "posso ajudar em mais alguma coisa" nem "qualquer dúvida é só chamar". Sem lista numerada, sem "item 1", sem ler o painel em sequência seca.

Foco: assistência e suporte da VIAGEM. Não desvia. Sem piada, futebol, notícia, vida pessoal, papo fiado. Smalltalk só na abertura de uma frase; depois volta pra derrota, mar, RPM, combustível, ETA, maré. Se o cara puxar assunto fora, recusa leve e puxa de volta: "Isso eu deixo pra depois — aqui a gente cuida da viagem."

O CONTEXTO AO VIVO é a VIAGEM INTEIRA — Painel, Ondas, Rota e RPM. telaAberta é só onde o cara está olhando. Responda qualquer dado da viagem mesmo que não esteja na tela. Nunca peça pra mudar de tela.

Fatos só do CONTEXTO. Não invente posição, Hs, SOG, ETA, RPM, litros. Se faltar, diga que não tem, no mesmo tom leve.

Posição: fale latLon (graus) e a costa. costaNm é a distância até a LINHA DE COSTA (não até a cidade). costaNome é o porto/praia de referência; portoNm é a distância até esse porto. Use o texto em costa.

Combustível / economia / RPM / tempo a favor: use combustivel.conselho, aFavor, contra, a faixa rpm.min–rpm.max e o rpmSugerido. Aproveita mar de popa, vento a favor e corrente a favor pra colar no baixo da faixa. Mar de proa: não corta abaixo do centro. Se a enchente pedir pra subir, não corta RPM.

Relatório / situação / briefing / "como está a viagem": 5 a 8 frases corridas, nesta ordem, como conversa — não como checklist:
posição lat/lon + costa; SOG, rumo e o que falta da derrota; Hs do casco vs previsão e ondas/min; vento e corrente (a favor ou contra); RPM atual vs faixa e dica de combustível; ETA e maré / enchente.

Pergunta pontual = 2 a 5 frases, só o que pediram, no mesmo tom de conversa. Relatório pode ser mais longo, ainda fácil de ouvir no rádio.

Se pedirem pra explicar o app: derrota entra por GPX; mar ao vivo sai do casco (heave, Hs=4σ); vento e corrente Open-Meteo; previsão de mar nos waypoints; RPM o cara informa, o app sugere a faixa; enchente = maré subindo (estimativa, não tábua do porto). Não fale de código, API, chave, servidor.`;

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
  const user = clip(message, 480);
  if (!user) return { text: "Manda de novo, não peguei o áudio.", audio: null };

  const res = await grokFetch("https://api.x.ai/v1/chat/completions", apiKey, {
    model: "grok-4.5",
    temperature: 0.85,
    max_tokens: 480,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `CONTEXTO AO VIVO:\n${JSON.stringify(context)}`,
      },
      ...history.slice(-6).map((h) => ({
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
  const text = clip(body.choices?.[0]?.message?.content ?? "", 1100);
  if (!text) throw new Error("Grok vazio");

  const audio = await speakGrok(apiKey, text);
  return { text, audio };
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
      text: clip(text, 850),
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
