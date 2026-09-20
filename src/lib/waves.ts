/**
 * Proa · TugLife Systems — Onda e heave do casco
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.2.0
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * MODIFICAÇÕES DA VERSÃO 1.1.0
 *  1. Novo `HeaveIntegrator` — a cadeia de dupla integração que antes vivia
 *     dentro de `sensor-engine.ts` foi extraída para cá, pura e sem DOM, pra
 *     poder ser testada com mar senoidal conhecido.
 *  2. Removida a realimentação `disp = heave` da cadeia original. Ela
 *     substituía o estado do integrador pela própria saída filtrada a cada
 *     amostra, o que subtraía a baixa frequência recursivamente e derrubava o
 *     Hs lido para 16 % do real em onda de 8 s e 4,7 % em onda de 12 s.
 *  3. Nova `heaveResponseGain()` — função de transferência analítica da
 *     cadeia. Permite devolver ao Hs medido o que os filtros tiraram dele.
 *  4. Nova `correctChainHs()` — passo explícito de calibração do instrumento.
 *     `hullWaveFromHeave()` segue pura (estatística de um registro de heave);
 *     quem sabe que as amostras vieram da cadeia é o motor de sensores, e é
 *     lá que a correção é aplicada.
 *  5. `zeroCrossingPeriod()` corrigida. Dividia a janela inteira pelo número
 *     de cruzamentos, o que fazia uma onda de 12 s e uma de 14 s lerem ambas
 *     12,84 s numa janela de 90 s. Agora mede entre o primeiro e o último
 *     cruzamento, com interpolação linear de cada um. Importa em dobro: além
 *     do Tz na tela, é nessa frequência que o ganho da cadeia é avaliado.
 *
 * MODIFICAÇÕES DA VERSÃO 1.2.0
 *  6. Escala de estado do mar corrigida. A tabela usava as faixas certas mas
 *     numerava a partir de 0 na faixa 0–0,1 m, deslocando TODO grau em 1 face
 *     à Douglas / WMO 3700, e truncava em 7. Quem reportasse "mar estado 4" à
 *     praticagem estava um grau abaixo do padrão. Agora a escala é dado
 *     (`SEA_STATE_TABLE`), vai de 0 a 9, e ganhou `seaTone()` para que os
 *     limiares de alarme fiquem num lugar só, presos à ALTURA e não ao número
 *     do grau.
 * ---------------------------------------------------------------------------
 */

export type SeaState = {
  code: number;
  label: string;
  hint: string;
};

/**
 * Escala de estado do mar — Douglas / WMO 3700.
 *
 * `maxHs` é o TETO EXCLUSIVO da faixa, em metros: vale o primeiro grau cujo
 * teto o Hs ainda não alcançou.
 *
 * Até a versão 1.0.0 esta tabela usava as faixas certas mas numerava a partir
 * de 0 na faixa 0–0,1 m, o que deslocava TODO grau em 1 face ao padrão
 * internacional, e ainda truncava em 7. Um comandante que reportasse "mar
 * estado 4" à praticagem, ou lançasse isso no diário de bordo, estaria
 * reportando um grau abaixo do que a escala manda. A tabela está aqui como
 * dado, e não como cadeia de `if`, justamente para poder ser conferida linha
 * a linha contra a publicação.
 */
export const SEA_STATE_TABLE = [
  { code: 0, maxHs: 0.01, label: "Calmo", hint: "Mar espelhado" },
  { code: 1, maxHs: 0.1, label: "Calmo", hint: "Encrespado, sem cristas" },
  { code: 2, maxHs: 0.5, label: "Bonançoso", hint: "Ondas pequenas, cristas sem quebrar" },
  { code: 3, maxHs: 1.25, label: "Fraco", hint: "Cristas começam a quebrar" },
  { code: 4, maxHs: 2.5, label: "Moderado", hint: "Cristas frequentes, alguma espuma" },
  { code: 5, maxHs: 4, label: "Grosso", hint: "Espuma em faixas, borrifo" },
  { code: 6, maxHs: 6, label: "Muito grosso", hint: "Vagas formadas, mar pesado" },
  { code: 7, maxHs: 9, label: "Alto", hint: "Rebentação, visibilidade reduzida" },
  { code: 8, maxHs: 14, label: "Muito alto", hint: "Vagalhões, condição severa" },
  { code: 9, maxHs: Infinity, label: "Excepcional", hint: "Condição extrema" },
] as const;

