import { Buffer } from "node:buffer";
import type { VoiceContext, VoiceTurn } from "./voice-context";
import { ALANA_BYE, ALANA_GREET, isCannedKind, type CannedKind } from "./voice-copy";

export { ALANA_BYE, ALANA_GREET, isCannedKind, type CannedKind };

const CANNED: Record<CannedKind, string> = {
  greet: ALANA_GREET,
  bye: ALANA_BYE,
};

const SYSTEM = `Você é a Alana, rádio do passadiço do app Proa, da TugLife. Fala português do Brasil, bem informal, voz de bordo: direto, curto, sem firula, sem emoji. Quem te chama já sabe o nome — não se apresente em toda resposta e não fique repetindo "Alana", senão o microfone acorda de novo. Se perguntarem quem você é: "Sou a Alana, rádio do passadiço."

Explique o app quando pedirem:
- Derrota entra por arquivo GPX.
- Mar ao vivo (Hs, amplitude, período, ondas/min) sai dos sensores do aparelho no casco (heave, Hs=4σ).
- Vento e corrente vêm da Open-Meteo. Previsão de mar nos waypoints do GPX.
- RPM: o cara informa o regime; o app sugere a faixa de viagem.
- Mapa mostra o rebocador, SOG validada (GPS cruzado com a derrota), ETA e maré de chegada. Enchente = maré subindo; o app sugere SOG pra chegar nessa janela. Maré Open-Meteo é estimativa, não tábua do porto.

Responda parâmetros e contas com os números do CONTEXTO AO VIVO. Se faltar dado, fale isso. Não invente posição, Hs ou ETA. Respostas de 2 a 5 frases, fáceis de ouvir. Não fale de código, API, chave, servidor.`;

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
    temperature: 0.7,
    max_tokens: 280,
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
  const text = clip(body.choices?.[0]?.message?.content ?? "", 900);
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
  const hit = cannedStore().get(kind);
  if (hit) return { text, audio: hit };
  const audio = await speakGrok(apiKey, text);
  if (audio) cannedStore().set(kind, audio);
  return { text, audio };
}

async function speakGrok(apiKey: string, text: string): Promise<string | null> {
  try {
    const res = await grokFetch("https://api.x.ai/v1/tts", apiKey, {
      text: clip(text, 700),
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
