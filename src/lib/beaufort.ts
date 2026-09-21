/**
 * Proa · TugLife Systems — Escala Beaufort e a altura de onda que ela sugere
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.16.0  (módulo novo nesta versão)
 * @data     2026-09-21 12:00 UTC  (ano 2026)
 *
 * POR QUE ISTO EXISTE (P15, item 15.6)
 * O app tem TRÊS números para a altura do mar e, até aqui, comparava dois:
 * o Hs MEDIDO no casco (dupla integração do heave) e o Hs PREVISTO pela
 * Open-Meteo. O terceiro é o que o vento "deveria" produzir — e ele custa
 * nada, porque o vento já está no contexto. Quando os três discordam, é o
 * sensor, a previsão ou o mar de fundo que está mentindo, e saber qual é o
 * começo da validação embarcada do motor de heave, pendente desde a 1.1.0.
 *
 * A FONTE
 * A tabela é a do Atlas de Cartas Piloto da DHN (2ª ed., página da Escala
 * Beaufort), que associa a cada força uma faixa de vento em nós e um aspecto
 * do mar com altura típica. A escala Beaufort é convenção pública (WMO); a
 * altura por força é a que a DHN imprime na carta, reproduzida aqui como
 * valor nominal — uso educativo, conforme decidido para o material do atlas.
 *
 * O QUE A ALTURA POR FORÇA NÃO É
 * Não é Hs de mar completamente desenvolvido nem depende de pista (fetch) ou
 * duração — é o "aspecto do mar" de quem olha pela janela do passadiço. Por
 * isso o valor sai rotulado "esperado pro vento", nunca "previsto". Mar de
 * fundo (swell) vindo de longe passa por cima de qualquer Beaufort.
 * ---------------------------------------------------------------------------
 */

export type BeaufortRow = {
  force: number;
  /** Nome como na carta da DHN. */
  nome: string;
  /** Vento mínimo da faixa, em nós (inclusive). */
  minKn: number;
  /** Vento máximo da faixa, em nós (inclusive); `Infinity` na força 12. */
  maxKn: number;
  /** Altura de onda típica na carta, em m; `null` onde a carta não dá número. */
  alturaM: number | null;
};

/** A tabela da carta, força 0 a 12. Onde a carta dá uma faixa, vai o meio. */
export const BEAUFORT: readonly BeaufortRow[] = [
  { force: 0, nome: "Calmaria", minKn: 0, maxKn: 0.99, alturaM: 0 },
  { force: 1, nome: "Bafagem", minKn: 1, maxKn: 3, alturaM: 0.1 },
  { force: 2, nome: "Aragem", minKn: 4, maxKn: 6, alturaM: 0.3 },
  { force: 3, nome: "Fraco", minKn: 7, maxKn: 10, alturaM: 0.6 },
  { force: 4, nome: "Moderado", minKn: 11, maxKn: 16, alturaM: 1.5 },
  { force: 5, nome: "Fresco", minKn: 17, maxKn: 21, alturaM: 2.4 },
  { force: 6, nome: "Muito fresco", minKn: 22, maxKn: 27, alturaM: 3.6 },
  { force: 7, nome: "Forte", minKn: 28, maxKn: 33, alturaM: 4.8 },
  { force: 8, nome: "Muito forte", minKn: 34, maxKn: 40, alturaM: 6.5 },
  { force: 9, nome: "Duro", minKn: 41, maxKn: 47, alturaM: 8.5 },
  { force: 10, nome: "Muito duro", minKn: 48, maxKn: 55, alturaM: 10.5 },
  { force: 11, nome: "Tempestuoso", minKn: 56, maxKn: 63, alturaM: 14 },
  { force: 12, nome: "Furacão", minKn: 64, maxKn: Number.POSITIVE_INFINITY, alturaM: null },
];

/**
 * A força Beaufort de um vento em nós, pela faixa da carta.
 *
 * Comportamento conforme as variáveis:
 *   negativo, NaN, nulo → `null`
 *   0 ≤ v < 1           → 0
 *   fronteiras          → a carta usa inteiros (7–10, 11–16…); 10,5 nós cai
 *                         na força de cima, porque arredondar o vento é o que
 *                         o observador faz antes de olhar a tabela
 *   ≥ 64                → 12
 */
export function beaufortFromKn(kn: number | null | undefined): number | null {
  if (kn == null || !Number.isFinite(kn) || kn < 0) return null;
  const v = kn < 1 ? kn : Math.round(kn);
  const row = BEAUFORT.find((r) => v >= r.minKn && v <= r.maxKn);
  return row ? row.force : null;
}

/** A linha da carta para uma força. */
export function beaufortRow(force: number): BeaufortRow | null {
  return BEAUFORT[force] ?? null;
}

/**
 * Altura de onda que o vento sugere, em m, interpolada entre os pontos da
 * carta para não dar degrau de 0,6 → 1,5 m entre 10 e 11 nós.
 *
 * Comportamento conforme as variáveis:
 *   vento nulo/inválido        → `null`
 *   abaixo do centro da força 1 → 0
 *   entre dois centros de faixa → interpolação linear entre as alturas
 *   acima do centro da força 11 → 14 m (a carta para de dar número na 12)
 *
 * O "centro" de cada força é o meio da faixa de vento — o ponto em que a
 * altura da carta é mais representativa.
 */
export function expectedHsFromWindKn(kn: number | null | undefined): number | null {
  if (kn == null || !Number.isFinite(kn) || kn < 0) return null;
  const pts = BEAUFORT.filter((r) => r.alturaM != null && Number.isFinite(r.maxKn)).map((r) => ({
    kn: (r.minKn + r.maxKn) / 2,
    h: r.alturaM as number,
  }));
  if (kn <= pts[0].kn) return 0;
  const last = pts[pts.length - 1];
  if (kn >= last.kn) return last.h;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (kn <= b.kn) {
      const t = (kn - a.kn) / (b.kn - a.kn);
      return Number((a.h + t * (b.h - a.h)).toFixed(2));
    }
  }
  return last.h;
}
