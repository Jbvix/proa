/**
 * Proa · TugLife Systems — Reprodução da fala da Lara
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.11.0
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * MODIFICAÇÕES NA 1.11.0 (P11, item 11.1)
 *  - `speakLocal(text)`: fala pela voz do próprio aparelho (`speechSynthesis`),
 *    sem rede, para as respostas que nascem no tablet. A escolha da voz é de
 *    `voice-local.ts` (puro, testado). Devolve `null` quando não há voz em
 *    português ou o motor não começa em 1,5 s — e aí o chamador volta à rede.
 *    A espera fica limitada por construção: no pior caso custa 1,5 s a mais,
 *    no melhor poupa 1 a 3 s.
 *  - Cabeçalho de módulo adicionado; o arquivo não tinha.
 * ---------------------------------------------------------------------------
 */
import { LOCAL_START_TIMEOUT_MS, localSpeechCapMs, pickLocalVoice } from "./voice-local";

let ctx: AudioContext | null = null;
let node: AudioBufferSourceNode | null = null;
let html: HTMLAudioElement | null = null;
let aecStream: MediaStream | null = null;
let aecSrc: MediaStreamAudioSourceNode | null = null;
let aecGain: GainNode | null = null;
let aecGen = 0;

export function isAndroidVoice() {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export function voiceCool() {
  if (isAndroidVoice()) return { cool: 420, tail: 160, flush: 120 };
  return { cool: 700, tail: 220, flush: 180 };
}

export function voicePlaybackCtx(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("sem audio");
    try {
      ctx = new Ctor({ latencyHint: "playback" });
    } catch {
      ctx = new Ctor();
    }
  }
  return ctx;
}

function audioCtx(): AudioContext {
  return voicePlaybackCtx();
}

function hushMediaSession() {
  const ms = navigator.mediaSession;
  if (!ms) return;
  try {
    ms.metadata = null;
    ms.playbackState = "none";
    for (const a of [
      "play",
      "pause",
      "stop",
      "seekbackward",
      "seekforward",
      "previoustrack",
      "nexttrack",
    ] as const) {
      try {
        ms.setActionHandler(a, null);
      } catch {
        /* ok */
      }
    }
  } catch {
    /* ok */
  }
}

/** iOS only: HAL echo cancel while she talks. On Android this path is call-mode sidetone. */
export async function holdEchoCanceller() {
  if (isAndroidVoice()) return;
  const my = ++aecGen;
  if (aecStream) return;
  if (!navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    if (my !== aecGen) {
      for (const t of stream.getTracks()) t.stop();
      return;
    }
    aecStream = stream;
    const c = audioCtx();
    if (c.state === "suspended") await c.resume();
    if (my !== aecGen) {
      releaseEchoCanceller();
      return;
    }
    aecSrc = c.createMediaStreamSource(stream);
    aecGain = c.createGain();
    aecGain.gain.value = 0;
    aecSrc.connect(aecGain);
  } catch {
    if (my === aecGen) aecStream = null;
  }
}

export function releaseEchoCanceller() {
  aecGen += 1;
  try {
    aecSrc?.disconnect();
  } catch {
    /* ok */
  }
  aecSrc = null;
  aecGain = null;
  if (aecStream) {
    for (const t of aecStream.getTracks()) t.stop();
    aecStream = null;
  }
}

export async function unlockVoice() {
  try {
    if (ctx && ctx.state === "suspended") await ctx.resume();
  } catch {
    /* primeiro toque */
  }
  try {
    speechSynthesis.cancel();
  } catch {
    /* ok */
  }
  hushMediaSession();
}

export function stopVoice() {
  try {
    node?.stop();
  } catch {
    /* already stopped */
  }
  node = null;
  if (html) {
    html.pause();
    html.removeAttribute("src");
    html.load();
    html = null;
  }
  try {
    speechSynthesis.cancel();
  } catch {
    /* ok */
  }
  hushMediaSession();
}

/** Utterance em curso, pra `stopVoice()` saber que a linha é nossa. */
let localUtter: SpeechSynthesisUtterance | null = null;

/**
 * Lista de vozes do navegador. No Android ela chega vazia na primeira chamada
 * e só se enche depois de `voiceschanged`; espera-se por isso um pouco, mas
 * não muito — o objetivo é responder rápido, não esperar a lista perfeita.
 */
async function localVoices(): Promise<SpeechSynthesisVoice[]> {
  const have = speechSynthesis.getVoices();
  if (have.length) return have;
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(speechSynthesis.getVoices()), 400);
    speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        window.clearTimeout(t);
        resolve(speechSynthesis.getVoices());
      },
      { once: true },
    );
  });
}

