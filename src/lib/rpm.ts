/**
 * Proa · TugLife Systems — Faixa de RPM de viagem
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.6.0
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * MODIFICAÇÕES DA VERSÃO 1.2.0
 *  1. Corrigido o erro DIMENSIONAL da declividade de onda. A versão 1.0.0 usava
 *     `Hs/T`, que tem unidade de m/s e não é declividade nenhuma. Declividade é
 *     adimensional: `Hs/L`, e em águas profundas `L = g·T²/(2π)`. A diferença
 *     não é de gosto: `Hs/T` cai com 1/T e `Hs/L` cai com 1/T², de modo que a
 *     fórmula antiga punia um swell longo e benigno quase tanto quanto uma
 *     vaga curta e castigante — exatamente a distinção que importa a bordo.
 *     A constante foi recalibrada para preservar a penalidade no ponto de
 *     referência (ver `STEEPNESS_RPM`), de modo que só a RESPOSTA AO PERÍODO
 *     muda, não a agressividade geral do modelo.
 *
 * MODIFICAÇÕES DA VERSÃO 1.6.0
 *  2. A penalidade de ALTURA passa a usar a resistência adicionada em ondas
 *     pela formulação STAWAVE-1 (ISO 15016 / ITTC 7.5-02-07-02.2), que escala
 *     com **Hs²**, e não linearmente com Hs como na 1.2.0. Dobrar a altura de
 *     onda quadruplica a resistência: é o que a física manda e o que o casco
 *     sente. O modelo antigo era brando demais em mar grosso e severo demais
 *     em mar fraco.
 *  3. O modelo passa a CONHECER O CASCO. Boca e comprimento de proa na linha
 *     d'água entram como perfil editável, do mesmo jeito que o perfil de
 *     motor. Um rebocador mais boçudo sente mais resistência adicionada com o
 *     mesmo mar, e agora a faixa reflete isso.
 *  4. `RpmAdvice` devolve `addedResistanceKn` — o mar deixa de ser só um
 *     número abstrato de rpm e vira a força que está comendo o bollard pull.
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

/** Massa específica da água do mar, em kg/m³. */
const RHO_SEA = 1025;

/** Período assumido quando o sensor não fecha um Tz confiável, em segundos. */
const FALLBACK_PERIOD_S = 7.5;

/**
 * Particulares do casco que a resistência adicionada em ondas consome.
 *
 * `bowLengthM` é o L_BWL da STAWAVE-1: o comprimento da proa medido na linha
 * d'água até a seção onde o casco atinge 95 % da boca máxima. Num rebocador
 * ASD de proa cheia isso é curto — uns 6 a 8 m num casco de 30 m — e é
 * justamente essa proa curta e larga que faz o rebocador martelar no mar de
 * proa em vez de cortá-lo.
 */
export type HullProfile = {
  /** Boca moldada, em metros. */
  beamM: number;
  /** Comprimento da proa na linha d'água até 95 % da boca, em metros. */
  bowLengthM: number;
};

/** Rebocador de porto representativo: LOA ~30 m, boca 11,5 m, proa curta. */
export const DEFAULT_HULL: HullProfile = { beamM: 11.5, bowLengthM: 7 };

/**
 * Resistência adicionada em ondas de proa, em newtons — STAWAVE-1.
 *
 *   R_AWL = (1/16) · ρ · g · Hs² · B · √(B / L_BWL)
 *
 * É a formulação simplificada da ISO 15016 / ITTC, usada quando não há ensaio
 * de seakeeping do casco. Note o que ela diz e o que ela não diz:
 *
 *   DIZ que a resistência cresce com o QUADRADO da altura significativa.
 *     Hs 1,5 m custa 21 kN a este casco; Hs 3,0 m custa 83 kN, quatro vezes
 *     mais, não o dobro. Era exatamente isso que a 1.2.0 errava.
 *   DIZ que a boca pesa, e mais que linearmente: B·√(B/L_BWL). Proa curta e
 *     larga — a assinatura do ASD — aumenta o termo.
 *   NÃO DIZ nada sobre período. Por isso o termo de declividade continua ao
 *     lado: é ele que separa o swell que embala da vaga que martela.
 *
 * RESSALVA DE VALIDADE, que fica registrada de propósito: a STAWAVE-1 foi
 * levantada para navios mercantes, bem maiores que um rebocador de 30 m, e
 * tende a superestimar em casco pequeno. A FORMA da curva é física; a ESCALA
 * em rpm (`AW_RPM_PER_KN`) é empírica e espera dado de viagem real.
 *
 * @param hsM  altura significativa, em metros
 * @param hull particulares do casco
 */
