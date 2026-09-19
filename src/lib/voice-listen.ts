import { voicePlaybackCtx } from "./voice-play";

type HearFn = (text: string) => void;

let stream: MediaStream | null = null;
let src: MediaStreamAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let rec: MediaRecorder | null = null;
let raf = 0;
let wanted = false;
let paused = false;
let capturing = false;
let lastHear = 0;
let listenGen = 0;
let onHear: HearFn | null = null;
let floor = 0.02;
let aboveMs = 0;
let lastTs = 0;
let hearing = false;

function pickMime() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of types) {
    try {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ok */
    }
  }
  return "";
}

function setTracks(on: boolean) {
  if (!stream) return;
  for (const t of stream.getTracks()) t.enabled = on;
}

function bufB64(buf: ArrayBuffer) {
  const u = new Uint8Array(buf);
  let s = "";
  const step = 0x8000;
  for (let i = 0; i < u.length; i += step) {
    s += String.fromCharCode(...u.subarray(i, i + step));
  }
  return btoa(s);
}

export function pauseBridgeListen() {
  listenGen += 1;
  paused = true;
  capturing = false;
  try {
    rec?.stop();
  } catch {
    /* ok */
  }
  rec = null;
  setTracks(false);
}

export function resumeBridgeListen() {
  paused = false;
  setTracks(true);
}

export function stopBridgeListen() {
  listenGen += 1;
  wanted = false;
  paused = false;
  capturing = false;
  hearing = false;
  onHear = null;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  try {
    rec?.stop();
  } catch {
    /* ok */
  }
  rec = null;
  try {
    src?.disconnect();
  } catch {
    /* ok */
  }
  try {
    analyser?.disconnect();
  } catch {
    /* ok */
  }
  src = null;
  analyser = null;
  if (stream) {
    for (const t of stream.getTracks()) t.stop();
    stream = null;
  }
}

export async function startBridgeListen(hear: HearFn) {
  onHear = hear;
  wanted = true;
  paused = false;
  if (stream) {
    setTracks(true);
    if (!raf) {
      lastTs = performance.now();
      pump();
    }
    return;
  }
  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });
  if (!wanted) {
    for (const t of media.getTracks()) t.stop();
    return;
  }
  stream = media;
  const c = voicePlaybackCtx();
  if (c.state === "suspended") await c.resume();
  src = c.createMediaStreamSource(media);
  analyser = c.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.45;
  src.connect(analyser);
  lastTs = performance.now();
  pump();
}

function speechScore() {
  if (!analyser) return 0;
  const n = analyser.frequencyBinCount;
  const bins = new Uint8Array(n);
  analyser.getByteFrequencyData(bins);
  const hz = analyser.context.sampleRate / analyser.fftSize;
  let voice = 0;
  let low = 0;
  let vN = 0;
  let lN = 0;
  for (let i = 0; i < n; i++) {
    const f = i * hz;
    const a = bins[i]! / 255;
    if (f < 180) {
      low += a;
      lN += 1;
    } else if (f < 3400) {
      voice += a;
      vN += 1;
    }
  }
  const v = vN ? voice / vN : 0;
  const l = lN ? low / lN : 0;
  return Math.max(0, v - l * 0.45);
}

function pump() {
  if (!wanted) return;
  raf = requestAnimationFrame(pump);
  if (paused || capturing || hearing || !analyser) return;
  const now = performance.now();
  const dt = Math.min(80, now - lastTs);
  lastTs = now;
  const s = speechScore();
  if (s < floor * 1.25) floor = floor * 0.98 + Math.max(0.008, s) * 0.02;
  const trig = Math.max(0.048, floor * 2.8);
  if (s > trig) aboveMs += dt;
  else aboveMs = Math.max(0, aboveMs - dt * 1.8);
  if (aboveMs > 110 && now - lastHear > 500) {
    aboveMs = 0;
    void captureClip();
  }
}

async function captureClip() {
  if (!stream || capturing || paused || !wanted || hearing) return;
  capturing = true;
  lastHear = performance.now();
  const my = listenGen;
  const type = pickMime();
  const chunks: Blob[] = [];
  try {
    rec = type
      ? new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 24_000 })
      : new MediaRecorder(stream);
  } catch {
    capturing = false;
    return;
  }
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    rec!.onstop = () => resolve();
  });
  try {
    rec.start();
  } catch {
    capturing = false;
    rec = null;
    return;
  }
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (!wanted || paused || performance.now() - t0 > 2_200) {
        resolve();
        return;
      }
      if (performance.now() - t0 > 520 && speechScore() < Math.max(0.03, floor * 1.55)) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  try {
    if (rec && rec.state !== "inactive") rec.stop();
  } catch {
    /* ok */
  }
  await stopped;
  rec = null;
  capturing = false;
  if (my !== listenGen || !wanted || paused || !onHear) return;
  const blob = new Blob(chunks, { type: type || "audio/webm" });
  if (blob.size < 900) return;
  const buf = await blob.arrayBuffer();
  if (buf.byteLength < 900 || buf.byteLength > 280_000) return;
  hearing = true;
  try {
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hear: bufB64(buf), mime: blob.type || "audio/webm" }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json()) as { ok?: boolean; text?: string };
    const text = String(data.text ?? "").trim();
    if (data.ok && text && onHear && wanted && !paused && my === listenGen) onHear(text);
  } catch {
    /* silêncio no standby */
  } finally {
    hearing = false;
    lastHear = performance.now();
  }
}
