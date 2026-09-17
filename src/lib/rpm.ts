import { clamp } from "./utils";

export type EngineProfile = {
  idle: number;
  cruise: number;
  max: number;
};

export const DEFAULT_PROFILE: EngineProfile = {
  idle: 450,
  cruise: 980,
  max: 1600,
};

export type RpmAdvice = {
  min: number;
  max: number;
  center: number;
  label: "abaixo" | "ideal" | "acima";
  reason: string;
  seaPenalty: number;
  windPenalty: number;
  encounterPenalty: number;
};

function angleDiff(a: number, b: number) {
  const d = Math.abs(((a - b + 540) % 360) - 180);
  return d;
}

export function recommendRpm(opts: {
  profile: EngineProfile;
  currentRpm: number;
  hsM: number;
  periodS: number;
  windKn: number;
  headingDeg: number | null;
  waveDirDeg: number | null;
}): RpmAdvice {
  const { profile, currentRpm, hsM, periodS, windKn, headingDeg, waveDirDeg } =
    opts;

  const steep =
    periodS > 0 ? clamp(hsM / Math.max(periodS, 1.5), 0, 0.35) : 0.08;
  const seaPenalty = hsM * 78 + steep * 420;
  const windPenalty = Math.max(0, windKn - 14) * 7;

  let encounterPenalty = 0;
  let encounterNote = "mar de través ou popa";
  if (headingDeg != null && waveDirDeg != null) {
    // Wave direction is "from"; encounter 0 = head sea.
    const waveTo = (waveDirDeg + 180) % 360;
    const rel = angleDiff(headingDeg, waveTo);
    const head = Math.cos((rel * Math.PI) / 180); // 1 head, -1 following
    if (head > 0.3) {
      encounterPenalty = head * hsM * 55;
      encounterNote = "mar de proa";
    } else if (head < -0.3) {
      encounterPenalty = Math.abs(head) * hsM * -12;
      encounterNote = "mar de popa";
    } else {
      encounterNote = "mar de través";
    }
  }

  const raw =
    profile.cruise - seaPenalty - windPenalty - encounterPenalty;
  const center = clamp(
    raw,
    profile.idle + 40,
    Math.min(profile.max * 0.78, profile.cruise + 40),
  );
  const half = clamp(70 + hsM * 18, 60, 140);
  const min = clamp(center - half, profile.idle, profile.max);
  const max = clamp(center + half, min + 40, profile.max);

  let label: RpmAdvice["label"] = "ideal";
  if (currentRpm < min - 15) label = "abaixo";
  else if (currentRpm > max + 15) label = "acima";

  const reasonParts = [
    `Hs ${hsM.toFixed(1)} m`,
    periodS > 0 ? `Tz ${periodS.toFixed(0)} s` : null,
    windKn >= 8 ? `vento ${windKn.toFixed(0)} kn` : null,
    hsM >= 0.4 ? encounterNote : null,
  ].filter(Boolean);

  const reason =
    label === "ideal"
      ? `Faixa de viagem para ${reasonParts.join(" · ")}.`
      : label === "acima"
        ? `RPM acima da faixa — mais impacto e consumo com ${reasonParts.join(" · ")}.`
        : `RPM abaixo da faixa — atraso na derrota com ${reasonParts.join(" · ")}.`;

  return {
    min: Math.round(min),
    max: Math.round(max),
    center: Math.round(center),
    label,
    reason,
    seaPenalty: Math.round(seaPenalty),
    windPenalty: Math.round(windPenalty),
    encounterPenalty: Math.round(encounterPenalty),
  };
}
