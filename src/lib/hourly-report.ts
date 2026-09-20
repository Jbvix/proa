/**
 * Proa · TugLife Systems — Relatório da hora cheia
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.12.0  (módulo novo nesta versão)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * POR QUE ISTO EXISTE (P12, item 12.2)
 * Na hora cheia — o ritmo do passadiço — a Lara diz como vai a viagem, sem
 * ninguém perguntar. O texto é montado A PARTIR DA LINHA DO DIÁRIO
 * (`passage-log.ts`), não do contexto: o que ela fala é exatamente o que ficou
 * escrito. Se um dia alguém ler o CSV e comparar com o que ouviu, bate.
 *
 * O texto segue a régua do 11.6: curto, de passadiço, sem enfeite. Hs medido
 * e previsto vêm juntos de propósito — é a comparação que a tripulação faz de
 * cabeça, e é o par que calibra o modelo.
 * ---------------------------------------------------------------------------
 */
import type { LogEntry } from "./passage-log.ts";

/** Uma casa até 10, inteiro acima — mesma régua de `waypointReport`. */
function n1(v: number | null): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v.toFixed(v >= 10 ? 0 : 1);
}

/** Hora local `HH:MM` a partir da hora cheia `t`. */
function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * O relatório falado da hora `entry.t`.
 *
 * Comportamento conforme as variáveis:
 *   nome de tripulante → abre chamando pelo nome
 *   `hsObsM` e `hsPrevM` → "Hs 1,2 no casco, previsto 1,5"; só um dos dois
 *                         → só o que há; nenhum → sem frase de mar
 *   `rpm` fora de [min, max] → "RPM 920, faixa 880 a 980" (a diferença é o
 *                         aviso); dentro → "RPM 920, na faixa"
 *   `faltaNm` nulo (sem derrota) → sem frase de viagem, e sem ETA
 *   `proximoWp` nulo → sem próximo
 *   `xteNm` ≥ 0,08 → afastamento dito; abaixo é ruído de GPS, calada
 */
export function hourlyReport(entry: LogEntry, name?: string | null): string {
  const hi = name ? `${name}. ` : "";
  const head = `Relatório das ${hhmm(entry.t)}.`;

  const sog = n1(entry.sogKn);
  const rumo = entry.rumoDeg != null ? `rumo ${entry.rumoDeg.toFixed(0)}` : null;
  const nav = [sog ? `${sog} nós` : null, rumo].filter(Boolean).join(", ");

  const hsObs = n1(entry.hsObsM);
  const hsPrev = n1(entry.hsPrevM);
  const mar =
    hsObs && hsPrev
      ? `Hs ${hsObs} no casco, previsto ${hsPrev}${entry.estadoMar ? `, ${entry.estadoMar}` : ""}.`
      : hsObs
        ? `Hs ${hsObs} no casco${entry.estadoMar ? `, ${entry.estadoMar}` : ""}.`
        : hsPrev
          ? `Hs previsto ${hsPrev}.`
          : "";

  const vento = n1(entry.ventoKn);
  const wind = vento
    ? `Vento ${vento} nós${entry.ventoDirDeg != null ? ` de ${entry.ventoDirDeg.toFixed(0)}` : ""}.`
    : "";

  let rpm = "";
  if (entry.rpm != null) {
    const dentro =
      entry.rpmFaixaMin != null &&
      entry.rpmFaixaMax != null &&
      entry.rpm >= entry.rpmFaixaMin &&
      entry.rpm <= entry.rpmFaixaMax;
    rpm = dentro
      ? `RPM ${entry.rpm.toFixed(0)}, na faixa.`
      : entry.rpmFaixaMin != null && entry.rpmFaixaMax != null
        ? `RPM ${entry.rpm.toFixed(0)}, faixa ${entry.rpmFaixaMin.toFixed(0)} a ${entry.rpmFaixaMax.toFixed(0)}.`
        : `RPM ${entry.rpm.toFixed(0)}.`;
  }

  const falta = n1(entry.faltaNm);
  const trip = falta ? `Faltam ${falta} milhas${entry.eta ? `, ETA ${entry.eta}` : ""}.` : "";
  const nextNm = n1(entry.proximoWpNm);
  const next = entry.proximoWp
    ? `Próximo: ${entry.proximoWp}${nextNm ? `, ${nextNm} milhas` : ""}.`
    : "";
  const mare = entry.mare ? `Maré ${entry.mare}.` : "";
  const xte = entry.xteNm != null && entry.xteNm >= 0.08 ? `XTE ${entry.xteNm.toFixed(2)} milhas.` : "";

  return [hi + head, nav ? `${nav}.` : "", mar, wind, rpm, trip, next, mare, xte]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
