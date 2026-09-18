import { alongTrack, haversineNm, msToKn } from "./geo";
import type { ParsedRoute } from "./gpx";
import {
  amplitudeFromHs,
  hsFromHeaveStd,
  stdev,
  zeroCrossingPeriod,
} from "./waves";

export type SensorMode = "idle" | "sim" | "live";

export type Fix = {
  lat: number;
  lon: number;
  sogKn: number;
  gpsKn: number | null;
  trackKn: number | null;
  valid: boolean;
  cogDeg: number;
  accM: number | null;
  t: number;
};

export type Attitude = {
  pitch: number;
  roll: number;
  heading: number | null;
};

export type WaveLive = {
  heaveM: number;
  hsM: number;
  amplitudeM: number;
  periodS: number;
  perMin: number;
  samples: number;
  windowS: number;
};

export type EngineSnapshot = {
  mode: SensorMode;
  capturing: boolean;
  fix: Fix | null;
  attitude: Attitude | null;
  wave: WaveLive;
  hz: number;
  simNm: number;
  lastHourKey: number;
  permission: "unknown" | "granted" | "denied" | "unavailable";
};

type MotionEvt = {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  t: number;
};

const HEAVE_HZ = 10;
const HEAVE_WINDOW_S = 20 * 60;
const HEAVE_CAP = HEAVE_HZ * HEAVE_WINDOW_S;
const SCOPE_S = 24;
const SCOPE_CAP = HEAVE_HZ * SCOPE_S;

type Listener = (snap: EngineSnapshot) => void;

function emptyWave(): WaveLive {
  return {
    heaveM: 0,
    hsM: 0,
    amplitudeM: 0,
    periodS: 0,
    perMin: 0,
    samples: 0,
    windowS: 0,
  };
}

export class SensorEngine {
  mode: SensorMode = "idle";
  capturing = false;
  permission: EngineSnapshot["permission"] = "unknown";
  route: ParsedRoute | null = null;
  simNm = 0;
  simSpeedKn = 9.2;
  seaHs = 1.1;
  seaPeriod = 7.4;
  private geoWatch: number | null = null;
  private motionOn = false;
  private orientOn = false;
  private timer: number | null = null;
  private lastTick = 0;
  private accUpPrev = 0;
  private hpA = 0;
  private vel = 0;
  private hpV = 0;
  private disp = 0;
  private hpD = 0;
  private prevA = 0;
  private prevV = 0;
  private heaveBuf = new Float32Array(HEAVE_CAP);
  private heaveN = 0;
  private heaveI = 0;
  private scope = new Float32Array(SCOPE_CAP);
  private scopeI = 0;
  private ticks = 0;
  private hz = 0;
  private hzStamp = 0;
  private lastHourKey = 0;
  private fix: Fix | null = null;
  private attitude: Attitude | null = null;
  private listeners = new Set<Listener>();
  private lastLiveMotion = 0;
  private trail: Array<{ lat: number; lon: number; t: number }> = [];

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  snapshot(): EngineSnapshot {
    return {
      mode: this.mode,
      capturing: this.capturing,
      fix: this.fix,
      attitude: this.attitude,
      wave: this.waveStats(),
      hz: this.hz,
      simNm: this.simNm,
      lastHourKey: this.lastHourKey,
      permission: this.permission,
    };
  }

  copyScope(target: number[]) {
    const n = Math.min(this.heaveN, SCOPE_CAP);
    target.length = n;
    const start = (this.scopeI - n + SCOPE_CAP) % SCOPE_CAP;
    for (let i = 0; i < n; i++) target[i] = this.scope[(start + i) % SCOPE_CAP]!;
  }

  setRoute(route: ParsedRoute | null) {
    this.route = route;
    if (this.mode === "sim") this.simNm = 0;
  }

  setSea(hs: number, period: number) {
    this.seaHs = Math.max(0.05, hs);
    this.seaPeriod = Math.max(2.5, period);
  }

  async start(mode: SensorMode) {
    this.stop();
    this.mode = mode;
    this.capturing = true;
    this.lastTick = performance.now();
    this.hzStamp = this.lastTick;
    this.ticks = 0;
    this.resetFilters();
    this.trail = [];
    if (mode === "live") {
      await this.startLive();
    }
    this.timer = window.setInterval(() => this.tick(), 1000 / HEAVE_HZ);
    this.emit();
  }

  stop() {
    this.capturing = false;
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stopLive();
    this.mode = "idle";
    this.emit();
  }

