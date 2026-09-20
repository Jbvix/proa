/**
 * Proa · TugLife Systems — Diário de travessia
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.12.0  (módulo novo nesta versão)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * POR QUE ISTO EXISTE (P12, item 12.3)
 * O relatório da hora cheia (12.1/12.2) é falado e some. Aqui ele fica
 * escrito — uma linha por hora, no aparelho, exportável em CSV. É o diário de
 * bordo que a Lara escreve sozinha.
 *
 * E É O DADO QUE FALTAVA PARA O P8b. A resistência adicionada em ondas
 * (`rpm.ts`, STAWAVE-1) tem a FORMA certa e a ESCALA chutada:
 * `AW_RPM_PER_KN = 5.6` e `STEEPNESS_RPM = 5250` foram postos por ordem de
 * grandeza, sem uma travessia instrumentada que os calibrasse. Cada linha
 * deste diário traz exatamente os pares que a calibração precisa — Hs medido
 * no casco × Hs previsto, RPM real × SOG real, vento e corrente com direção,
 * rumo — hora a hora. Depois de uma dezena de viagens, a curva de resistência
 * deixa de ser catálogo e vira a curva DAQUELE casco, medida por ele mesmo.
 *
 * O QUE NÃO É
 * Não é o `hourly[]` do store: aquele é a série de ondas das últimas 48 h
 * para o gráfico, e NÃO É PERSISTIDO (a 1.12.0 constatou que `hourly` está
 * fora do `partialize` — recarregar o app zera a série). O diário é
 * persistido, tem até 14 dias, e leva a viagem inteira, não só o mar.
 *
 * TUDO AQUI É PURO: entra o contexto da Lara (que já reúne engine, meteo,
 * derrota, RPM e maré), sai a linha. Quem grava é o store; quem exporta é a
 * tela. Testa-se com um contexto de mentira, sem sensores.
 * ---------------------------------------------------------------------------
 */
import type { VoiceContext } from "./voice-context.ts";

/** Linhas guardadas, no máximo: 14 dias × 24 h. Acima disso, sai a mais antiga. */
export const LOG_MAX = 336;

/**
 * SOG a partir do qual o rebocador conta como "em singradura", em nós.
 * Mesmo critério do vigia de XTE (`voice-watch.ts`): abaixo disso é manobra,
 * fundeio ou cais — o diário ainda grava, mas a Lara não fala.
 */
export const UNDERWAY_SOG_KN = 0.6;

/** Uma hora de travessia. Números nulos = o app não sabia naquela hora. */
export type LogEntry = {
  /** Hora cheia, ms de época (`hourKey`). Chave única da linha. */
  t: number;
  /** Versão do app que escreveu a linha — dado de outra versão pode ter outra escala. */
  versao: string;
  /** Em singradura (SOG ≥ 0,6 nó) naquela hora. */
  singradura: boolean;
  lat: number | null;
  lon: number | null;
  sogKn: number | null;
  rumoDeg: number | null;
  xteNm: number | null;
  /** Hs medido no casco (dupla integração do heave), em m. */
  hsObsM: number | null;
  /** Hs previsto pela Open-Meteo para a posição, em m. */
  hsPrevM: number | null;
  tzObsS: number | null;
  tzPrevS: number | null;
  estadoMar: string | null;
  balancoDeg: number | null;
  ventoKn: number | null;
  ventoDirDeg: number | null;
  correnteKn: number | null;
  correnteDirDeg: number | null;
  rpm: number | null;
  rpmFaixaMin: number | null;
  rpmFaixaMax: number | null;
  feitoNm: number | null;
  faltaNm: number | null;
  eta: string | null;
  proximoWp: string | null;
  proximoWpNm: number | null;
  mare: string | null;
  /** Relógio de parede formatado, só para leitura humana no CSV. */
  agora: string;
};

