import {
  BRIDGE_VAD,
  PcmRing,
  VAD_IDLE,
  downsample,
  encodeWavPcm16,
  floatTo16,
  rmsOf,
  tickVad,
  type VadState,
} from "./voice-pcm";

export type HearMeta = { ptt?: boolean; miss?: boolean };

type HearFn = (text: string, meta?: HearMeta) => void;

export type VoiceSnap = {
  state:
    | "idle"
    | "connecting"
    | "listening"
    | "user_speaking"
    | "waiting"
    | "suspended"
    | "mic_lost"
    | "recovering";
  track: "off" | "live" | "muted" | "ended";
  ctx: string;
  inputHz: number;
  pcmHz: number;
  level: number;
  vad: "speech" | "silence";
  framesIn: number;
  clipsSent: number;
  lastFrameAgeMs: number;
  hangMs: number;
  ptt: boolean;
  visibility: "visible" | "hidden";
  clipping: boolean;
  lastClip: "ok" | "empty" | "short" | "fail" | "none";
};

const PCM_HZ = 16_000;
const RING_S = 11;

let stream: MediaStream | null = null;
let cap: AudioContext | null = null;
let src: MediaStreamAudioSourceNode | null = null;
let worklet: AudioWorkletNode | null = null;
let script: ScriptProcessorNode | null = null;
let scriptMute: GainNode | null = null;
let wanted = false;
let paused = false;
let pttMode = false;
let pttHeld = false;
let recovering = false;
let hearing = false;
let onHear: HearFn | null = null;
let onClipStart: (() => void) | null = null;
let ring: PcmRing | null = null;
let vad: VadState = { ...VAD_IDLE };
let inputHz = 48_000;
let lastFrameAt = 0;
let lastTs = 0;
let framesIn = 0;
let clipsSent = 0;
let speechStartedAt = 0;
let level = 0;
let clipping = false;
let lastClip: VoiceSnap["lastClip"] = "none";
let pipeState: VoiceSnap["state"] = "idle";
let trackState: VoiceSnap["track"] = "off";
let vis: "visible" | "hidden" = "visible";
let raf = 0;
let workletUrl: string | null = null;
let deviceBound = false;

const listeners = new Set<(s: VoiceSnap) => void>();

function captureCtx(): AudioContext {
  if (!cap) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("sem audio");
    try {
      cap = new Ctor({ latencyHint: "interactive" });
    } catch {
      cap = new Ctor();
    }
    cap.addEventListener("statechange", () => {
      if (cap?.state === "suspended" && wanted) pipeState = "suspended";
      else if (wanted && !paused && pipeState === "suspended") pipeState = "listening";
      emit();
    });
  }
  return cap;
}