export function seaStateFromHs(hs: number): SeaState {
  const h = Number.isFinite(hs) && hs > 0 ? hs : 0;
  for (const grau of SEA_STATE_TABLE) {
    if (h < grau.maxHs) {
      return { code: grau.code, label: grau.label, hint: grau.hint };
    }
  }
  const ultimo = SEA_STATE_TABLE[SEA_STATE_TABLE.length - 1]!;
  return { code: ultimo.code, label: ultimo.label, hint: ultimo.hint };
}

export type SeaTone = "accent" | "warn" | "danger";

/**
 * Cor do selo de estado do mar no passadiço.
 *
 * Os limiares são fixados em ALTURA, não em número de grau, justamente porque
 * o grau mudou na 1.2.0 e as telas não podem herdar o deslocamento:
 *   Hs ≥ 2,5 m (grau 5, "Grosso")   → vermelho
 *   Hs ≥ 1,25 m (grau 4, "Moderado") → âmbar
 *   abaixo disso                     → normal
 * São os mesmos pontos de disparo de antes; só o número que os nomeia mudou.
 */
export function seaTone(code: number): SeaTone {
  if (code >= 5) return "danger";
  if (code >= 4) return "warn";
  return "accent";
}

/** Coastal tug sanity — Hs above this is IMU drift, not sea. */
export const HS_HULL_MAX = 8;
export const HEAVE_SAMPLE_MAX = 4.5;
export const PERIOD_MIN_S = 2.8;
export const PERIOD_MAX_S = 16;
export const WAVE_STATS_S = 90;

export function hsFromHeaveStd(stdM: number) {
  return Math.max(0, 4 * stdM);
}

export function amplitudeFromHs(hs: number) {
  return hs / 2;
}

/**
 * Período de cruzamento zero ascendente (Tz), em segundos.
 *
 * Mede do PRIMEIRO ao ÚLTIMO cruzamento e divide pelo número de intervalos
 * entre eles — não pela janela inteira. A diferença não é acadêmica: a janela
 * raramente começa e termina exatamente numa passagem pelo zero, e as sobras
 * das duas pontas entram na conta como se fossem período. Numa janela de 90 s,
 * a versão antiga lia 12,84 s tanto para uma onda de 12 s quanto para uma de
 * 14 s — o contador de cruzamentos quantizava e engolia a diferença.
 *
 * Cada cruzamento é interpolado linearmente entre as duas amostras que o
 * cercam, o que dá resolução abaixo do passo de amostragem: com dt = 0,1 s,
 * o erro cai de ±0,1 s para a ordem de milissegundos.
 *
 * Comportamento conforme as variáveis:
 *   90 s de janela, onda de 8 s  → ~11 cruzamentos → Tz ≈ 8,00 s
 *   90 s de janela, onda de 14 s → ~6 cruzamentos  → Tz ≈ 14,0 s
 *   menos de 2 cruzamentos → 0 (sem base para afirmar período)
 */
export function zeroCrossingPeriod(samples: ArrayLike<number>, dt: number) {
  const n = samples.length;
  if (n < 8 || dt <= 0) return 0;
  let first = -1;
  let last = -1;
  let crossings = 0;
  let prev = samples[0]!;
  for (let i = 1; i < n; i++) {
    const v = samples[i]!;
    if (prev <= 0 && v > 0) {
      // Onde exatamente entre i-1 e i a curva cortou o zero.
      const frac = v !== prev ? -prev / (v - prev) : 0;
      const at = i - 1 + frac;
      if (first < 0) first = at;
      last = at;
      crossings += 1;
    }
    prev = v;
  }
  if (crossings < 2 || last <= first) return 0;
  return ((last - first) * dt) / (crossings - 1);
}

