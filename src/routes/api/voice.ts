import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/lib/env.server";
import { isCannedKind } from "@/lib/voice-copy";
import { askGrokVoice, hearGrok, speakCanned, speakLine } from "@/lib/voice-api";
import type { VoiceContext, VoiceTurn } from "@/lib/voice-context";

function fail(status: number, error: string, detail?: string) {
  return Response.json(
    { ok: false, error },
    {
      status,
      headers: detail ? { "x-proa-voice": detail.slice(0, 80) } : undefined,
    },
  );
}

export const Route = createFileRoute("/api/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const key = env("XAI_API_KEY") ?? env("GROK_API_KEY") ?? "";
          if (!key) {
            return fail(503, "Assistente Grok indisponível neste aparelho.");
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
            body = (await request.json()) as typeof body;
          } catch {
            return fail(400, "Pedido inválido.");
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
          if (!message) return fail(400, "Fala vazia.");
          const out = await askGrokVoice(
            key,
            message,
            body.context ?? ({} as VoiceContext),
            Array.isArray(body.history) ? body.history.slice(-4) : [],
          );
          return Response.json({ ok: true, text: out.text, audio: out.audio });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "falha";
          return fail(502, "Não rolou falar com o Grok agora. Tenta de novo.", msg);
        }
      },
    },
  },
});