export async function resumeListenCtx() {
  try {
    if (cap && cap.state === "suspended") await cap.resume();
  } catch {
    /* gesto */
  }
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

function emit() {
  const snap = getVoiceSnap();
  for (const fn of listeners) fn(snap);
}

export function getVoiceSnap(): VoiceSnap {
  return {
    state: pipeState,
    track: trackState,
    ctx: cap?.state ?? "none",
    inputHz: Math.round(inputHz),
    pcmHz: PCM_HZ,
    level: Number(level.toFixed(3)),
    vad: vad.speaking || pttHeld ? "speech" : "silence",
    framesIn,
    clipsSent,
    lastFrameAgeMs: lastFrameAt ? Math.round(performance.now() - lastFrameAt) : 0,
    hangMs: BRIDGE_VAD.hangShortMs,
    ptt: pttMode,
    visibility: vis,
    clipping,
    lastClip,
  };
}

export function subscribeVoiceSnap(fn: (s: VoiceSnap) => void) {
  listeners.add(fn);
  fn(getVoiceSnap());
  return () => {
    listeners.delete(fn);
  };
}

function bindTrack(t: MediaStreamTrack) {
  trackState = t.muted ? "muted" : "live";
  t.onended = () => {
    trackState = "ended";
    pipeState = "mic_lost";
    emit();
    if (wanted) void recoverMic();
  };
  t.onmute = () => {
    trackState = "muted";
    emit();
  };
  t.onunmute = () => {
    trackState = "live";
    if (wanted && pipeState === "mic_lost") pipeState = "listening";
    emit();
  };
}

function bindDevices() {
  if (deviceBound || !navigator.mediaDevices) return;
  deviceBound = true;
  navigator.mediaDevices.addEventListener("devicechange", () => {
    const live = stream?.getAudioTracks().some((t) => t.readyState === "live");
    if (wanted && !live) void recoverMic();
  });
  document.addEventListener("visibilitychange", () => {
    vis = document.hidden ? "hidden" : "visible";
    if (document.hidden) {
      if (wanted) pipeState = "suspended";
    } else if (wanted) {
      void resumeListenCtx().then(() => {
        if (wanted && !paused && trackState === "live") pipeState = pttHeld || vad.speaking ? "user_speaking" : "listening";
        emit();
      });
    }
    emit();
  });
}

function muteWorklet(on: boolean) {
  try {
    worklet?.port.postMessage(on ? "mute" : "unmute");
  } catch {
    /* ok */
  }
}

export function setBridgePtt(on: boolean) {
  pttMode = on;
  if (on) {
    vad = { ...VAD_IDLE };
    pttHeld = false;
  }
  emit();
}

export function beginBridgePtt() {
  if (!wanted || paused || hearing) return;
  pttHeld = true;
  speechStartedAt = performance.now();
  pipeState = "user_speaking";
  emit();
}

export function endBridgePtt() {
  if (!pttHeld) return;
  pttHeld = false;
  const held = performance.now() - speechStartedAt;
  if (held < 280) {
    pipeState = wanted ? "listening" : "idle";
    emit();
    return;
  }
  void sendClip(true);
}

async function recoverMic() {
  if (!wanted || recovering) return;
  recovering = true;
  pipeState = "recovering";
  emit();
  try {
    const live = stream?.getAudioTracks().some((t) => t.readyState === "live");
    if (live) {
      pipeState = "listening";
      return;
    }
    teardownGraph(false);
    await openMic();
  } catch {
    pipeState = "mic_lost";
  } finally {
    recovering = false;
    emit();
  }
}

function teardownGraph(stopTracks: boolean) {
  muteWorklet(true);
  try {
    worklet?.disconnect();
  } catch {
    /* ok */
  }
  try {
    script?.disconnect();
  } catch {
    /* ok */
  }
  try {
    scriptMute?.disconnect();
  } catch {
    /* ok */
  }
  try {
    src?.disconnect();
  } catch {
    /* ok */
  }
  worklet = null;
  script = null;
  scriptMute = null;
  src = null;
  if (stopTracks && stream) {
    for (const t of stream.getTracks()) t.stop();
    stream = null;
    trackState = "off";
  }
}

export function pauseBridgeListen() {
  paused = true;
  pttHeld = false;
  muteWorklet(true);
  vad = { ...VAD_IDLE };
  if (wanted) pipeState = "waiting";
  emit();
}

export function resumeBridgeListen() {
  paused = false;
  muteWorklet(false);
  vad = { ...VAD_IDLE };
  if (wanted) pipeState = "listening";
  emit();
}

export function stopBridgeListen() {
  wanted = false;
  paused = false;
  pttHeld = false;
  hearing = false;
  onHear = null;
  onClipStart = null;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  teardownGraph(true);
  vad = { ...VAD_IDLE };
  ring = null;
  pipeState = "idle";
  emit();
}

export async function startBridgeListen(hear: HearFn, onClip?: () => void) {
  onHear = hear;
  onClipStart = onClip ?? null;
  wanted = true;
  paused = false;
  bindDevices();
  if (stream?.getAudioTracks().some((t) => t.readyState === "live") && worklet) {
    muteWorklet(false);
    pipeState = "listening";
    emit();
    return;
  }
  await openMic();
}

async function openMic() {
  pipeState = "connecting";
  emit();
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
  if (stream && stream !== media) {
    for (const t of stream.getTracks()) t.stop();
  }
  stream = media;
  const t = media.getAudioTracks()[0];
  if (t) bindTrack(t);
  const c = captureCtx();
  if (c.state === "suspended") await c.resume();
  inputHz = c.sampleRate || 48_000;
  ring = new PcmRing(Math.ceil(inputHz * RING_S));
  src = c.createMediaStreamSource(media);
  lastTs = performance.now();
  lastFrameAt = lastTs;
  try {
    if (!workletUrl) workletUrl = "/voice-capture-worklet.js";
    await c.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(c, "voice-capture");
    node.port.onmessage = onWorkletMsg;
    worklet = node;
    const silent = c.createGain();
    silent.gain.value = 0;
    src.connect(node);
    node.connect(silent);
    silent.connect(c.destination);
    scriptMute = silent;
  } catch {
    const proc = c.createScriptProcessor(2048, 1, 1);
    const mute = c.createGain();
    mute.gain.value = 0;
    proc.onaudioprocess = (ev) => {
      if (paused || !wanted) return;
      onFrame(ev.inputBuffer.getChannelData(0));
    };
    src.connect(proc);
    proc.connect(mute);
    mute.connect(c.destination);
    script = proc;
    scriptMute = mute;
  }
  pipeState = "listening";
  pumpMeter();
  emit();
}

function onWorkletMsg(ev: MessageEvent) {
  const d = ev.data as { t?: string; s?: Float32Array; sr?: number };
  if (d.t === "hb" && typeof d.sr === "number" && d.sr > 0) inputHz = d.sr;
  if (d.t === "f" && d.s) onFrame(d.s);
}

function onFrame(chunk: Float32Array) {
  if (!wanted || paused || !ring) return;
  const now = performance.now();
  const dt = Math.min(80, now - (lastTs || now));
  lastTs = now;
  lastFrameAt = now;
  framesIn += 1;
  ring.push(chunk);
  const r = rmsOf(chunk);
  level = level * 0.7 + r * 0.3;
  clipping = r > 0.92;
  if (hearing) {
    emit();
    return;
  }
  if (pttMode) {
    if (pttHeld) pipeState = "user_speaking";
    emit();
    return;
  }
  const hit = tickVad(vad, r, dt);
  vad = hit.state;
  if (hit.event === "start") {
    speechStartedAt = now - BRIDGE_VAD.preRollMs;
    pipeState = "user_speaking";
  } else if (hit.event === "end") {
    void sendClip(false);
  }
  if (framesIn % 8 === 0) emit();
}

function pumpMeter() {
  if (!wanted) return;
  raf = requestAnimationFrame(pumpMeter);
  if (lastFrameAt && performance.now() - lastFrameAt > 2500 && wanted && !paused && vis === "visible") {
    pipeState = pipeState === "connecting" ? "connecting" : "mic_lost";
  }
}

async function sendClip(fromPtt: boolean) {
  if (!ring || hearing || !wanted || !onHear) {
    pipeState = wanted ? "listening" : "idle";
    emit();
    return;
  }
  const ms = Math.min(BRIDGE_VAD.maxMs, Math.max(BRIDGE_VAD.minMs, performance.now() - speechStartedAt));
  const samples = Math.floor((inputHz * ms) / 1000);
  const raw = ring.sliceLast(samples);
  pipeState = "waiting";
  emit();
  if (raw.length < inputHz * 0.18) {
    lastClip = "short";
    pipeState = "listening";
    emit();
    return;
  }
  const pcm = floatTo16(downsample(raw, inputHz, PCM_HZ));
  const wav = encodeWavPcm16(pcm, PCM_HZ);
  if (wav.byteLength < 600 || wav.byteLength > 480_000) {
    lastClip = "short";
    pipeState = "listening";
    emit();
    return;
  }
  hearing = true;
  onClipStart?.();
  try {
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hear: bufB64(wav), mime: "audio/wav" }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { ok?: boolean; text?: string };
    const text = String(data.text ?? "").trim();
    clipsSent += 1;
    lastClip = data.ok && text ? "ok" : "empty";
    if (data.ok && text && onHear && wanted) onHear(text, { ptt: fromPtt });
    else if (onHear && wanted && (fromPtt || !data.ok)) {
      lastClip = data.ok ? "empty" : "fail";
      onHear("", { ptt: fromPtt, miss: true });
    }
  } catch {
    lastClip = "fail";
    if (onHear && wanted) onHear("", { ptt: fromPtt, miss: true });
  } finally {
    hearing = false;
    vad = { ...VAD_IDLE };
    if (wanted && !paused) pipeState = "listening";
    emit();
  }
}
