import type { Config } from "@netlify/functions";
import { askGrokVoice, hearGrok, speakCanned, speakLine } from "../../src/lib/voice-api";
import { isCannedKind } from "../../src/lib/voice-copy";
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
    let body: {
      canned?: unknown;
      say?: string;
      hear?: string;
      mime?: string;
      message?: string;
      context?: VoiceContext;
      history?: VoiceTurn[];
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
    }
    if (isCannedKind(body.canned)) {
      const out = await speakCanned(key, body.canned);
      return Response.json({ ok: true, text: out.text, audio: out.audio });
    }
    const say = String(body.say ?? "").trim();
    if (say) {
      const out = await speakLine(key, say);
      return Response.json({ ok: true, text: out.text, audio: out.audio });
    }
    const hear = String(body.hear ?? "");
    if (hear.length > 80) {
      const text = await hearGrok(key, hear, String(body.mime ?? "audio/webm"));
      return Response.json({ ok: true, text });
    }
    const message = String(body.message ?? "").trim();
    if (!message) {
      return Response.json({ ok: false, error: "Fala vazia." }, { status: 400 });
    }
    const out = await askGrokVoice(
      key,
      message,
      body.context ?? ({} as VoiceContext),
      Array.isArray(body.history) ? body.history.slice(-8) : [],
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
