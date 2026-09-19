class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.muted = false;
    this.frames = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m === "mute") this.muted = true;
      else if (m === "unmute") this.muted = false;
    };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    this.frames += 1;
    if (this.frames % 20 === 0) {
      this.port.postMessage({ t: "hb", n: this.frames, sr: sampleRate });
    }
    if (!ch || this.muted) return true;
    const out = new Float32Array(ch.length);
    out.set(ch);
    this.port.postMessage({ t: "f", s: out }, [out.buffer]);
    return true;
  }
}
registerProcessor("voice-capture", VoiceCaptureProcessor);
