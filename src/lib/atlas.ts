/**
 * Proa · TugLife Systems — Consulta ao Atlas de Cartas Piloto (climatologia)
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.17.0  (módulo novo nesta versão)
 * @data     2026-09-21 12:00 UTC  (ano 2026)
 *
 * O QUE ISTO É (P15, Etapa B, item 15.1)
 * A leitura, no app, do dado digitalizado do Atlas de Cartas Piloto da DHN
 * (`src/data/atlas-dhn.json`, gerado por `scripts/atlas-extract.py`). Para
 * uma posição e um mês: a rosa dos ventos mais próxima (frequência por
 * octante e força Beaufort), a corrente mais próxima (para onde corre e
 * quantos nós), e nevoeiro / vento forte / visibilidade quando há nó por
 * perto.
 *
 * O QUE ISTO NÃO É
 * Não é previsão. É o que foi TÍPICO naquele mês, naquela célula de 5°
 * (≈ 300 milhas), nas observações de 1985–2013. Brisa de terra, pluma de
 * rio, plataforma rasa — nada disso aparece. Toda resposta sai com a palavra
 * "climatologia" e a distância até o dado, para que ninguém tome decisão de
 * hoje com média de trinta anos sem saber que está fazendo isso. O pilar é o
 * mesmo do resto do app: medir, não adivinhar — e quando não há medida,
 * dizer de onde veio o número.
 *
 * DISTÂNCIAS
 * Rosa e corrente valem até `ROSE_REACH_NM` / `CURRENT_REACH_NM` do ponto;
 * além disso devolve-se `null`, e não "a mais próxima, ainda que a 600
 * milhas". A carta cobre de Trinidad ao Rio da Prata.
 *
 * LICENÇA
 * Dado derivado do atlas para FINALIDADE EDUCATIVA apenas (decisão do
 * projeto). © Marinha do Brasil / DHN sobre a obra original.
 * ---------------------------------------------------------------------------
 */
import atlas from "../data/atlas-dhn.json" with { type: "json" };
import { haversineNm } from "./geo.ts";

