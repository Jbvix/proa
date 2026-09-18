import { clamp } from "./utils.ts";

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
  sea: "proa" | "popa" | "traves";
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
  let sea: RpmAdvice["sea"] = "traves";
  let encounterNote = "mar de través ou popa";
  if (headingDeg != null && waveDirDeg != null) {
    // Wave direction is "from"; encounter 0 = head sea.
    const waveTo = (waveDirDeg + 180) % 360;
    const rel = angleDiff(headingDeg, waveTo);
    const head = Math.cos((rel * Math.PI) / 180); // 1 head, -1 following
    if (head > 0.3) {
      encounterPenalty = head * hsM * 55;
      sea = "proa";
      encounterNote = "mar de proa";
    } else if (head < -0.3) {
      encounterPenalty = Math.abs(head) * hsM * -12;
      sea = "popa";
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
    sea,
    seaPenalty: Math.round(seaPenalty),
    windPenalty: Math.round(windPenalty),
    encounterPenalty: Math.round(encounterPenalty),
  };
}

function flowAlign(heading: number, flowToDeg: number) {
  return Math.cos((angleDiff(heading, flowToDeg) * Math.PI) / 180);
}

export type FuelHint = {
  rpmSugerido: number;
  aFavor: string[];
  contra: string[];
  conselho: string;
};

export function fuelHint(opts: {
  advice: RpmAdvice;
  currentRpm: number;
  headingDeg: number | null;
  windKn: number;
  windDir: number | null;
  currentKn: number | null;
  currentDir: number | null;
  floodAdvice?: string | null;
}): FuelHint {
  const { advice, currentRpm, headingDeg, windKn, windDir, currentKn, currentDir } =
    opts;
  const aFavor: string[] = [];
  const contra: string[] = [];

  if (advice.sea === "popa") aFavor.push("mar de popa");
  else if (advice.sea === "proa") contra.push("mar de proa");

  if (headingDeg != null && windDir != null && windKn >= 6) {
    const windTo = (windDir + 180) % 360;
    const a = flowAlign(headingDeg, windTo);
    if (a > 0.35) aFavor.push(`vento a favor ${Math.round(windKn)} kn`);
    else if (a < -0.35) contra.push(`vento de proa ${Math.round(windKn)} kn`);
  }

  if (headingDeg != null && currentDir != null && (currentKn ?? 0) >= 0.2) {
    const a = flowAlign(headingDeg, currentDir);
    const kn = (currentKn ?? 0).toFixed(1);
    if (a > 0.35) aFavor.push(`corrente a favor ${kn} kn`);
    else if (a < -0.35) contra.push(`corrente de proa ${kn} kn`);
  }

  const favor = aFavor.length > 0 && advice.sea !== "proa";
  let rpmSugerido = advice.center;
  if (favor) rpmSugerido = advice.min + Math.round((advice.center - advice.min) * 0.25);
  else if (advice.sea === "proa") rpmSugerido = advice.center;
  rpmSugerido = Math.round(clamp(rpmSugerido, advice.min, advice.max));

  if (currentRpm > advice.max + 15) {
    rpmSugerido = favor ? Math.min(rpmSugerido, advice.center) : advice.center;
  }

  const flood = (opts.floodAdvice ?? "").toLowerCase();
  const needSpeed = flood.includes("suba");

  let conselho: string;
  if (needSpeed) {
    conselho = `Pra pegar a enchente não adianta cortar RPM agora. Fica na faixa ${advice.min}–${advice.max} e sobe o SOG. Combustível depois da janela.`;
    rpmSugerido = Math.max(rpmSugerido, advice.center);
  } else if (currentRpm > advice.max + 15 && favor) {
    conselho = `Tempo a favor (${aFavor.join(", ")}). Tá acima da faixa — cai pra cerca de ${rpmSugerido} rpm. Mesmo SOG, menos óleo.`;
  } else if (favor && currentRpm > rpmSugerido + 40) {
    conselho = `Mar e tempo a favor (${aFavor.join(", ")}). Dentro da faixa, ${rpmSugerido} rpm segura a viagem e corta consumo.`;
  } else if (contra.length && advice.sea === "proa") {
    conselho = `${contra.join(", ")}. Não baixa do centro da faixa (${advice.center} rpm) — mais hora de máquina come a economia.`;
    rpmSugerido = advice.center;
  } else if (currentRpm < advice.min - 15) {
    conselho = `RPM abaixo da faixa. Sobe pra ${advice.min}–${advice.center}. Ir devagar demais alonga a viagem e não economiza.`;
    rpmSugerido = advice.center;
  } else {
    conselho = `Já tá na faixa ${advice.min}–${advice.max}. ${
      favor
        ? `Com ${aFavor.join(" e ")}, pode colar em ${rpmSugerido} rpm.`
        : `Mantém o centro ${advice.center} rpm.`
    }`;
  }

  return { rpmSugerido, aFavor, contra, conselho };
}