/** Número finito ou `null` — o diário não grava NaN nem Infinity. */
function num(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

/** Arredonda sem inventar precisão: 3 casas em grau/milha, 2 no resto. */
function r(v: number | null, digits: number): number | null {
  return v == null ? null : Number(v.toFixed(digits));
}

/**
 * Monta a linha da hora `t` a partir do contexto da Lara.
 *
 * Comportamento conforme as variáveis:
 *   `ctx.captura === false`  → ainda grava (posição pode vir da derrota),
 *                               mas Hs do casco vai `null`: sem sensor não
 *                               há medida, e gravar zero seria mentir que o
 *                               mar estava chão.
 *   `ctx.mar.confiavel === false` → Hs do casco vai `null` pelo mesmo motivo:
 *                               a calibração do P8b só quer medida que preste.
 *   próximo waypoint          → o primeiro com mais de 0,4 mn à frente, o
 *                               mesmo critério do relatório de waypoint.
 */
export function makeLogEntry(ctx: VoiceContext, t: number, versao: string): LogEntry {
  const sog = num(ctx.posicao.sogKn);
  const medida = ctx.captura && ctx.mar.confiavel;
  const wp = ctx.waypoints.find((w) => (w.faltaNm ?? 0) > 0.4) ?? null;
  return {
    t,
    versao,
    singradura: sog != null && sog >= UNDERWAY_SOG_KN,
    lat: r(num(ctx.posicao.lat), 4),
    lon: r(num(ctx.posicao.lon), 4),
    sogKn: r(sog, 1),
    rumoDeg: r(num(ctx.posicao.rumoDeg), 0),
    xteNm: r(num(ctx.posicao.xteNm), 2),
    hsObsM: medida ? r(num(ctx.mar.hsCasco), 2) : null,
    hsPrevM: r(num(ctx.mar.hsPrev), 2),
    tzObsS: medida ? r(num(ctx.mar.tzS), 1) : null,
    tzPrevS: r(num(ctx.mar.tzPrev), 1),
    estadoMar: medida ? ctx.mar.estado || null : null,
    balancoDeg: medida ? r(num(ctx.mar.balancoDeg), 1) : null,
    ventoKn: r(num(ctx.meteo.ventoKn), 1),
    ventoDirDeg: r(num(ctx.meteo.ventoDir), 0),
    correnteKn: r(num(ctx.meteo.correnteKn), 2),
    correnteDirDeg: r(num(ctx.meteo.correnteDir), 0),
    rpm: r(num(ctx.rpm.atual), 0),
    rpmFaixaMin: r(num(ctx.rpm.min), 0),
    rpmFaixaMax: r(num(ctx.rpm.max), 0),
    feitoNm: r(num(ctx.viagem.feitoNm), 1),
    faltaNm: r(num(ctx.viagem.faltaNm), 1),
    eta: ctx.mare.etaDia ?? ctx.mare.eta ?? null,
    proximoWp: wp?.nome ?? null,
    proximoWpNm: wp ? r(num(wp.faltaNm), 1) : null,
    mare: ctx.mare.fase ?? null,
    agora: ctx.agora,
  };
}

/**
 * Acrescenta `entry` ao diário, uma linha por hora, mais recente por último.
 * Mesma hora gravada duas vezes → a segunda substitui a primeira (o app pode
 * reiniciar dentro da hora). Passou de `LOG_MAX` → cai a mais antiga.
 */
export function appendLogEntry(log: readonly LogEntry[], entry: LogEntry): LogEntry[] {
  const next = log.filter((e) => e.t !== entry.t);
  next.push(entry);
  next.sort((a, b) => a.t - b.t);
  return next.slice(-LOG_MAX);
}

/** Colunas do CSV, na ordem. A ordem é contrato: quem fizer a regressão lê por nome, mas gente lê por posição. */
export const CSV_COLUMNS: (keyof LogEntry)[] = [
  "t",
  "agora",
  "versao",
  "singradura",
  "lat",
  "lon",
  "sogKn",
  "rumoDeg",
  "xteNm",
  "hsObsM",
  "hsPrevM",
  "tzObsS",
  "tzPrevS",
  "estadoMar",
  "balancoDeg",
  "ventoKn",
  "ventoDirDeg",
  "correnteKn",
  "correnteDirDeg",
  "rpm",
  "rpmFaixaMin",
  "rpmFaixaMax",
  "feitoNm",
  "faltaNm",
  "eta",
  "proximoWp",
  "proximoWpNm",
  "mare",
];

/** Uma célula: `null` vira vazio; texto com vírgula, aspas ou quebra vai entre aspas. */
function cell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "1" : "0";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * O diário em CSV (RFC 4180, vírgula, ponto decimal, CRLF). Ponto decimal de
 * propósito: é o que R, Python e o Excel em inglês leem sem ajuste, e a
 * regressão do P8b vai ser feita num desses, não no bloco de notas.
 */
export function logToCsv(log: readonly LogEntry[]): string {
  const head = CSV_COLUMNS.join(",");
  const rows = log.map((e) => CSV_COLUMNS.map((c) => cell(e[c])).join(","));
  return [head, ...rows].join("\r\n") + "\r\n";
}

/** Nome do arquivo exportado: `proa-diario-AAAAMMDD-HHMM.csv`, hora local. */
export function csvFilename(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `proa-diario-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.csv`;
}
