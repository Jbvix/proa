let ctx: AudioContext | null = null;
let node: AudioBufferSourceNode | null = null;
let html: HTMLAudioElement | null = null;

function audioCtx(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("sem audio");
    ctx = new Ctor();
  }
  return ctx;
}

export async function unlockVoice() {
  try {
    const c = audioCtx();
    if (c.state === "suspended") await c.resume();
  } catch {
    /* iPad libera no primeiro toque */
  }
  try {
    speechSynthesis.cancel();
  } catch {
    /* ok */
  }
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
}

function b64buf(b64: string): ArrayBuffer {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
}

async function playWebAudio(b64: string): Promise<number> {
  const c = audioCtx();
  if (c.state === "suspended") await c.resume();
  const buf = await c.decodeAudioData(b64buf(b64));
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  gain.gain.value = 0.86;
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
  return buf.duration * 1000;
}

async function playHtmlAudio(b64: string): Promise<number> {
  const url = URL.createObjectURL(new Blob([b64buf(b64)], { type: "audio/mpeg" }));
  const a = new Audio();
  a.preload = "auto";
  a.setAttribute("playsinline", "true");
  a.setAttribute("webkit-playsinline", "true");
  a.controls = false;
  a.loop = false;
  a.disableRemotePlayback = true;
  a.src = url;
  html = a;
  try {
    await a.play();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("play");
  }
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
  return ms;
}

export async function playVoiceMp3(b64: string): Promise<number> {
  stopVoice();
  try {
    return await playWebAudio(b64);
  } catch {
    return await playHtmlAudio(b64);
  }
}