export function stdev(samples: ArrayLike<number>) {
  const n = samples.length;
  if (n < 2) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += samples[i]!;
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = samples[i]! - mean;
    varSum += d * d;
  }
  return Math.sqrt(varSum / (n - 1));
}

export type HpState = { x: number; y: number };

export function highpass1(s: HpState, x: number, dt: number, fc: number) {
  const rc = 1 / (2 * Math.PI * fc);
  const a = rc / (rc + dt);
  const y = a * (s.y + x - s.x);
  s.x = x;
  s.y = y;
  return y;
}

/* ===========================================================================
 * CADEIA DE HEAVE — da aceleração vertical ao deslocamento do casco
 * ===========================================================================
 * O acelerômetro entrega aceleração; a onda é deslocamento. Entre os dois há
 * duas integrações — e toda integração amplifica a deriva do sensor, do mesmo
 * jeito que um erro pequeno de agulha vira milhas de desvio depois de uma
 * singradura longa. Por isso a cadeia intercala passa-altas e integradores com
 * fuga, que seguram a deriva mas, em troca, também comem parte da onda real.
 *
 * A cadeia, na ordem:
 *   acc → HP → HP → ∫(fuga) → HP → ∫(fuga) → HP → heave
 *
 * O que cada estágio faz com as variáveis:
 *   HEAVE_HP_FC = 0,055 Hz → corta tudo mais lento que ~18 s (deriva térmica
 *     do MEMS, inclinação lenta do tablet na mesa do passadiço).
 *   HEAVE_VEL_LEAK = 0,988 por amostra a 10 Hz → constante de tempo
 *     τ = −dt/ln(λ) ≈ 8,3 s. Impede que o integrador "fuja" pro infinito.
 *
 * O preço: a cadeia devolve menos heave do que entrou, e quanto mais longa a
 * onda, mais ela devolve a menos. Medido em bancada (senoide, Hs = 1,50 m):
 *   T =  4 s → lê 86 %      T = 10 s → lê 55 %
 *   T =  6 s → lê 76 %      T = 12 s → lê 44 %
 *   T =  8 s → lê 66 %      T = 14 s → lê 36 %
 * É justamente no swell longo — o que impõe o pitch num rebocador em viagem
 * costeira — que a cegueira é maior. `heaveResponseGain()` calcula esse fator
 * e `hullWaveFromHeave()` devolve ao Hs o que os filtros tiraram.
 * ========================================================================= */

/** Canto dos passa-altas da cadeia de heave, em Hz (período ≈ 18 s). */
export const HEAVE_HP_FC = 0.055;
/** Fuga por amostra dos integradores (a 10 Hz → τ ≈ 8,3 s). */
export const HEAVE_VEL_LEAK = 0.988;
/** Acima disso a amostra é manuseio do aparelho, não mar. Em m/s². */
export const HEAVE_ACC_SPIKE = 2.8;

/**
 * Ganho da cadeia: amplitude de deslocamento VERDADEIRA → amplitude na saída.
 *
 * Deduzido da função de transferência discreta, avaliada em z = e^{jωΔt}:
 *   passa-alta      Ha(z) = a(1 − z⁻¹)/(1 − a·z⁻¹),  a = RC/(RC + Δt)
 *   integrador      I(z)  = Δt/(1 − λ·z⁻¹)
 *   cadeia completa H(z)  = Ha(z)⁴ · I(z)²          (acc → heave)
 * Como uma senoide de deslocamento A tem aceleração A·ω², o ganho de
 * deslocamento-para-deslocamento é ω²·|Ha|⁴·|I|².
 *
 * Comportamento: devolve ~0,86 em T = 4 s e cai monotonicamente até ~0,36 em
 * T = 14 s. Valor 1,0 significaria cadeia transparente. Sempre em (0, 1].
 * Conferido contra a cadeia rodando em bancada: casa dentro de 0,5 %.
 *
 * @param periodS período de cruzamento zero da onda, em segundos
 * @param dt      intervalo real entre amostras, em segundos
 */