/**
 * Fala `text` pela voz local do aparelho. Devolve a duração em ms, ou `null`
 * se não deu — e `null` significa "vai pela rede", nunca "fica mudo".
 *
 * Comportamento conforme as variáveis:
 *   sem `speechSynthesis`            → `null` imediato
 *   sem voz em português             → `null` imediato (não lê pt-BR com voz
 *                                       inglesa)
 *   motor não começa em 1,5 s        → cancela, `null`
 *   `onerror` antes de `onstart`     → `null`
 *   `onerror` DEPOIS de começar      → resolve com o que tocou: repetir pela
 *                                       rede seria dizer a frase duas vezes
 *   `onend` não vem (motor travou)   → solta no teto de `localSpeechCapMs`
 *
 * O volume acompanha o ganho do MP3 (0,72 no Android, 0,86 fora) pra que a
 * troca de voz não venha com troca de altura.
 */
export async function speakLocal(text: string): Promise<number | null> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const line = text.trim();
  if (!line) return null;
  let voices: SpeechSynthesisVoice[];
  try {
    voices = await localVoices();
  } catch {
    return null;
  }
  const voice = pickLocalVoice(voices);
  if (!voice) return null;
  stopVoice();
  hushMediaSession();
  const u = new SpeechSynthesisUtterance(line);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 1;
  u.pitch = 1;
  u.volume = isAndroidVoice() ? 0.72 : 0.86;
  localUtter = u;
  const t0 = performance.now();
  return new Promise<number | null>((resolve) => {
    let started = false;
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(startT);
      window.clearTimeout(capT);
      if (localUtter === u) localUtter = null;
      resolve(v);
    };
    const startT = window.setTimeout(() => {
      if (started) return;
      try {
        speechSynthesis.cancel();
      } catch {
        /* ok */
      }
      finish(null);
    }, LOCAL_START_TIMEOUT_MS);
    const capT = window.setTimeout(() => finish(performance.now() - t0), localSpeechCapMs(line));
    u.onstart = () => {
      started = true;
    };
    u.onend = () => finish(performance.now() - t0);
    u.onerror = () => finish(started ? performance.now() - t0 : null);
    try {
      speechSynthesis.speak(u);
    } catch {
      finish(null);
    }
  });
}

function b64buf(b64: string): ArrayBuffer {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
}

const decoded = new Map<string, AudioBuffer>();

function decodeKey(b64: string) {
  return `${b64.length}:${b64.slice(0, 40)}:${b64.slice(-20)}`;
}

async function decodeMp3(c: AudioContext, b64: string): Promise<AudioBuffer> {
  const hit = decoded.get(decodeKey(b64));
  if (hit) return hit;
  const copy = b64buf(b64);
  let buf: AudioBuffer;
  try {
    buf = await c.decodeAudioData(copy.slice(0));
  } catch {
    buf = await new Promise((resolve, reject) => {
      const again = b64buf(b64);
      void c.decodeAudioData(again, resolve, reject);
    });
  }
  if (decoded.size > 8) decoded.clear();
  decoded.set(decodeKey(b64), buf);
  return buf;
}

async function playWebAudio(b64: string): Promise<number> {
  const c = audioCtx();
  if (c.state === "suspended") await c.resume();
  hushMediaSession();
  const buf = await decodeMp3(c, b64);
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  gain.gain.value = isAndroidVoice() ? 0.72 : 0.86;
  src.connect(gain);
  gain.connect(c.destination);
  node = src;
  await new Promise<void>((resolve) => {
    const ms = Math.min(90_000, Math.max(500, buf.duration * 1000 + 280));
    const t = window.setTimeout(() => {
      if (node === src) node = null;
      resolve();
    }, ms);
    src.onended = () => {
      window.clearTimeout(t);
      if (node === src) node = null;
      resolve();
    };
    src.start();
  });
  try {
    src.disconnect();
    gain.disconnect();
  } catch {
    /* ok */
  }
  hushMediaSession();
  return buf.duration * 1000;
}

async function playHtmlAudio(b64: string): Promise<number> {
  hushMediaSession();
  const url = URL.createObjectURL(new Blob([b64buf(b64)], { type: "audio/mpeg" }));
  const a = new Audio();
  a.preload = "auto";
  a.setAttribute("playsinline", "true");
  a.setAttribute("webkit-playsinline", "true");
  a.controls = false;
  a.loop = false;
  a.volume = 1;
  a.disableRemotePlayback = true;
  a.src = url;
  html = a;
  try {
    await a.play();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("play");
  }
  hushMediaSession();
  await new Promise<void>((resolve) => {
    const wait = Number.isFinite(a.duration) ? a.duration * 1000 + 280 : 12_000;
    const t = window.setTimeout(resolve, Math.min(90_000, Math.max(500, wait)));
    a.onended = () => {
      window.clearTimeout(t);
      resolve();
    };
    a.onerror = () => {
      window.clearTimeout(t);
      resolve();
    };
  });
  const ms = Number.isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : 0;
  a.pause();
  a.removeAttribute("src");
  a.load();
  URL.revokeObjectURL(url);
  if (html === a) html = null;
  hushMediaSession();
  return ms;
}

export async function playVoiceMp3(b64: string): Promise<number> {
  stopVoice();
  try {
    return await playWebAudio(b64);
  } catch {
    try {
      return await playWebAudio(b64);
    } catch {
      if (isAndroidVoice()) return 0;
      return await playHtmlAudio(b64);
    }
  }
}
