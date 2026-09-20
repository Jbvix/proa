/**
 * Proa · TugLife Systems — Motor de sensores de bordo
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.1.0
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * MODIFICAÇÕES DESTA VERSÃO (1.1.0)
 *  1. CORREÇÃO CRÍTICA DE TAXA DE AMOSTRAGEM. Até a 1.0.0, todo evento
 *     `devicemotion` era integrado com `dt` fixo de 1/10 s. Mas o IMU de
 *     tablet e smartphone dispara a ~60 Hz, não a 10 Hz. O resultado era
 *     integrar com um passo 6× maior que o real: num mar de 1,50 m e 8 s, o
 *     app mostrava 0,008 m e período zero. O simulador não sofria do defeito
 *     porque empurrava amostras de dentro do próprio `tick()`, a 10 Hz certos
 *     — ou seja, a bancada mentia bonito e o mar não.
 *     Agora as amostras do IMU são ACUMULADAS entre ticks e decimadas para a
 *     grade de 10 Hz com o `dt` medido de verdade. A média sobre a janela faz
 *     as vezes de filtro anti-aliasing, como convém a toda decimação.
 *  2. A cadeia de dupla integração saiu daqui para `waves.ts`
 *     (`HeaveIntegrator`), pura e testável, e sem a realimentação
 *     `disp = heave` que derrubava o Hs lido.
 *  3. O Hs passa por `correctChainHs()` — a resposta dos filtros é conhecida
 *     analiticamente e agora é compensada.
 *  4. Novo campo `imuHz` no snapshot: a taxa REAL do acelerômetro. É o número
 *     que prova, no aparelho, que a correção (1) está de pé.
 *  5. A estatística de onda passa a usar o período MEDIDO do tick em vez do
 *     nominal de 10 Hz. Mesma classe de erro da correção (1), um nível
 *     acima: `setInterval` deriva quando o navegador estrangula a aba.
 * ---------------------------------------------------------------------------
 */
import { alongTrack, haversineNm, msToKn } from "./geo.ts";
import type { ParsedRoute } from "./gpx.ts";
import {
  HS_HULL_MAX,
  HeaveIntegrator,
  WAVE_STATS_S,
  amplitudeFromHs,
  correctChainHs,
  hullWaveFromHeave,
  sustainedRollP2P,
} from "./waves.ts";

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
  trusted: boolean;
};