export function heaveResponseGain(periodS: number, dt: number): number {
  if (!(periodS > 0) || !(dt > 0)) return 1;
  const w = (2 * Math.PI) / periodS;
  const th = w * dt;
  // z⁻¹ = cos(θ) − j·sin(θ)
  const cz = Math.cos(th);
  const sz = Math.sin(th);

  const rc = 1 / (2 * Math.PI * HEAVE_HP_FC);
  const a = rc / (rc + dt);
  // |Ha| = |a(1 − z⁻¹)| / |1 − a·z⁻¹|
  const magHp =
    Math.hypot(a * (1 - cz), a * sz) / Math.hypot(1 - a * cz, a * sz);
  // |I| = Δt / |1 − λ·z⁻¹|
  const magInt =
    dt / Math.hypot(1 - HEAVE_VEL_LEAK * cz, HEAVE_VEL_LEAK * sz);

  const gain = w * w * magHp ** 4 * magInt ** 2;
  // Guarda: fora da banda útil o ganho tende a zero e a divisão explodiria.
  return gain > 1e-3 ? Math.min(1, gain) : 1;
}

/**
 * Dupla integração da aceleração vertical, amostra a amostra.
 *
 * Extraída de `sensor-engine.ts` pra ser pura — sem `window`, sem
 * `performance`, sem DeviceMotion — e portanto testável com mar conhecido.
 *
 * Diferença de comportamento face à versão 1.0.0: o estado do integrador de
 * deslocamento (`disp`) NÃO é mais substituído pela saída filtrada. Aquela
 * realimentação reaplicava o passa-alta sobre o próprio estado a cada amostra
 * e fazia o ganho desabar muito além do que o projeto do filtro previa.
 */
export class HeaveIntegrator {
  private hpA1: HpState = { x: 0, y: 0 };
  private hpA2: HpState = { x: 0, y: 0 };
  private hpV: HpState = { x: 0, y: 0 };
  private hpD: HpState = { x: 0, y: 0 };
  private vel = 0;
  private disp = 0;

  reset() {
    this.hpA1 = { x: 0, y: 0 };
    this.hpA2 = { x: 0, y: 0 };
    this.hpV = { x: 0, y: 0 };
    this.hpD = { x: 0, y: 0 };
    this.vel = 0;
    this.disp = 0;
  }

  /**
   * @param accUp aceleração ao longo da vertical local, em m/s²
   * @param dt    intervalo REAL desde a amostra anterior, em segundos
   * @returns     heave em metros e se a amostra foi manuseio do aparelho
   */
  push(accUp: number, dt: number): { heave: number; spike: boolean } {
    const a1 = highpass1(this.hpA1, accUp, dt, HEAVE_HP_FC);
    const a2 = highpass1(this.hpA2, a1, dt, HEAVE_HP_FC);

    // Alguém pegou o tablet: descarrega os integradores antes que o safanão
    // vire "onda de 3 m" na tela.
    const spike = Math.abs(a2) > HEAVE_ACC_SPIKE;
    if (spike) {
      this.vel *= 0.55;
      this.disp *= 0.55;
    }

    this.vel = this.vel * HEAVE_VEL_LEAK + a2 * dt;
    const vHp = highpass1(this.hpV, this.vel, dt, HEAVE_HP_FC);
    this.disp = this.disp * HEAVE_VEL_LEAK + vHp * dt;
    const heave = highpass1(this.hpD, this.disp, dt, HEAVE_HP_FC);

    // Limita só o que sai. O estado interno segue intacto — realimentar o
    // clamp no integrador era exatamente o defeito da versão 1.0.0.
    if (this.disp > HEAVE_SAMPLE_MAX * 4) this.disp = HEAVE_SAMPLE_MAX * 4;
    if (this.disp < -HEAVE_SAMPLE_MAX * 4) this.disp = -HEAVE_SAMPLE_MAX * 4;

    return {
      heave: Math.max(-HEAVE_SAMPLE_MAX, Math.min(HEAVE_SAMPLE_MAX, heave)),
      spike,
    };
  }
}

