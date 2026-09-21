/**
 * Proa · TugLife Systems — Declinação magnética pelo World Magnetic Model
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.16.0  (módulo novo nesta versão)
 * @data     2026-09-21 12:00 UTC  (ano 2026)
 *
 * POR QUE ISTO EXISTE (P15, item 15.5)
 * O timoneiro governa por agulha magnética; o app mostra COG verdadeiro do
 * GPS. No Ceará a diferença passa de 22°, e no Rio Grande do Sul vai a 18°
 * pro outro lado da escala. Ninguém comenta até o dia em que o rumo "não
 * bate". A partir desta versão o Painel mostra a variação na posição, e a
 * Lara responde "qual a variação aqui?".
 *
 * POR QUE O WMM, E NÃO AS ISOGÔNICAS DO ATLAS
 * O Atlas de Cartas Piloto da DHN traz isogônicas de 2020. Com variação
 * anual de ~8' no Nordeste, em 2026 já são quase 50' de erro — quase 1°. O
 * WMM é o modelo oficial (NOAA/BGS, o mesmo do GPS de bordo e das cartas
 * eletrônicas), atualizado a cada cinco anos e com variação secular
 * embutida. O atlas entra como CRUZAMENTO nos testes: o modelo tem de cair
 * dentro do que a carta mostra, projetado pela variação anual da própria
 * carta.
 *
 * O MODELO, EM UMA TELA
 * O campo é o gradiente de um potencial em harmônicos esféricos até grau 12:
 *   V = a · Σₙ Σₘ (a/r)^(n+1) · [gₙᵐ cos(mλ) + hₙᵐ sin(mλ)] · Pₙᵐ(sin φ')
 * com Pₙᵐ de Schmidt semi-normalizados e coeficientes ajustados no tempo:
 *   g(t) = g(2025) + (t − 2025)·ġ. Do potencial saem X (norte), Y (leste) e
 * Z (baixo) em coordenadas GEOCÊNTRICAS; roda-se para geodésicas (WGS84) e
 *   D = atan2(Y, X)  é a declinação (variação magnética), + leste, − oeste.
 *
 * A implementação segue o código legado em C da NOAA (MAG_PcupLow,
 * MAG_Summation, MAG_RotateMagneticVector) passo a passo, para que os
 * valores de teste oficiais batam ao décimo de nT. Não é o lugar para
 * "simplificar": cada desvio custa um grau em algum canto do mapa.
 *
 * LIMITES
 *  - Válido de 2025.0 a 2030.0. Fora disso calcula, mas `stale` vem `true`.
 *  - Não vale a menos de 0,01° dos polos (o termo em Y divide por cos φ').
 *    Rebocador não vai lá.
 *  - Altura sobre o elipsoide em km; a bordo é zero.
 * ---------------------------------------------------------------------------
 */
import { WMM_COEFFICIENTS, WMM_EPOCH, WMM_NMAX, WMM_VALID_UNTIL } from "./wmm-2025.ts";

/** Semi-eixo maior do WGS84, km. */
const A_WGS84 = 6378.137;
/** Achatamento do WGS84. */
const F_WGS84 = 1 / 298.257223563;
/** Raio de referência geomagnético, km. */
const RE = 6371.2;

export type MagField = {
  /** Declinação (variação magnética), graus, + leste / − oeste. */
  D: number;
  /** Inclinação, graus, + para baixo. */
  I: number;
  /** Componentes em nT, referencial geodésico: norte, leste, baixo. */
  X: number;
  Y: number;
  Z: number;
  /** Intensidade horizontal e total, nT. */
  H: number;
  F: number;
  /** Fora da janela de validade dos coeficientes. */
  stale: boolean;
};

/** Ano decimal de uma data (`Date` ou ms). 2026-07-02 ≈ 2026.5. */
export function decimalYear(when: Date | number): number {
  const d = when instanceof Date ? when : new Date(when);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
}

/** Índice triangular de (n, m) nos vetores de Legendre. */
function idx(n: number, m: number): number {
  return (n * (n + 1)) / 2 + m;
}

/**
 * Funções de Legendre associadas, Schmidt semi-normalizadas, e a derivada em
 * relação à latitude geocêntrica. `x = sin φ'`. Porta fiel de MAG_PcupLow.
 */
function legendre(x: number): { P: Float64Array; dP: Float64Array } {
  const size = idx(WMM_NMAX, WMM_NMAX) + 1;
  const P = new Float64Array(size);
  const dP = new Float64Array(size);
  const S = new Float64Array(size);
  const z = Math.sqrt((1 - x) * (1 + x)); // cos φ'
  P[0] = 1;
  dP[0] = 0;
  for (let n = 1; n <= WMM_NMAX; n++) {
    for (let m = 0; m <= n; m++) {
      const i = idx(n, m);
      if (n === m) {
        const i1 = idx(n - 1, m - 1);
        P[i] = z * P[i1];
        dP[i] = z * dP[i1] + x * P[i1];
      } else if (n === 1 && m === 0) {
        const i1 = idx(n - 1, m);
        P[i] = x * P[i1];
        dP[i] = x * dP[i1] - z * P[i1];
      } else {
        const i2 = idx(n - 1, m);
        if (m > n - 2) {
          P[i] = x * P[i2];
          dP[i] = x * dP[i2] - z * P[i2];
        } else {
          const i1 = idx(n - 2, m);
          const k = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
          P[i] = x * P[i2] - k * P[i1];
          dP[i] = x * dP[i2] - z * P[i2] - k * dP[i1];
        }
      }
    }
  }
  // Fatores de Schmidt, e a derivada troca de sinal para virar d/dφ'.
  S[0] = 1;
  for (let n = 1; n <= WMM_NMAX; n++) {
    S[idx(n, 0)] = (S[idx(n - 1, 0)] * (2 * n - 1)) / n;
    for (let m = 1; m <= n; m++) {
      S[idx(n, m)] = S[idx(n, m - 1)] * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
    }
  }
  for (let n = 1; n <= WMM_NMAX; n++) {
    for (let m = 0; m <= n; m++) {
      const i = idx(n, m);
      P[i] *= S[i];
      dP[i] = -dP[i] * S[i];
    }
  }
  return { P, dP };
}

