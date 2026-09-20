/**
 * Proa · TugLife Systems — Handler de /api/voice
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.3.0  (módulo novo nesta versão)
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * POR QUE ESTE MÓDULO EXISTE
 * Mesma história de `meteo-handler.ts`: dois pontos de entrada vivos em alvos
 * diferentes, duas cópias da lógica, e já divergindo — a rota Nitro devolvia o
 * cabeçalho de diagnóstico `x-proa-voice` e a function Netlify não. Agora a
 * lógica mora aqui, e o diagnóstico vale nos dois.
 *
 * O ENDPOINT FAZ QUATRO COISAS, nesta ordem de precedência:
 *  1. `canned`  — fala pronta, com cache de áudio no servidor
 *  2. `say`     — texto arbitrário para voz
 *  3. `hear`    — áudio em base64 para transcrição (só acima de 80 caracteres,
 *                 abaixo disso não há clipe que preste)
 *  4. `message` — turno de conversa: chat com contexto vivo, e depois voz
 * ---------------------------------------------------------------------------
 */
import { VOICE_RULES, guardRequest, parseAllowedOrigins } from "../api-guard.ts";
import { env } from "../env.server.ts";
import { askGrokVoice, hearGrok, speakCanned, speakLine } from "../voice-api.ts";
import type { VoiceContext, VoiceTurn } from "../voice-context.ts";
import { isCannedKind } from "../voice-copy.ts";

type VoiceBody = {
  canned?: unknown;
  say?: string;
  hear?: string;
  mime?: string;
  message?: string;
  context?: VoiceContext;
  history?: VoiceTurn[];
};

/**
 * Recusa com mensagem de passadiço. `detail` vai só no cabeçalho de
 * diagnóstico, aparado em 80 caracteres — ajuda a depurar sem despejar entranha
 * do servidor no corpo da resposta.
 */
function fail(status: number, error: string, detail?: string) {
  return Response.json(
    { ok: false, error },
    {
      status,
      headers: detail ? { "x-proa-voice": detail.slice(0, 80) } : undefined,
    },
  );
}

export async function handleVoice(req: Request): Promise<Response> {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // A voz é o endpoint caro: transcrição, chat e fala, tudo pago. O porteiro
    // vem antes de tudo, inclusive de ler o corpo.
    const barrado = guardRequest(req, {
      bucket: "voice",
      rules: VOICE_RULES,
      extraOrigins: parseAllowedOrigins(env("PROA_ALLOWED_ORIGINS")),
    });
    if (barrado) return barrado;

    const key = env("XAI_API_KEY") ?? env("GROK_API_KEY") ?? "";
    if (!key) return fail(503, "Assistente Grok indisponível neste aparelho.");

    let body: VoiceBody;
    try {
      body = (await req.json()) as VoiceBody;
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
      // Quatro turnos de memória: o bastante para a Lara não perder o fio,
      // pouco o bastante para não inflar o custo de cada pergunta.
      Array.isArray(body.history) ? body.history.slice(-4) : [],
    );
    return Response.json({ ok: true, text: out.text, audio: out.audio });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "falha";
    return fail(502, "Não rolou falar com o Grok agora. Tenta de novo.", msg);
  }
}
