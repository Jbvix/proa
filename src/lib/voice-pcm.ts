export type VadCfg = {
  hangMs: number;
  startMs: number;
  preRollMs: number;
  minMs: number;
  maxMs: number;
};

/** Passadiço: pausas curtas não encerram o turno. */
export const BRIDGE_VAD: VadCfg = {
  hangMs: 950,
  startMs: 140,
  preRollMs: 320,
  minMs: 480,
  maxMs: 4_000,
};

export type VadState = {
  speaking: boolean;
  aboveMs: number;
  silentMs: number;
  floor: number;
  speechMs: number;
};

export const VAD_IDLE: VadState = {
  speaking: false,
  aboveMs: 0,
  silentMs: 0,
  floor: 0.012,
  speechMs: 0,
};

export function rmsOf(buf: ArrayLike<number>): number {
  const n = buf.length;
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += buf[i]! * buf[i]!;
  return Math.sqrt(s / n);
}

export function tickVad(
  prev: VadState,
  rms: number,
  dtMs: number,
  cfg: VadCfg = BRIDGE_VAD,
): { state: VadState; event: "start" | "end" | null } {
  let floor = prev.floor;
  if (rms < floor * 1.35) floor = floor * 0.97 + Math.max(0.003, rms) * 0.03;
  const trig = Math.max(0.012, floor * 3.2);
  let aboveMs = prev.aboveMs;
  let silentMs = prev.silentMs;
  let speaking = prev.speaking;
  let speechMs = prev.speechMs;
  let event: "start" | "end" | null = null;

  if (rms > trig) {
    aboveMs += dtMs;
    silentMs = 0;
  } else {
    aboveMs = Math.max(0, aboveMs - dtMs * 0.4);
    silentMs += dtMs;
  }

  if (!speaking && aboveMs >= cfg.startMs) {
    speaking = true;
    speechMs = 0;
    event = "start";
  }

  if (speaking) {
    speechMs += dtMs;
    if (silentMs >= cfg.hangMs && speechMs >= cfg.minMs) {
      speaking = false;
      aboveMs = 0;
      speechMs = 0;
      event = "end";
    } else if (speechMs >= cfg.maxMs) {
      speaking = false;
      aboveMs = 0;
      speechMs = 0;
      event = "end";
    }
  }

  return {
    state: { speaking, aboveMs, silentMs, floor, speechMs },
    event,
  };
}

export function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate <= 0 || toRate <= 0) return input;
  if (Math.abs(fromRate - toRate) < 1) return input;
  const ratio = fromRate / toRate;
  const n = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * ratio;
    const i0 = Math.min(input.length - 1, Math.floor(s));
    const i1 = Math.min(input.length - 1, i0 + 1);
    const f = s - i0;
    out[i] = input[i0]! * (1 - f) + input[i1]! * f;
  }
  return out;
}

export function floatTo16(f: Float32Array): Int16Array {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    let x = f[i]!;
    if (x > 1) x = 1;
    if (x < -1) x = -1;
    o[i] = x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff);
  }
  return o;
}

export function encodeWavPcm16(pcm: Int16Array, sampleRate: number): ArrayBuffer {
  const data = pcm.byteLength;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  writeAscii(v, 0, "RIFF");
  v.setUint32(4, 36 + data, true);
  writeAscii(v, 8, "WAVE");
  writeAscii(v, 12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeAscii(v, 36, "data");
  v.setUint32(40, data, true);
  new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  return buf;
}

function writeAscii(v: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
}

export class PcmRing {
  buf: Float32Array;
  i = 0;
  filled = 0;
  constructor(samples: number) {
    this.buf = new Float32Array(Math.max(1, samples));
  }
  push(chunk: ArrayLike<number>) {
    const n = this.buf.length;
    for (let k = 0; k < chunk.length; k++) {
      this.buf[this.i] = chunk[k]!;
      this.i = (this.i + 1) % n;
      this.filled = Math.min(this.filled + 1, n);
    }
  }
  sliceLast(samples: number): Float32Array {
    const take = Math.min(Math.max(0, samples), this.filled);
    const out = new Float32Array(take);
    let s = (this.i - take + this.buf.length) % this.buf.length;
    for (let k = 0; k < take; k++) {
      out[k] = this.buf[s]!;
      s = (s + 1) % this.buf.length;
    }
    return out;
  }
}