export function addedResistanceN(hsM: number, hull: HullProfile): number {
  const B = hull.beamM;
  const L = hull.bowLengthM;
  if (!(hsM > 0) || !(B > 0) || !(L > 0)) return 0;
  return (1 / 16) * RHO_SEA * G * hsM * hsM * B * Math.sqrt(B / L);
}

/** O mesmo, em quilonewtons — a unidade em que se fala de tração a bordo. */
export function addedResistanceKn(hsM: number, hull: HullProfile): number {
  return addedResistanceN(hsM, hull) / 1000;
}

/**
 * Quantos rpm de prudência por quilonewton de resistência adicionada.
 *
 * Esta é a ÚNICA constante empírica do termo de altura, e a que espera
 * calibração de campo. Foi fixada preservando o ponto de referência da 1.2.0:
 *   casco padrão, Hs 1,5 m → R_AWL = 20,8 kN
 *   penalidade da 1.2.0    → 1,5 × 78 = 117 rpm
 *   logo                   → 117 / 20,8 ≈ 5,6 rpm/kN
 * Ou seja: na viagem costeira típica o modelo não mudou de temperamento, e o
 * que mudou foi a CURVA — mais branda em mar fraco, mais severa em mar grosso.
 *
 * Comportamento conforme a altura, casco padrão, termo de altura só:
 *   Hs 0,5 m →   2,3 kN →  13 rpm   (antes 39)
 *   Hs 1,0 m →   9,3 kN →  52 rpm   (antes 78)
 *   Hs 1,5 m →  20,8 kN → 117 rpm   (calibração)
 *   Hs 2,5 m →  57,9 kN → 325 rpm   (antes 195)
 *   Hs 3,0 m →  83,3 kN → 468 rpm   (antes 234)
 *
 * Acima de Hs ~3 m a faixa satura no piso de marcha lenta e o modelo perde
 * resolução. Para um rebocador de 30 m isso é sea state 5 e acima: já não é
 * viagem, é sobrevivência, e mandar reduzir ao mínimo é a resposta certa
 * mesmo sem resolução fina.
 */
const AW_RPM_PER_KN = 5.6;

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
 * Esta constante é irmã de `AW_RPM_PER_KN`: as duas são empíricas e as duas
 * esperam calibração contra viagem real. A diferença é que a forma de ambas
 * já é física — Hs² para a altura, 1/T² para a declividade.
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
  /** Resistência adicionada pela onda, em kN — o que o mar come do bollard. */
  addedResistanceKn: number;
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
  hull?: HullProfile;
  currentRpm: number;
  hsM: number;
  periodS: number;
  windKn: number;
  headingDeg: number | null;
  waveDirDeg: number | null;
}): RpmAdvice {
  const { profile, currentRpm, hsM, periodS, windKn, headingDeg, waveDirDeg } =
    opts;
  const hull = opts.hull ?? DEFAULT_HULL;

  // Dois termos, dois efeitos distintos: a ALTURA cobra a resistência que a
  // onda adiciona ao casco (STAWAVE-1, ∝ Hs²), a DECLIVIDADE cobra o castigo
  // do impacto. Uma onda de 2 m em 14 s embala; a mesma altura em 6 s martela,
  // e a STAWAVE-1 sozinha não distingue as duas porque ignora o período.
  const awKn = addedResistanceKn(hsM, hull);
  const steep = waveSteepness(hsM, periodS);
  const seaPenalty = awKn * AW_RPM_PER_KN + steep * STEEPNESS_RPM;
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
    addedResistanceKn: Math.round(awKn * 10) / 10,
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
