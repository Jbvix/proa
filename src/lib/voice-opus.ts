/**
 * Proa · TugLife Systems — Codificação Opus do clipe de voz (WebCodecs)
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.13.0  (módulo novo nesta versão)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * POR QUE ISTO EXISTE (P11, item 11.4)
 * O clipe que sobe pro transcritor era WAV: 42 kB por segundo em base64. Aqui
 * o mesmo PCM de 16 kHz que o VAD e a impressão vocal já usam passa pelo
 * codificador Opus que o Chrome traz de fábrica (`AudioEncoder`) e vira
 * ~3 kB por segundo. O anel PCM, o VAD e a impressão NÃO mudam — só o que
 * atravessa a rede.
 *
 * ESTE MÓDULO É A PONTE COM O NAVEGADOR. O formato do arquivo (Ogg, cabeçalhos,
 * CRC, laçamento) está em `ogg-opus.ts`, puro e testado. Aqui só se fala com
 * o `AudioEncoder` — que não existe em Node e portanto não se testa aqui.
 *
 * DEVOLVE `null` QUANDO NÃO DÁ, e `null` quer dizer "manda WAV como antes":
 *   - sem `AudioEncoder` (navegador antigo, ou iOS sem WebCodecs de áudio)
 *   - Opus a 16 kHz mono não suportado (a resposta de `isConfigSupported`
 *     fica em cache: pergunta-se uma vez por sessão, não por clipe)
 *   - o codificador falhou ou não devolveu pacote nenhum
 * A pergunta nunca fica sem subir por causa do codec.
 * ---------------------------------------------------------------------------
 */
import { muxOggOpus, type OpusPacket } from "./ogg-opus";

/** Taxa alvo. 24 kbps é fala nítida em Opus; abaixo de 16 a sibilância some. */
export const OPUS_BITRATE = 24_000;
/** Duração de cada `AudioData` alimentado ao codificador, em ms. 20 ms é o quadro nativo do Opus. */
const FRAME_MS = 20;

type Support = "unknown" | "yes" | "no";
let support: Support = "unknown";

function encoderConfig(hz: number): AudioEncoderConfig {
  return { codec: "opus", sampleRate: hz, numberOfChannels: 1, bitrate: OPUS_BITRATE };
}

/** O navegador codifica Opus mono nesta taxa? Perguntado uma vez por sessão. */
async function opusSupported(hz: number): Promise<boolean> {
  if (support !== "unknown") return support === "yes";
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") {
    support = "no";
    return false;
  }
  try {
    const r = await AudioEncoder.isConfigSupported(encoderConfig(hz));
    support = r.supported ? "yes" : "no";
  } catch {
    support = "no";
  }
  return support === "yes";
}

/**
 * Codifica `pcm` (Int16 mono a `hz`) em Ogg Opus. `null` = manda WAV.
 *
 * Comportamento conforme as variáveis:
 *   `pcm` vazio            → `null`
 *   sem suporte            → `null`, sem tentar de novo nesta sessão
 *   codificador com erro   → `null` (o `error` do encoder rejeita a promessa)
 *   ok                     → bytes do arquivo Ogg, ~3 kB por segundo de fala
 *
 * Os quadros vão em 20 ms com carimbo de tempo crescente em µs; o grânulo de
 * cada pacote sai de `chunk.duration`, convertido para 48 kHz como o RFC
 * 7845 manda, qualquer que seja a taxa de entrada.
 */
export async function encodeOpusClip(pcm: Int16Array, hz: number): Promise<Uint8Array | null> {
  if (!pcm.length) return null;
  if (!(await opusSupported(hz))) return null;

  const packets: OpusPacket[] = [];
  let failed: unknown = null;
  const enc = new AudioEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      // duration em µs → amostras a 48 kHz. Sem duration, assume o quadro de 20 ms.
      const us = chunk.duration ?? FRAME_MS * 1000;
      packets.push({ data, samples48: Math.round(us * 0.048) });
    },
    error: (e) => {
      failed = e;
    },
  });
  try {
    enc.configure(encoderConfig(hz));
    const frame = Math.round((hz * FRAME_MS) / 1000);
    for (let at = 0, ts = 0; at < pcm.length; at += frame) {
      const n = Math.min(frame, pcm.length - at);
      const ad = new AudioData({
        format: "s16",
        sampleRate: hz,
        numberOfFrames: n,
        numberOfChannels: 1,
        timestamp: ts,
        // `slice`, não `subarray`: o tipo `BufferSource` exige um ArrayBuffer
        // próprio, e 320 amostras copiadas por quadro custam nada.
        data: pcm.slice(at, at + n),
      });
      enc.encode(ad);
      ad.close();
      ts += Math.round((n / hz) * 1e6);
    }
    await enc.flush();
  } catch {
    failed = failed ?? new Error("encode");
  } finally {
    try {
      enc.close();
    } catch {
      /* já fechado */
    }
  }
  if (failed || !packets.length) return null;
  return muxOggOpus(packets, { inputRate: hz });
}
