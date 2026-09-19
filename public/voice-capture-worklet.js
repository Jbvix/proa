class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.muted = false;
    this.frames = 0;
    this.parts = [];
    this.n = 0;
    this.target = Math.max(256, Math.floor(sampleRate * 0.02));
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m === "mute") this.muted = true;
      else if (m === "unmute") this.muted = false;
    };
  }
  flush() {
    if (!this.n) return;
    const out = new Float32Array(this.n);
    let i = 0;
    for (const p of this.parts) {
      out.set(p, i);
      i += p.length;
    }
    this.parts = [];
    this.n = 0;
    this.port.postMessage({ t: "f", s: out }, [out.buffer]);
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    this.frames += 1;
    if (this.frames % 25 === 0) {
      this.port.postMessage({ t: "hb", n: this.frames, sr: sampleRate });
    }
    if (!ch || this.muted) {
      if (this.muted) this.flush();
      return true;
    }
    const copy = new Float32Array(ch.length);
    copy.set(ch);
    this.parts.push(copy);
    this.n += copy.length;
    if (this.n >= this.target) this.flush();
    return true;
  }
}
registerProcessor("voice-capture", VoiceCaptureProcessor);