/**
 * O campo magnético em (lat, lon, altura) na data `year` (ano decimal).
 *
 * Comportamento conforme as variáveis:
 *   lat/lon fora de faixa → lança (é erro de quem chamou, não de medida)
 *   `year` fora de 2025–2030 → calcula com extrapolação, `stale: true`
 *   `heightKm` omitido → 0 (nível do mar; o elipsoide difere do geoide por
 *     dezenas de metros, irrelevante para a declinação)
 *
 * @param latDeg latitude geodésica, graus, + norte
 * @param lonDeg longitude, graus, + leste
 * @param year ano decimal
 * @param heightKm altura sobre o elipsoide WGS84, km
 */
export function magneticField(latDeg: number, lonDeg: number, year: number, heightKm = 0): MagField {
  if (!(latDeg >= -90 && latDeg <= 90)) throw new RangeError(`latitude ${latDeg}`);
  if (!(lonDeg >= -360 && lonDeg <= 360)) throw new RangeError(`longitude ${lonDeg}`);
  const dt = year - WMM_EPOCH;
  const stale = year < WMM_EPOCH || year > WMM_VALID_UNTIL;

  // Geodésico → geocêntrico (WGS84).
  const phi = (latDeg * Math.PI) / 180;
  const lam = (lonDeg * Math.PI) / 180;
  const e2 = F_WGS84 * (2 - F_WGS84);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const rc = A_WGS84 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const p = (rc + heightKm) * cosPhi;
  const zc = (rc * (1 - e2) + heightKm) * sinPhi;
  const r = Math.hypot(p, zc);
  const phiGc = Math.atan2(zc, p);

  const { P, dP } = legendre(Math.sin(phiGc));
  const cosPhiGc = Math.cos(phiGc);

  // Somatório dos harmônicos. Potências de (Re/r) por grau, senos e cossenos
  // de mλ por ordem, uma vez cada.
  const ratio = RE / r;
  const pow = new Float64Array(WMM_NMAX + 1);
  pow[0] = ratio * ratio;
  for (let n = 1; n <= WMM_NMAX; n++) pow[n] = pow[n - 1] * ratio;
  const cosM = new Float64Array(WMM_NMAX + 1);
  const sinM = new Float64Array(WMM_NMAX + 1);
  for (let m = 0; m <= WMM_NMAX; m++) {
    cosM[m] = Math.cos(m * lam);
    sinM[m] = Math.sin(m * lam);
  }

  let bx = 0;
  let by = 0;
  let bz = 0;
  for (const [n, m, g0, h0, gd, hd] of WMM_COEFFICIENTS) {
    const g = g0 + dt * gd;
    const h = h0 + dt * hd;
    const i = idx(n, m);
    const rp = pow[n]; // (Re/r)^(n+2)
    const a = g * cosM[m] + h * sinM[m];
    bz -= rp * a * (n + 1) * P[i];
    by += rp * (g * sinM[m] - h * cosM[m]) * m * P[i];
    bx -= rp * a * dP[i];
  }
  if (Math.abs(cosPhiGc) < 1e-10) throw new RangeError("modelo não vale sobre o polo");
  by /= cosPhiGc;

  // Geocêntrico → geodésico: gira X e Z pelo ângulo entre as latitudes.
  const psi = phiGc - phi;
  const X = bx * Math.cos(psi) - bz * Math.sin(psi);
  const Z = bx * Math.sin(psi) + bz * Math.cos(psi);
  const Y = by;
  const H = Math.hypot(X, Y);
  const Fmag = Math.hypot(H, Z);
  const D = (Math.atan2(Y, X) * 180) / Math.PI;
  const I = (Math.atan2(Z, H) * 180) / Math.PI;
  return { D, I, X, Y, Z, H, F: Fmag, stale };
}

/** Só a declinação, em graus (+ leste, − oeste). */
export function declinationDeg(latDeg: number, lonDeg: number, year: number): number {
  return magneticField(latDeg, lonDeg, year).D;
}

/**
 * A declinação como se lê no passadiço: `22°18' W`. Meio minuto arredonda
 * pra cima; zero é "0°00'" sem letra.
 */
export function formatDeclination(deg: number): string {
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  let m = Math.round((abs - d) * 60);
  if (m === 60) {
    d += 1;
    m = 0;
  }
  const side = deg > 0 ? " E" : deg < 0 ? " W" : "";
  return `${d}°${String(m).padStart(2, "0")}'${side}`;
}