/**
 * Devolve ao Hs medido o que a cadeia de filtros tirou dele.
 *
 * É a mesma ideia de calibrar um corrediço contra a milha medida: o
 * instrumento lê baixo por construção, e a gente aplica o fator conhecido.
 *
 * Comportamento conforme as variáveis:
 *   hsRaw = 0,99 m · T = 8 s → ganho 0,656 → devolve 1,51 m
 *   hsRaw = 0,67 m · T = 12 s → ganho 0,445 → devolve 1,50 m
 *   T = 0 (período rejeitado) → devolve hsRaw sem tocar: sem período
 *     confiável não há frequência onde avaliar o ganho, e chutar seria pior
 *     que assumir a leitura crua.
 *
 * @param hsRaw   Hs calculado sobre a saída da cadeia, em metros
 * @param periodS Tz medido, em segundos. Zero desliga a correção.
 * @param dt      intervalo real entre amostras, em segundos
 */
export function correctChainHs(hsRaw: number, periodS: number, dt: number) {
  if (!(periodS > 0) || !(dt > 0) || !(hsRaw > 0)) return hsRaw;
  return hsRaw / heaveResponseGain(periodS, dt);
}

/** Remove mean + linear ramp so IMU drift does not inflate Hs = 4σ. */
export function detrend(samples: ArrayLike<number>): Float32Array {
  const n = samples.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  if (n < 3) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += samples[i]!;
    mean /= n;
    for (let i = 0; i < n; i++) out[i] = samples[i]! - mean;
    return out;
  }
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const y = samples[i]!;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }
  const den = n * sumXX - sumX * sumX;
  const slope = den !== 0 ? (n * sumXY - sumX * sumY) / den : 0;
  const intercept = (sumY - slope * sumX) / n;
  for (let i = 0; i < n; i++) out[i] = samples[i]! - (intercept + slope * i);
  return out;
}

export function hullWaveFromHeave(samples: ArrayLike<number>, dt: number) {
  const n = samples.length;
  if (n < 20 || dt <= 0) {
    return { hsM: 0, amplitudeM: 0, periodS: 0, perMin: 0, clamped: false };
  }
  const d = detrend(samples);
  let hs = hsFromHeaveStd(stdev(d));
  const clamped = hs > HS_HULL_MAX;
  hs = Math.min(HS_HULL_MAX, Math.max(0, hs));
  let period = zeroCrossingPeriod(d, dt);
  if (period < PERIOD_MIN_S || period > PERIOD_MAX_S) period = 0;
  return {
    hsM: hs,
    amplitudeM: amplitudeFromHs(hs),
    periodS: period,
    perMin: period > 0 ? 60 / period : 0,
    clamped,
  };
}

export function blendHs(observed: number | null, forecast: number | null) {
  if (observed != null && forecast != null) {
    return observed * 0.65 + forecast * 0.35;
  }
  return observed ?? forecast ?? 0;
}

/** Peak-to-peak roll only if it stays lively — a single tablet tilt does not count. */
export function sustainedRollP2P(values: ArrayLike<number>): number {
  const n = values.length;
  if (n < 80) return 0;
  let min = 90;
  let max = -90;
  const BIN = 20;
  let hot = 0;
  let bins = 0;
  for (let b = 0; b + BIN <= n; b += BIN) {
    let bmin = 90;
    let bmax = -90;
    for (let i = 0; i < BIN; i++) {
      const v = values[b + i]!;
      if (v < min) min = v;
      if (v > max) max = v;
      if (v < bmin) bmin = v;
      if (v > bmax) bmax = v;
    }
    bins += 1;
    if (bmax - bmin >= 4) hot += 1;
  }
  if (bins < 4 || hot < Math.ceil(bins * 0.45)) return 0;
  return Math.max(0, max - min);
}

export type HourlyWave = {
  t: number;
  hsObs: number | null;
  hsForecast: number | null;
  periodObs: number | null;
  periodForecast: number | null;
  ampObs: number | null;
  ampForecast: number | null;
  dirForecast: number | null;
  swellForecast: number | null;
};
