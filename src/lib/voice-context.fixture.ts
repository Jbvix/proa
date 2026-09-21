/**
 * Proa · TugLife Systems — Contexto da Lara de mentira, para testes
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.12.0  (módulo novo nesta versão)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * Não é teste (o glob de `npm test` é `*.test.ts`) e não vai pro bundle
 * (ninguém em `src/` fora dos testes importa daqui). Fica em arquivo próprio
 * porque IMPORTAR UM ARQUIVO DE TESTE RE-EXECUTA OS TESTES DELE — foi o que
 * aconteceu na primeira versão da 1.12.0, e os testes do diário rodaram duas
 * vezes, uma dentro do processo do relatório horário.
 * ---------------------------------------------------------------------------
 */
import type { VoiceContext } from "./voice-context.ts";

/** Rebocador em singradura Fortaleza–Pecém, mar medido e previsto. */
export function ctx(over: Partial<VoiceContext> = {}): VoiceContext {
  return {
    aviso: "",
    agora: "sábado 20 set 14:00",
    tripulacao: ["Jossian"],
    viagem: { nome: "Fortaleza–Pecém", origem: "Fortaleza", destino: "Pecém", totalNm: 40, feitoNm: 10.04, faltaNm: 29.96, progressoPct: 25 },
    posicao: { lat: -3.71234, lon: -38.54321, latLon: "", costa: "", costaNome: "", costaNm: 12, portoNm: 8, rumoDeg: 310.4, rumo: "310° NO", sogKn: 7.24, sogValidacao: "gps", xteNm: 0.041, xteLado: "linha", variacaoMag: "20°24' W", variacaoDeg: -20.4 },
    waypoints: [
      { nome: "Mucuripe", nm: 2, faltaNm: 0.1, eta: null, hsPrev: null },
      { nome: "WP meio", nm: 18, faltaNm: 7.96, eta: "15:10", hsPrev: 1.1 },
    ],
    cidades: [],
    mar: { hsCasco: 0.83, ampM: 0.4, tzS: 5.2, ondasMin: 12, estado: "Fraco", confiavel: true, hsPrev: 1.12, tzPrev: 6, swellPrev: 0.6, balancoDeg: 4.2, beaufort: 4, hsVento: 1.28 },
    meteo: { tempo: "", ventoKn: 12.3, ventoDir: 80, ventoCard: "80° L", rajadaKn: 16, correnteKn: 0.62, correnteDir: 300, correnteCard: "" },
    mare: { fase: "enchente", m: 1.2, eta: "18:10", etaDia: "hoje 18:10", etaFalta: "", enchenteIdeal: "", sogAlvoKn: 7, conselho: "" },
    rpm: { atual: 920, faixa: "880-980", min: 880, max: 980, centro: 930, situacao: "na faixa", motivo: "", mar: "ok" },
    combustivel: { rpmSugerido: 920, aFavor: [], contra: [], conselho: "" },
    consulta: { papel: "", navegacao: "", colreg: "", estabilidade: "", norman: "", marpol: "", solas: "" },
    clima: {
      fonte: "Atlas de Cartas Piloto (DHN) — climatologia 1985–2013, não previsão",
      mes: "janeiro",
      area: "G",
      areaTrecho: "São Luís a Natal (Ceará, Piauí, Maranhão oriental)",
      texto: "Climatologia de janeiro (rosa a 72 milhas): vento de leste 54 %, força 3, depois sudeste 29 %, força 3. Corrente para oeste a 2.0 nós (seta a 75 milhas).",
      ventoDe: "leste",
      ventoPct: 54,
      beaufort: 3,
      correnteDir: 292,
      correnteKn: 2,
      nevoeiroPct: 0,
      ventoFortePct: 0,
    },
    captura: true,
    modo: "ao vivo",
    ...over,
  };
}

