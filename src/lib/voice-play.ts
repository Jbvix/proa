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

async function playWebAudio(b64: string): Promise<void> {
  const c = audioCtx();
  if (c.state === "suspended") await c.resume();
  const buf = await c.decodeAudioData(b64buf(b64));
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
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
}

async function playHtmlAudio(b64: string): Promise<void> {
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
    const ms = Number.isFinite(a.duration) ? a.duration * 1000 + 200 : 8_000;
    const t = window.setTimeout(resolve, Math.min(20_000, ms));
    a.onended = () => {
      window.clearTimeout(t);
      resolve();
    };
    a.onerror = () => {
      window.clearTimeout(t);
      resolve();
    };
  });
  a.pause();
  a.removeAttribute("src");
  a.load();
  URL.revokeObjectURL(url);
  if (html === a) html = null;
}

export async function playVoiceMp3(b64: string): Promise<void> {
  stopVoice();
  try {
    await playWebAudio(b64);
  } catch {
    await playHtmlAudio(b64);
  }
}