  private resetFilters() {
    this.accUpPrev = 0;
    this.hpA = 0;
    this.vel = 0;
    this.hpV = 0;
    this.disp = 0;
    this.hpD = 0;
    this.prevA = 0;
    this.prevV = 0;
    this.heaveN = 0;
    this.heaveI = 0;
    this.scopeI = 0;
  }

  private async startLive() {
    const motion = window.DeviceMotionEvent as
      | (typeof DeviceMotionEvent & {
          requestPermission?: () => Promise<string>;
        })
      | undefined;
    const orient = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<string>;
        })
      | undefined;

    try {
      if (motion && typeof motion.requestPermission === "function") {
        const r = await motion.requestPermission();
        if (r !== "granted") {
          this.permission = "denied";
          this.mode = "sim";
          return;
        }
      }
      if (orient && typeof orient.requestPermission === "function") {
        await orient.requestPermission().catch(() => "denied");
      }
      this.permission = "granted";
    } catch {
      this.permission = "unavailable";
      this.mode = "sim";
      return;
    }

    if (!motion) {
      this.permission = "unavailable";
      this.mode = "sim";
      return;
    }

    window.addEventListener("devicemotion", this.onMotion);
    window.addEventListener("deviceorientation", this.onOrient);
    this.motionOn = true;
    this.orientOn = true;

    if (navigator.geolocation) {
      this.geoWatch = navigator.geolocation.watchPosition(
        (pos) => {
          const c = pos.coords;
          const t = pos.timestamp || Date.now();
          const gpsKn =
            c.speed != null && Number.isFinite(c.speed) && c.speed >= 0
              ? msToKn(c.speed)
              : null;
          this.trail.push({ lat: c.latitude, lon: c.longitude, t });
          if (this.trail.length > 24) this.trail.splice(0, this.trail.length - 24);
          const trackKn = this.measureTrackKn();
          const sogKn =
            gpsKn != null && gpsKn > 0.3 ? gpsKn : (trackKn ?? gpsKn ?? 0);
          const valid =
            gpsKn != null && trackKn != null
              ? Math.abs(gpsKn - trackKn) <= 1.8
              : trackKn != null || (gpsKn != null && gpsKn > 0.3);
          this.fix = {
            lat: c.latitude,
            lon: c.longitude,
            sogKn,
            gpsKn,
            trackKn,
            valid,
            cogDeg:
              c.heading != null && Number.isFinite(c.heading)
                ? c.heading
                : this.fix?.cogDeg ?? 0,
            accM: c.accuracy,
            t,
          };
        },
        () => {
          /* keep last fix */
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 },
      );
    }
  }

  private stopLive() {
    if (this.motionOn) {
      window.removeEventListener("devicemotion", this.onMotion);
      this.motionOn = false;
    }
    if (this.orientOn) {
      window.removeEventListener("deviceorientation", this.onOrient);
      this.orientOn = false;
    }
    if (this.geoWatch != null) {
      navigator.geolocation.clearWatch(this.geoWatch);
      this.geoWatch = null;
    }
  }

  private measureTrackKn(): number | null {
    if (this.trail.length < 2) return null;
    const now = this.trail[this.trail.length - 1]!;
    let i = 0;
    while (i < this.trail.length - 1 && now.t - this.trail[i]!.t > 40_000) i += 1;
    const a = this.trail[i]!;
    const dtH = (now.t - a.t) / 3_600_000;
    if (dtH < 0.002) return null;
    return haversineNm(a.lat, a.lon, now.lat, now.lon) / dtH;
  }

  private onMotion = (ev: DeviceMotionEvent) => {
    const t = ev.timeStamp || performance.now();
    const lin = ev.acceleration;
    const g = ev.accelerationIncludingGravity;
    const ax = lin?.x ?? 0;
    const ay = lin?.y ?? 0;
    const az = lin?.z ?? 0;
    const gx = g?.x ?? 0;
    const gy = g?.y ?? 0;
    const gz = g?.z ?? 9.81;
    this.lastLiveMotion = t;
    this.ingestMotion({ ax, ay, az, gx, gy, gz, t });
  };

  private onOrient = (ev: DeviceOrientationEvent) => {
    const pitch = ev.beta ?? 0;
    const roll = ev.gamma ?? 0;
    const webkit = (ev as DeviceOrientationEvent & { webkitCompassHeading?: number })
      .webkitCompassHeading;
    const heading =
      typeof webkit === "number"
        ? webkit
        : typeof ev.alpha === "number"
          ? (360 - ev.alpha) % 360
          : null;
    this.attitude = { pitch, roll, heading };
  };

  private ingestMotion(m: MotionEvt) {
    const gMag = Math.hypot(m.gx, m.gy, m.gz) || 9.81;
    const ux = m.gx / gMag;
    const uy = m.gy / gMag;
    const uz = m.gz / gMag;
    const hasLin = Math.abs(m.ax) + Math.abs(m.ay) + Math.abs(m.az) > 0.0001;
    const accUp = hasLin
      ? m.ax * ux + m.ay * uy + m.az * uz
      : m.gx * ux + m.gy * uy + m.gz * uz - gMag;
    this.pushHeaveFromAcc(accUp, 1 / HEAVE_HZ);
  }

  private pushHeaveFromAcc(acc: number, dt: number) {
    // High-pass accel (~0.04 Hz) then leaky double integration.
    const rc = 1 / (2 * Math.PI * 0.045);
    const aHp = rc / (rc + dt);
    this.hpA = aHp * (this.hpA + acc - this.prevA);
    this.prevA = acc;
    this.vel = this.vel * 0.994 + this.hpA * dt;
    this.hpV = aHp * (this.hpV + this.vel - this.prevV);
    this.prevV = this.vel;
    this.disp = this.disp * 0.994 + this.hpV * dt;
    this.hpD = aHp * (this.hpD + this.disp);
    this.pushSample(this.hpD);
  }

  private pushSample(heave: number) {
    this.heaveBuf[this.heaveI] = heave;
    this.heaveI = (this.heaveI + 1) % HEAVE_CAP;
    this.heaveN = Math.min(this.heaveN + 1, HEAVE_CAP);
    this.scope[this.scopeI] = heave;
    this.scopeI = (this.scopeI + 1) % SCOPE_CAP;
  }

  private simHeave(tSec: number) {
    const Hs = this.seaHs;
    const T = this.seaPeriod;
    const w = (2 * Math.PI) / T;
    // Two-component sea so Hs ≈ 4σ.
    const a1 = Hs * 0.4;
    const a2 = Hs * 0.16;
    return (
      a1 * Math.sin(w * tSec) +
      a2 * Math.sin(1.63 * w * tSec + 0.7) +
      Hs * 0.03 * Math.sin(0.31 * w * tSec + 1.4)
    );
  }

  private tick() {
    try {
      this.tickInner();
    } catch (err) {
      console.error("[proa] sensor tick", err);
    }
  }

  private tickInner() {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastTick) / 1000) || 1 / HEAVE_HZ;
    this.lastTick = now;
    this.ticks += 1;
    if (now - this.hzStamp >= 1000) {
      this.hz = this.ticks / ((now - this.hzStamp) / 1000);
      this.ticks = 0;
      this.hzStamp = now;
    }

    if (this.mode === "sim") {
      const tSec = now / 1000;
      const heave = this.simHeave(tSec);
      this.pushSample(heave);
      this.simNm += this.simSpeedKn * (dt / 3600);
      if (this.route) {
        const p = alongTrack(this.route.points, this.simNm);
        if (p) {
          if (p.remainNm <= 0.02) this.simNm = 0;
          this.fix = {
            lat: p.lat,
            lon: p.lon,
            sogKn: this.simSpeedKn,
            gpsKn: this.simSpeedKn,
            trackKn: this.simSpeedKn,
            valid: true,
            cogDeg: p.cog,
            accM: 4,
            t: Date.now(),
          };
          this.attitude = {
            pitch: heave * 3.4,
            roll: Math.sin(tSec * 0.7) * this.seaHs * 2.2,
            heading: p.cog,
          };
        }
      }
    } else if (this.mode === "live") {
      // If motion events are sparse, keep cadence with last residual (zeros).
      if (now - this.lastLiveMotion > 400) {
        this.pushHeaveFromAcc(0, dt);
      }
    }

    this.emit();
  }

  private waveStats(): WaveLive {
    const n = this.heaveN;
    if (n < 20) return emptyWave();
    const slice = new Float32Array(n);
    const start = (this.heaveI - n + HEAVE_CAP) % HEAVE_CAP;
    for (let i = 0; i < n; i++) slice[i] = this.heaveBuf[(start + i) % HEAVE_CAP]!;
    const dt = 1 / HEAVE_HZ;
    const std = stdev(slice);
    const hs = hsFromHeaveStd(std);
    const period = zeroCrossingPeriod(slice, dt);
    return {
      heaveM: slice[n - 1]!,
      hsM: hs,
      amplitudeM: amplitudeFromHs(hs),
      periodS: period,
      perMin: period > 0 ? 60 / period : 0,
      samples: n,
      windowS: n * dt,
    };
  }

  private emit() {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }
}

export const sensorEngine = new SensorEngine();