export type EngineSnapshot = {
  mode: SensorMode;
  capturing: boolean;
  fix: Fix | null;
  attitude: Attitude | null;
  wave: WaveLive;
  rollP2P: number;
  hz: number;
  /** Taxa real medida do acelerômetro, em Hz. Zero enquanto nada chegou. */
  imuHz: number;
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
const HEAVE_CAP = HEAVE_HZ * WAVE_STATS_S;
const SCOPE_S = 24;
const SCOPE_CAP = HEAVE_HZ * SCOPE_S;
const ROLL_S = 16;
const ROLL_CAP = HEAVE_HZ * ROLL_S;
/** Sem amostra de IMU por mais que isto, o sensor é dado como parado. */
const MOTION_STALL_MS = 400;

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
    trusted: true,
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
  private heave = new HeaveIntegrator();
  /** Soma das acelerações verticais chegadas do IMU desde o último tick. */
  private accSum = 0;
  /** Quantas amostras do IMU entraram nessa soma — a base da decimação. */
  private accCount = 0;
  private imuTicks = 0;
  private imuHz = 0;
  private imuStamp = 0;
  private heaveBuf = new Float32Array(HEAVE_CAP);
  private heaveN = 0;
  private heaveI = 0;
  private scope = new Float32Array(SCOPE_CAP);
  private scopeI = 0;
  private rollBuf = new Float32Array(ROLL_CAP);
  private rollN = 0;
  private rollI = 0;
  private ticks = 0;
  private hz = 0;
  private hzStamp = 0;
  private lastHourKey = 0;
  private fix: Fix | null = null;
  private attitude: Attitude | null = null;
  private listeners = new Set<Listener>();
  private lastLiveMotion = 0;
  private handlingUntil = 0;
  private trail: Array<{ lat: number; lon: number; t: number }> = [];
  private wantLive = false;
  private gotGps = false;
  private gpsTimer: number | null = null;

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
      rollP2P: this.rollSwing(),
      hz: this.hz,
      imuHz: this.imuHz,
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
    this.wantLive = mode === "live";
    this.capturing = true;
    this.lastTick = performance.now();
    this.hzStamp = this.lastTick;
    this.ticks = 0;
    this.resetFilters();
    this.trail = [];
    this.gotGps = false;
    this.seedFix();
    this.timer = window.setInterval(() => this.tick(), 1000 / HEAVE_HZ);
    this.emit();
    if (mode === "live") {
      this.gpsTimer = window.setTimeout(() => {
        if (!this.capturing || !this.wantLive) return;
        if (this.gotGps) return;
        this.mode = "sim";
        this.seedFix();
        this.emit();
      }, 4000);
      void this.startLive();
    }
  }

  stop() {
    this.capturing = false;
    this.wantLive = false;
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.gpsTimer != null) {
      clearTimeout(this.gpsTimer);
      this.gpsTimer = null;
    }
    this.stopLive();
    this.mode = "idle";
    this.emit();
  }

  /** Park a visible position so the map is never empty while GPS warms up. */
  private seedFix() {
    if (this.fix) return;
    const p = this.route?.points[0];
    this.fix = {
      lat: p?.lat ?? -3.7184,
      lon: p?.lon ?? -38.4732,
      sogKn: 0,
      gpsKn: null,
      trackKn: null,
      valid: false,
      cogDeg: 0,
      accM: null,
      t: Date.now(),
    };
  }

  private resetFilters() {
    this.heave.reset();
    this.accSum = 0;
    this.accCount = 0;
    this.imuTicks = 0;
    this.imuHz = 0;
    this.imuStamp = 0;
    this.heaveN = 0;
    this.heaveI = 0;
    this.scopeI = 0;
    this.rollN = 0;
    this.rollI = 0;
    this.handlingUntil = 0;
  }

  private async startLive() {
    this.startGps();

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
        } else {
          this.permission = "granted";
        }
      } else if (!motion) {
        this.permission = "unavailable";
      } else {
        this.permission = "granted";
      }
      if (orient && typeof orient.requestPermission === "function") {
        await orient.requestPermission().catch(() => "denied");
      }
    } catch {
      this.permission = "unavailable";
    }

    if (motion && this.permission !== "denied") {
      window.addEventListener("devicemotion", this.onMotion);
      this.motionOn = true;
    }
    if (orient) {
      window.addEventListener("deviceorientation", this.onOrient);
      this.orientOn = true;
    }
  }

  private startGps() {
    if (!navigator.geolocation) return;
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
        this.gotGps = true;
        if (this.wantLive) this.mode = "live";
      },
      () => {
        /* keep last / seeded fix — timeout may fall back to sim */
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 },
    );
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
    this.pushRoll(roll);
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
    // NÃO integra aqui. O IMU chega a ~60 Hz e a cadeia trabalha a 10 Hz;
    // quem fecha a conta é o tick, com o dt medido. Aqui só se acumula.
    this.accSum += accUp;
    this.accCount += 1;
    this.imuTicks += 1;
    if (this.imuStamp === 0) this.imuStamp = m.t;
    else if (m.t - this.imuStamp >= 1000) {
      this.imuHz = (this.imuTicks * 1000) / (m.t - this.imuStamp);
      this.imuTicks = 0;
      this.imuStamp = m.t;
    }
  }

  /**
   * Fecha uma amostra de 10 Hz e a entrega à cadeia de integração.
   *
   * A média das amostras do IMU acumuladas desde o tick anterior é a própria
   * decimação: média de janela é um passa-baixa, que é o anti-aliasing que
   * toda redução de taxa exige. Sem ela, uma vibração de motor a 25 Hz
   * rebateria dentro da banda da onda e viraria mar que não existe.
   *
   * @param dt  intervalo REAL desde o tick anterior, em segundos
   * @param now relógio monotônico, para a janela de manuseio
   */
  private pushHeaveTick(dt: number, now: number) {
    const acc = this.accCount > 0 ? this.accSum / this.accCount : 0;
    this.accSum = 0;
    this.accCount = 0;
    const { heave, spike } = this.heave.push(acc, dt);
    if (spike) this.handlingUntil = now + 2500;
    this.pushSample(heave);
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
          this.pushRoll(this.attitude.roll);
        }
      } else if (!this.fix) {
        this.seedFix();
      }
    } else if (this.mode === "live") {
      // Uma amostra por tick, sempre. É isso que mantém a grade de 10 Hz
      // honesta e faz `windowS` valer o que diz. Se o IMU parou de mandar, a
      // média sai zero e a cadeia relaxa sozinha, em vez de congelar a última
      // leitura e fingir mar parado.
      if (now - this.lastLiveMotion > MOTION_STALL_MS) this.imuHz = 0;
      this.pushHeaveTick(dt, now);
    }

    this.emit();
  }

  private pushRoll(deg: number) {
    if (!Number.isFinite(deg)) return;
    this.rollBuf[this.rollI] = deg;
    this.rollI = (this.rollI + 1) % ROLL_CAP;
    this.rollN = Math.min(this.rollN + 1, ROLL_CAP);
  }

  private rollSwing() {
    const n = this.rollN;
    if (n < 80) return 0;
    const linear = new Float32Array(n);
    const start = (this.rollI - n + ROLL_CAP) % ROLL_CAP;
    for (let i = 0; i < n; i++) linear[i] = this.rollBuf[(start + i) % ROLL_CAP]!;
    return sustainedRollP2P(linear);
  }

  private waveStats(): WaveLive {
    const n = this.heaveN;
    if (n < 20) return emptyWave();
    const slice = new Float32Array(n);
    const start = (this.heaveI - n + HEAVE_CAP) % HEAVE_CAP;
    for (let i = 0; i < n; i++) slice[i] = this.heaveBuf[(start + i) % HEAVE_CAP]!;
    // Uma amostra por tick, tanto no simulador quanto ao vivo. Então o passo
    // da grade é o período REAL do tick, não o nominal: `setInterval` de 100 ms
    // deriva quando o navegador estrangula a aba, e assumir 10 Hz cravados foi
    // exatamente o erro que fez o app mentir na 1.0.0. Só se aceita a taxa
    // medida dentro de uma banda sadia; fora dela, o nominal é o mal menor.
    const medida = this.hz;
    const dt = medida >= 5 && medida <= 20 ? 1 / medida : 1 / HEAVE_HZ;
    const w = hullWaveFromHeave(slice, dt);

    // Só o mar ao vivo passou pela cadeia de filtros e precisa de compensação.
    // O simulador injeta deslocamento direto no buffer; corrigir ali inflaria
    // um número que já é verdadeiro.
    const live = this.mode === "live";
    const hsRaw = w.hsM;
    let hsM = live ? correctChainHs(hsRaw, w.periodS, dt) : hsRaw;
    const clamped = w.clamped || hsM > HS_HULL_MAX;
    hsM = Math.min(HS_HULL_MAX, hsM);

    // Sem período confiável não há frequência onde avaliar o ganho, então a
    // leitura fica crua — e subestimada. O passadiço merece saber disso: some
    // o selo de confiança em vez de mostrar número bonito e errado.
    const uncompensated = live && hsRaw > 0 && w.periodS <= 0;
    const handling = performance.now() < this.handlingUntil;
    return {
      heaveM: slice[n - 1]!,
      hsM,
      amplitudeM: amplitudeFromHs(hsM),
      periodS: w.periodS,
      perMin: w.perMin,
      samples: n,
      windowS: n * dt,
      trusted: !clamped && !handling && !uncompensated,
    };
  }

  private emit() {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }
}

export const sensorEngine = new SensorEngine();
