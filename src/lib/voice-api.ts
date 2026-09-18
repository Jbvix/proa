import { Buffer } from "node:buffer";
import type { VoiceContext, VoiceTurn } from "./voice-context";

const SYSTEM = `Você é o assistente de passadiço do app Proa, da TugLife. Fala português do Brasil, bem informal, como um mestre de rebocador no rádio: direto, curto, sem firula, sem emoji.

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

async function speakGrok(apiKey: string, text: string): Promise<string | null> {
  try {
    const res = await grokFetch("https://api.x.ai/v1/tts", apiKey, {
      text: clip(text, 700),
      voice_id: "leo",
      language: "pt-BR",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 80) return null;
    return buf.toString("base64");
  } catch {
    return null;
  }
}
