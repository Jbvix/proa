import type { Config } from "@netlify/functions";
import { askGrokVoice } from "../../src/lib/voice-api";
import type { VoiceContext, VoiceTurn } from "../../src/lib/voice-context";

export default async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const key = (process.env.XAI_API_KEY ?? process.env.GROK_API_KEY ?? "").trim();
    if (!key) {
      return Response.json(
        { ok: false, error: "Assistente Grok indisponível neste aparelho." },
        { status: 503 },
      );
    }
    let body: { message?: string; context?: VoiceContext; history?: VoiceTurn[] };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
    }
    const message = String(body.message ?? "").trim();
    if (!message) {
      return Response.json({ ok: false, error: "Fala vazia." }, { status: 400 });
    }
    const out = await askGrokVoice(
      key,
      message,
      body.context ?? ({} as VoiceContext),
      Array.isArray(body.history) ? body.history.slice(-6) : [],
    );
    return Response.json({ ok: true, text: out.text, audio: out.audio });
  } catch {
    return Response.json(
      { ok: false, error: "Não rolou falar com o Grok agora. Tenta de novo." },
      { status: 502 },
    );
  }
};

export const config: Config = {
  path: "/api/voice",
};
