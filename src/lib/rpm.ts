/**
 * Proa · TugLife Systems — Faixa de RPM de viagem
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.2.0
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * MODIFICAÇÕES DESTA VERSÃO (1.2.0)
 *  1. Corrigido o erro DIMENSIONAL da declividade de onda. A versão 1.0.0 usava
 *     `Hs/T`, que tem unidade de m/s e não é declividade nenhuma. Declividade é
 *     adimensional: `Hs/L`, e em águas profundas `L = g·T²/(2π)`. A diferença
 *     não é de gosto: `Hs/T` cai com 1/T e `Hs/L` cai com 1/T², de modo que a
 *     fórmula antiga punia um swell longo e benigno quase tanto quanto uma
 *     vaga curta e castigante — exatamente a distinção que importa a bordo.
 *     A constante foi recalibrada para preservar a penalidade no ponto de
 *     referência (ver `STEEPNESS_RPM`), de modo que só a RESPOSTA AO PERÍODO
 *     muda, não a agressividade geral do modelo.
 * ---------------------------------------------------------------------------
 */
import { clamp } from "./utils.ts";

/** Aceleração da gravidade padrão, em m/s². */
const G = 9.80665;

/**
 * Coeficiente do comprimento de onda em águas profundas: L = (g/2π)·T² ≈ 1,561·T².
 * Válido enquanto a profundidade passar de meio comprimento de onda — o que
 * vale para a derrota costeira típica de rebocador, fora da barra.
 */
const DEEP_WATER_L = G / (2 * Math.PI);

/** Período assumido quando o sensor não fecha um Tz confiável, em segundos. */
const FALLBACK_PERIOD_S = 7.5;

/**
 * Teto físico da declividade de um ESTADO DE MAR (Hs/L).
 * Uma onda individual quebra perto de 1/7 ≈ 0,143, mas a razão Hs/L de um
 * espectro inteiro raramente passa de 0,05. Acima disso é leitura suja.
 */
const STEEPNESS_MAX = 0.05;

/**
 * Penalidade de RPM por unidade de declividade.
 *
 * Calibrada no ponto de referência da viagem costeira — Hs 1,5 m, T 8 s:
 *   L    = 1,561 × 8²  = 99,9 m
 *   s    = 1,5 / 99,9  = 0,01502
 *   pena = 0,01502 × 5250 ≈ 78,8 rpm
 * que é exatamente o que a fórmula antiga (0,1875 × 420) devolvia nesse mesmo
 * ponto. Ou seja: no regime comum o modelo não mudou de temperamento; mudou
 * só como ele responde ao período.
 *
 * Comparação, em rpm de penalidade de declividade:
 *   Hs 1,5 · T  5 s → antes 126   agora 202   (vaga curta pune mais, e deve)
 *   Hs 1,5 · T  8 s → antes  79   agora  79   (ponto de calibração)
 *   Hs 1,5 · T 12 s → antes  53   agora  35   (swell longo pune menos, e deve)
 *
 * A calibração ABSOLUTA do modelo continua sendo trabalho futuro (ver GDD §9,
 * item P8: migrar a penalidade de mar para STAWAVE-1, que escala com Hs²).
 * Aqui se conserta a dimensão, não a constante empírica.
 */
const STEEPNESS_RPM = 5250;

/**
 * Declividade do estado de mar, adimensional.
 *
 * Comportamento conforme as variáveis:
 *   Hs 1,5 m · T  5 s → L =  39,0 m → s = 0,0384
 *   Hs 1,5 m · T  8 s → L =  99,9 m → s = 0,0150
 *   Hs 1,5 m · T 12 s → L = 224,8 m → s = 0,0067
 *   T ausente ou zero → assume 7,5 s, o período costeiro típico. Melhor que a
 *     constante fixa da 1.0.0, porque ao menos continua escalando com o Hs.
 */
export function waveSteepness(hsM: number, periodS: number) {
  const T = periodS > 0 ? periodS : FALLBACK_PERIOD_S;
  const L = DEEP_WATER_L * T * T;
  if (!(L > 0) || !(hsM > 0)) return 0;
  return clamp(hsM / L, 0, STEEPNESS_MAX);
}

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

  // Dois termos, dois efeitos distintos: a altura cobra o trabalho de levantar
  // o casco, a declividade cobra o castigo do impacto. Uma onda de 2 m em 14 s
  // embala; a mesma altura em 6 s martela.
  const steep = waveSteepness(hsM, periodS);
  const seaPenalty = hsM * 78 + steep * STEEPNESS_RPM;
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
    windKn >= 8 ? `vento ${windKn.toFixed(0)} nós` : null,
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
    if (a > 0.35) aFavor.push(`vento a favor ${Math.round(windKn)} nós`);
    else if (a < -0.35) contra.push(`vento de proa ${Math.round(windKn)} nós`);
  }

  if (headingDeg != null && currentDir != null && (currentKn ?? 0) >= 0.2) {
    const a = flowAlign(headingDeg, currentDir);
    const kn = (currentKn ?? 0).toFixed(1);
    if (a > 0.35) aFavor.push(`corrente a favor ${kn} nós`);
    else if (a < -0.35) contra.push(`corrente de proa ${kn} nós`);
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