export type Octant = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export const OCTANTS: readonly Octant[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export type AtlasRose = {
  lat: number;
  lon: number;
  /** Rosa pontilhada na carta: menos de 200 observações. */
  poucosDados: boolean;
  /** Calmaria em %, quando impressa; `null` = não impressa. */
  calma: number | null;
  /** Por octante DE ONDE sopra: frequência (%) e força Beaufort (penas). */
  oct: Partial<Record<Octant, { pct: number; bf: number | null }>>;
  /** Soma dos octantes + calmaria, como conferência (100 ± alguns %). */
  soma: number;
};

export type AtlasCurrent = {
  lat: number;
  lon: number;
  /** Graus verdadeiros PARA ONDE corre. */
  dir: number;
  /** Nós; `null` = seta sem rótulo. */
  kn: number | null;
};

export type AtlasNode = { lat: number; lon: number; pct: number };

export type AtlasMonth = {
  mes: number;
  nome: string;
  rosas: AtlasRose[];
  correntes: AtlasCurrent[];
  nevoeiro: AtlasNode[];
  ventoForte: AtlasNode[];
  visibilidade: AtlasNode[];
};

type AtlasFile = {
  fonte: string;
  licenca: string;
  gerado: string;
  meses: AtlasMonth[];
};

const DATA = atlas as unknown as AtlasFile;

/** Alcance máximo para uma rosa valer para o ponto, em milhas. Meia célula de 5° na diagonal. */
export const ROSE_REACH_NM = 220;
/** Alcance para uma seta de corrente. As setas ficam ao largo; perto da costa a mais próxima pode estar a 200 mn. */
export const CURRENT_REACH_NM = 240;
/** Alcance para um nó do verso (nevoeiro, vento forte). */
export const NODE_REACH_NM = 220;

export const ATLAS_FONTE = DATA.fonte;
export const ATLAS_LICENCA = DATA.licenca;

/** O mês do atlas (1–12). Fora da faixa lança: é erro de quem chamou. */
export function atlasMonth(mes: number): AtlasMonth {
  const m = DATA.meses[mes - 1];
  if (!m) throw new RangeError(`mês ${mes}`);
  return m;
}

function nearestWithin<T extends { lat: number; lon: number }>(
  items: readonly T[],
  lat: number,
  lon: number,
  reachNm: number,
): { item: T; nm: number } | null {
  let best: { item: T; nm: number } | null = null;
  for (const it of items) {
    const nm = haversineNm(lat, lon, it.lat, it.lon);
    if (nm <= reachNm && (!best || nm < best.nm)) best = { item: it, nm };
  }
  return best;
}

/** A rosa mais próxima dentro do alcance, com a distância em milhas. */
export function nearestRose(lat: number, lon: number, mes: number) {
  return nearestWithin(atlasMonth(mes).rosas, lat, lon, ROSE_REACH_NM);
}

/** A corrente mais próxima dentro do alcance. Prefere setas COM velocidade quando a distância empata em ±30 mn. */
export function nearestCurrent(lat: number, lon: number, mes: number) {
  const all = atlasMonth(mes).correntes;
  const labelled = nearestWithin(all.filter((c) => c.kn != null), lat, lon, CURRENT_REACH_NM);
  const any = nearestWithin(all, lat, lon, CURRENT_REACH_NM);
  if (labelled && any && labelled.nm - any.nm <= 30) return labelled;
  return any;
}

export function nearestNode(kind: "nevoeiro" | "ventoForte" | "visibilidade", lat: number, lon: number, mes: number) {
  return nearestWithin(atlasMonth(mes)[kind], lat, lon, NODE_REACH_NM);
}

/** Octantes em ordem de frequência, maior primeiro. */
export function rankedOctants(rose: AtlasRose): { oct: Octant; pct: number; bf: number | null }[] {
  return OCTANTS.filter((o) => rose.oct[o])
    .map((o) => ({ oct: o, pct: rose.oct[o]!.pct, bf: rose.oct[o]!.bf }))
    .sort((a, b) => b.pct - a.pct);
}

const OCT_PT: Record<Octant, string> = {
  N: "norte", NE: "nordeste", E: "leste", SE: "sudeste", S: "sul", SW: "sudoeste", W: "oeste", NW: "noroeste",
};

/** Ponto cardeal PARA ONDE, a partir de um rumo em graus. */
function toward(dir: number): string {
  const i = Math.round((((dir % 360) + 360) % 360) / 45) % 8;
  return OCT_PT[OCTANTS[i]];
}

export type AtlasSummary = {
  mes: string;
  /** Texto de passadiço, com a palavra "climatologia" e as distâncias. */
  texto: string;
  rosa: { oct: Octant; pct: number; bf: number | null }[] | null;
  rosaNm: number | null;
  calma: number | null;
  poucosDados: boolean;
  corrente: { dir: number; kn: number | null; nm: number } | null;
  nevoeiroPct: number | null;
  ventoFortePct: number | null;
};

/**
 * Resumo climatológico para uma posição e um mês, pronto para a Lara.
 *
 * Comportamento conforme as variáveis:
 *   sem rosa nem corrente no alcance → texto diz que o atlas não cobre
 *   rosa pontilhada                  → texto avisa "poucos dados"
 *   corrente sem rótulo              → só a direção
 *   nevoeiro / vento forte           → só quando há nó por perto e o valor
 *                                       não é zero (zero não merece frase)
 */
export function atlasSummary(lat: number, lon: number, mes: number): AtlasSummary {
  const m = atlasMonth(mes);
  const r = nearestRose(lat, lon, mes);
  const c = nearestCurrent(lat, lon, mes);
  const fog = nearestNode("nevoeiro", lat, lon, mes);
  const gale = nearestNode("ventoForte", lat, lon, mes);
  const partes: string[] = [];
  const ranked = r ? rankedOctants(r.item) : null;
  if (ranked && ranked.length) {
    const [a, b] = ranked;
    const bf = (x: { bf: number | null }) => (x.bf != null ? `, força ${x.bf}` : "");
    let s = `Climatologia de ${m.nome} (rosa a ${Math.round(r!.nm)} milhas): vento de ${OCT_PT[a.oct]} ${Math.round(a.pct)} %${bf(a)}`;
    if (b) s += `, depois ${OCT_PT[b.oct]} ${Math.round(b.pct)} %${bf(b)}`;
    if (r!.item.calma != null) s += `, calmaria ${r!.item.calma} %`;
    s += r!.item.poucosDados ? ". Rosa com poucos dados." : ".";
    partes.push(s);
  }
  if (c) {
    const kn = c.item.kn != null ? ` a ${c.item.kn.toFixed(1)} nó${c.item.kn >= 1.05 ? "s" : ""}` : "";
    partes.push(`Corrente para ${toward(c.item.dir)}${kn} (seta a ${Math.round(c.nm)} milhas).`);
  }
  if (fog && fog.item.pct > 0) partes.push(`Nevoeiro ${fog.item.pct} % das observações.`);
  if (gale && gale.item.pct > 0) partes.push(`Vento forte ${gale.item.pct} %.`);
  const texto = partes.length ? partes.join(" ") : `O atlas da DHN não cobre esta posição em ${m.nome}.`;
  return {
    mes: m.nome,
    texto,
    rosa: ranked,
    rosaNm: r ? Math.round(r.nm) : null,
    calma: r?.item.calma ?? null,
    poucosDados: r?.item.poucosDados ?? false,
    corrente: c ? { dir: c.item.dir, kn: c.item.kn, nm: Math.round(c.nm) } : null,
    nevoeiroPct: fog?.item.pct ?? null,
    ventoFortePct: gale?.item.pct ?? null,
  };
}
