import { passageOf } from "./passage";
import { planFloodArrival, phaseLabel } from "./tide";
import { recommendRpm } from "./rpm";
import type { EngineSnapshot } from "./sensor-engine";
import type { MeteoBundle } from "./meteo";
import type { ParsedRoute } from "./gpx";
import type { EngineProfile } from "./rpm";

export type VoiceTurn = { role: "user" | "assistant"; content: string };

export type VoiceContext = {
  tab?: string;
  route?: string;
  hsM: number;
  ampM: number;
  periodS: number;
  perMin: number;
  sogKn: number | null;
  sogValid: boolean | null;
  cogDeg: number | null;
  lat: number | null;
  lon: number | null;
  remainNm: number | null;
  eta: string | null;
  windKn: number | null;
  windDir: number | null;
  currentKn: number | null;
  tidePhase: string | null;
  tideM: number | null;
  floodEta: string | null;
  targetKn: number | null;
  rpm: number;
  rpmBand: string | null;
  capturing: boolean;
  mode: string;
};

export function buildVoiceContext(opts: {
  engine: EngineSnapshot | null;
  meteo: MeteoBundle | null;
  route: ParsedRoute | null;
  rpm: number;
  profile: EngineProfile;
  tab?: string;
}): VoiceContext {
  const { engine, meteo, route, rpm, profile, tab } = opts;
  const passage = passageOf(route, engine);
  const plan = planFloodArrival(
    meteo?.tideHours ?? [],
    passage?.etaMs ?? null,
    passage?.remainNm ?? 0,
    passage?.sogKn ?? 0,
    9.2,
  );
  const advice = recommendRpm({
    profile,
    currentRpm: rpm,
    hsM: engine?.wave.hsM ?? 0,
    periodS: engine?.wave.periodS ?? 0,
    windKn: meteo?.now.windKn ?? 0,
    headingDeg: engine?.fix?.cogDeg ?? engine?.attitude?.heading ?? null,
    waveDirDeg: meteo?.now.waveDir ?? null,
  });
  const eta =
    passage?.etaMs != null
      ? new Date(passage.etaMs).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  const floodEta =
    plan.idealEtaMs != null
      ? new Date(plan.idealEtaMs).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  return {
    tab,
    route: route?.name ?? undefined,
    hsM: Number((engine?.wave.hsM ?? 0).toFixed(2)),
    ampM: Number((engine?.wave.amplitudeM ?? 0).toFixed(2)),
    periodS: Number((engine?.wave.periodS ?? 0).toFixed(1)),
    perMin: Number((engine?.wave.perMin ?? 0).toFixed(1)),
    sogKn: passage?.sogKn ?? engine?.fix?.sogKn ?? null,
    sogValid: passage?.valid ?? null,
    cogDeg: engine?.fix?.cogDeg ?? null,
    lat: engine?.fix?.lat ?? null,
    lon: engine?.fix?.lon ?? null,
    remainNm: passage ? Number(passage.remainNm.toFixed(1)) : null,
    eta,
    windKn: meteo?.now.windKn ?? null,
    windDir: meteo?.now.windDir ?? null,
    currentKn: meteo?.now.currentKn ?? null,
    tidePhase: plan.atEta ? phaseLabel(plan.atEta.phase) : null,
    tideM: plan.atEta ? Number(plan.atEta.seaM.toFixed(2)) : null,
    floodEta,
    targetKn: plan.targetKn != null ? Number(plan.targetKn.toFixed(1)) : null,
    rpm,
    rpmBand: `${Math.round(advice.min)}–${Math.round(advice.max)} rpm (${advice.label})`,
    capturing: !!engine?.capturing,
    mode: engine?.mode ?? "idle",
  };
}
