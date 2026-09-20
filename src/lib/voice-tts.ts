/**
 * Proa · TugLife Systems — Fala da Lara: cache e busca de áudio
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.4.0  (módulo novo nesta versão)
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * POR QUE ISTO EXISTE
 * Extraído de `voice-assistant.tsx`. Cache de áudio e chamada de rede não têm
 * nada a ver com renderizar um botão, e enterrado no componente ninguém
 * conseguia testar a regra do cache.
 *
 * AS FALAS PRONTAS TÊM CACHE, AS LIVRES NÃO. A Lara repete as mesmas poucas
 * frases o tempo todo — cumprimento, despedida, "não peguei", aviso de XTE.
 * Sintetizar de novo a cada vez é pagar duas vezes pelo mesmo áudio e fazer o
 * passadiço esperar. O áudio pronto fica no `localStorage` do aparelho, que é
 * onde todo o resto do Proa já guarda seu estado.
 * ---------------------------------------------------------------------------
 */
import type { CannedKind } from "./voice-copy.ts";

/** Chave por fala. O sufixo de versão força renovar se a frase mudar. */
export const TTS_CACHE_KEYS = {
  greet: "proa-lara-tts-greet-v1",
  bye: "proa-lara-tts-bye-v1",
  miss: "proa-lara-tts-miss-v1",
  xte: "proa-lara-tts-xte-v1",
  roll: "proa-lara-tts-roll-v1",
} as const;

/**
 * Piso de tamanho do áudio em base64, em caracteres.
 *
 * Abaixo disso não é MP3, é resto de resposta de erro que entrou no cache. Um
 * clipe de fala real, mesmo curtíssimo, passa de 80 caracteres com folga.
 */
export const TTS_MIN_B64 = 80;

/**
 * Áudio guardado para esta fala, ou `null`.
 *
 * Nunca lança: `localStorage` pode estar bloqueado (janela anônima, cookies de
 * terceiro barrados) e o passadiço não pode ficar sem a Lara por isso.
 */
export function readTtsCache(kind: CannedKind): string | null {
  try {
    const v = localStorage.getItem(TTS_CACHE_KEYS[kind]);
    return v && v.length > TTS_MIN_B64 ? v : null;
  } catch {
    return null;
  }
}

/** Guarda o áudio. Cota estourada é silenciosa — perder cache não é falha. */
export function writeTtsCache(kind: CannedKind, audio: string) {
  try {
    localStorage.setItem(TTS_CACHE_KEYS[kind], audio);
  } catch {
    /* cota cheia ou storage bloqueado */
  }
}

type VoiceReply = { ok?: boolean; audio?: string | null };

/** Sintetiza texto livre. 16 s de teto: acima disso o passadiço já desistiu. */
export async function fetchSay(text: string): Promise<string | null> {
  const res = await fetch("/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ say: text }),
    signal: AbortSignal.timeout(16_000),
  });
  const data = (await res.json()) as VoiceReply;
  return data.ok && data.audio ? data.audio : null;
}

/**
 * Fala pronta: cache primeiro, rede depois, e o que vier da rede fica guardado.
 * Teto de 20 s, mais folgado que o texto livre porque só acontece uma vez.
 */
export async function fetchCanned(kind: CannedKind): Promise<string | null> {
  const guardado = readTtsCache(kind);
  if (guardado) return guardado;
  const res = await fetch("/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ canned: kind }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as VoiceReply;
  if (data.ok && data.audio) {
    writeTtsCache(kind, data.audio);
    return data.audio;
  }
  return null;
}

/**
 * Adianta as falas que a Lara quase certamente vai usar.
 *
 * Chamado no primeiro toque na tela, que é quando o navegador libera áudio.
 * Sem isso, o primeiro "oi" da viagem espera a síntese inteira — e a primeira
 * impressão de um assistente de voz é justamente quanto ele demora a responder.
 */
export function prefetchCanned() {
  void fetchCanned("greet");
  void fetchCanned("miss");
  void fetchCanned("xte");
}
