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
  if (isAndroidVoice()) return { cool: 900, tail: 280, flush: 200 };
  return { cool: 1_500, tail: 350, flush: 350 };
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

function b64buf(b64: string): ArrayBuffer {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
}

async function decodeMp3(c: AudioContext, b64: string): Promise<AudioBuffer> {
  const copy = b64buf(b64);
  try {
    return await c.decodeAudioData(copy.slice(0));
  } catch {
    return await new Promise((resolve, reject) => {
      const again = b64buf(b64);
      void c.decodeAudioData(again, resolve, reject);
    });
  }
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
    const t = window.setTimeout(resolve, Math.min(20_000, buf.duration * 1000 + 120));
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
    const wait = Number.isFinite(a.duration) ? a.duration * 1000 + 200 : 8_000;
    const t = window.setTimeout(resolve, Math.min(20_000, wait));
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
