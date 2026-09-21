import { foldPt } from "./wake-word.ts";
import type { VoiceContext } from "./voice-context.ts";
import { consultReply } from "./bridge-knowledge.ts";

function tag(ctx: VoiceContext) {
  const n = ctx.tripulacao[0];
  return n ? `${n}. ` : "";
}

function kn(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return null;
  return n.toFixed(n >= 10 ? 0 : 1);
}

function nm(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return null;
  return n.toFixed(n >= 10 ? 0 : 1);
}

function cityHit(t: string, ctx: VoiceContext) {
  let best: VoiceContext["cidades"][number] | null = null;
  for (const c of ctx.cidades) {
    const f = foldPt(c.nome);
    if (f.length < 3 || !t.includes(f)) continue;
    if (!best || c.nome.length > best.nome.length) best = c;
  }
  return best;
}

/** Instant bridge facts — skip Grok when the numbers are already on the radio. */
export function quickReply(raw: string, ctx: VoiceContext): string | null {
  const t = foldPt(raw);
  if (!t || t.length < 4) return null;
  if (/relatorio|situacao|resumo|tudo ai|me conta|historia|futebol|piada|como vai|tudo bem/.test(t)) {
    return null;
  }
  const consult = consultReply(raw, {
    name: ctx.tripulacao[0],
    xteNm: ctx.posicao.xteNm,
    xteLado: ctx.posicao.xteLado,
    hsM: ctx.mar.hsCasco,
    rollDeg: ctx.mar.balancoDeg,
    costaNm: ctx.posicao.costaNm,
  });
  if (consult) return consult;
  const hi = tag(ctx);
  const city = cityHit(t, ctx);
  if (city && /passa|passagem|eta|hora|quando|cheg|cidade|porto|praia/.test(t)) {
    if (city.passou) return `${hi}${city.nome} já ficou pra trás.`;
    const eta = city.eta ?? "sem hora ainda";
    return `${hi}${city.nome}, ${eta}. Faltam ${nm(city.faltaNm) ?? "—"} milhas.`;
  }

  if (/\beta\b|chegad|quando (a gente )?chega|que horas (chega|e a chegada)|falta quanto/.test(t)) {
    const eta = ctx.mare.etaDia ?? ctx.mare.eta;
    if (!eta) return `${hi}Ainda não tenho ETA. Precisa da derrota e SOG.`;
    const falta = ctx.mare.etaFalta ?? (nm(ctx.viagem.faltaNm) ? `${nm(ctx.viagem.faltaNm)} milhas` : null);
    return falta ? `${hi}ETA ${eta}. Faltam ${falta}.` : `${hi}ETA ${eta}.`;
  }

  if (/\bhs\b|altura (d[aeo]s? )?ondas?|ondas? (por minuto|ta|como)|como (ta )?o mar|estado do mar/.test(t)) {
    const hs = ctx.mar.hsCasco.toFixed(1);
    const extra = ctx.mar.hsPrev != null ? ` Previsão ${ctx.mar.hsPrev.toFixed(1)}.` : "";
    return `${hi}Hs ${hs} m, ${ctx.mar.estado}. ${ctx.mar.ondasMin.toFixed(0)} por minuto.${extra}`;
  }

  if (/variacao|declinacao|agulha|rumo magnetico|magnetic/.test(t)) {
    // Variação magnética (WMM2025). Rumo magnético = verdadeiro − D: com D
    // oeste (negativa), a agulha mostra MAIS que o GPS. 310° V com 20° W dá
    // 330° M — a conta que ninguém faz até o rumo "não bater".
    const v = ctx.posicao.variacaoMag;
    if (!v || ctx.posicao.variacaoDeg == null) return `${hi}Sem posição, sem variação.`;
    const rumo = ctx.posicao.rumoDeg;
    if (rumo == null) return `${hi}Variação ${v} aqui.`;
    const mag = Math.round((((rumo - ctx.posicao.variacaoDeg) % 360) + 360) % 360);
    return `${hi}Variação ${v}. Rumo verdadeiro ${String(rumo).padStart(3, "0")} dá ${String(mag).padStart(3, "0")} na agulha.`;
  }

  if (/vento|rajada/.test(t)) {
    const v = kn(ctx.meteo.ventoKn);
    if (!v) return `${hi}Vento ainda não chegou.`;
    const dir = ctx.meteo.ventoCard ? ` ${ctx.meteo.ventoCard}` : "";
    const g = kn(ctx.meteo.rajadaKn);
    return g ? `${hi}Vento ${v} nós${dir}, rajada ${g}.` : `${hi}Vento ${v} nós${dir}.`;
  }

  if (/corrente/.test(t)) {
    const v = kn(ctx.meteo.correnteKn);
    if (!v) return `${hi}Corrente ainda não chegou.`;
    const dir = ctx.meteo.correnteCard ? ` ${ctx.meteo.correnteCard}` : "";
    return `${hi}Corrente ${v} nós${dir}.`;
  }

  if (/mare|enchente|preamar|vazante/.test(t)) {
    const fase = ctx.mare.fase ?? "sem fase";
    const eta = ctx.mare.enchenteIdeal ? ` Enchente boa ${ctx.mare.enchenteIdeal}.` : "";
    const tip = ctx.mare.conselho ? ` ${ctx.mare.conselho}` : "";
    return `${hi}Maré ${fase}.${eta}${tip}`.trim();
  }

  if (/waypoint|derrota|proximo (wp|ponto|marco)|proximo waypoint/.test(t) && ctx.waypoints.length) {
    const next = ctx.waypoints.find((w) => (w.faltaNm ?? 0) > 0.2) ?? ctx.waypoints[ctx.waypoints.length - 1];
    if (next) {
      const falta = nm(next.faltaNm);
      const eta = next.eta ? `, ${next.eta}` : "";
      return falta
        ? `${hi}Próximo: ${next.nome}. Faltam ${falta} milhas${eta}.`
        : `${hi}${next.nome}${eta}.`;
    }
  }

  if (/\bsog\b|velocidade|quantos nos|como (ta )?a velocidade/.test(t)) {
    const v = kn(ctx.posicao.sogKn);
    if (!v) return `${hi}SOG ainda não firmou.`;
    return `${hi}${v} nós.`;
  }

  if (/\brumo\b|proa|heading/.test(t)) {
    const r = ctx.posicao.rumo;
    if (!r) return `${hi}Rumo ainda não firmou.`;
    return `${hi}Rumo ${r}.`;
  }

  if (/\bxte\b|fora da (linha|derrota)|afast/.test(t)) {
    const x = ctx.posicao.xteNm;
    if (x == null) return `${hi}Sem XTE — falta a derrota.`;
    const lado = ctx.posicao.xteLado ?? "";
    return `${hi}XTE ${x.toFixed(2)} milhas ${lado}.`.trim();
  }

  if (/costa|longe da terra|distancia da costa/.test(t)) {
    const d = nm(ctx.posicao.costaNm);
    if (!d) return `${hi}Costa ainda não calculou.`;
    const nome = ctx.posicao.costaNome ? ` ${ctx.posicao.costaNome}` : "";
    return `${hi}${d} milhas da costa${nome}.`;
  }

  if (/posicao|onde (a gente |estamos|tamo)|lat|long/.test(t)) {
    if (!ctx.posicao.latLon) return `${hi}GPS ainda não pegou.`;
    const sog = kn(ctx.posicao.sogKn);
    return sog
      ? `${hi}${ctx.posicao.latLon}. ${sog} nós.`
      : `${hi}${ctx.posicao.latLon}.`;
  }

  if (/\brpm\b|rotacao|máquina|maquina/.test(t)) {
    return `${hi}${ctx.rpm.atual} RPM, faixa ${ctx.rpm.min} a ${ctx.rpm.max}. ${ctx.rpm.situacao}.`;
  }

  if (/combustivel|diesel|consumo/.test(t)) {
    return `${hi}${ctx.combustivel.conselho}`;
  }

  return null;
}
