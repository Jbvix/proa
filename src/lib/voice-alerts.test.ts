/**
 * Proa · TugLife Systems — Testes do vigia
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.12.0 · 2026-09-20 12:00 UTC (ano 2026)
 *
 * Esta lógica vivia dentro de um `setInterval` no meio de um componente de
 * 1.025 linhas, onde não havia como testá-la. Extraída, dá pra amarrar o
 * comportamento: quando a Lara abre a boca sozinha e, mais importante, quando
 * ela fica calada.
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALERTS_IDLE,
  WAYPOINT_COOLDOWN_MS,
  XTE_COOLDOWN_MS,
  hourOf,
  nextMarkAfter,
  tickAlerts,
  type AlertInput,
  type AlertState,
} from "./voice-alerts.ts";
import { XTE_ON_NM } from "./voice-watch.ts";

const MARCAS = [
  { nome: "Mucuripe", nm: 2 },
  { nome: "WP meio", nm: 8 },
  { nome: "Pecém", nm: 20 },
];

/** Rebocador em viagem, na linha, sem nada a relatar. */
function navegando(over: Partial<AlertInput> = {}): AlertInput {
  return {
    routeSource: "derrota.gpx",
    xteNm: 0.02,
    sogKn: 9.2,
    alongNm: 5,
    remainNm: 15,
    capturing: true,
    marks: MARCAS,
    nowMono: 1_000_000,
    nowWall: H14 + 5 * 60_000, // 14:05, meio da hora
    ...over,
  };
}

/** Uma hora cheia qualquer (14:00 UTC de um dia de 2026) e a seguinte. */
const H14 = Date.UTC(2026, 8, 20, 14, 0);
const H15 = H14 + 3_600_000;

/** Estado já armado na hora 14, como fica depois da primeira leitura. */
function armado(over: Partial<AlertState> = {}): AlertState {
  return { ...ALERTS_IDLE, lastHourKey: H14, ...over };
}

/* --------------------------------------------------------------------- */
/* Silêncio                                                               */
/* --------------------------------------------------------------------- */

test("em viagem normal a Lara não diz nada", () => {
  const r = tickAlerts(ALERTS_IDLE, navegando());
  assert.equal(r.action, null);
});

test("com a captura parada o vigia não inventa aviso", () => {
  // Sem sensores não há afastamento que se afirme.
  let s = ALERTS_IDLE;
  for (let i = 0; i < 10; i++) {
    const r = tickAlerts(s, navegando({ capturing: false, xteNm: 1.5, nowMono: 1e6 + i * 1100 }));
    s = r.state;
    assert.equal(r.action, null, `passo ${i}`);
  }
});

test("atracado não dispara nada", () => {
  // SOG abaixo de 0,6 nó é manobra ou cais, não derrota.
  const r = tickAlerts(ALERTS_IDLE, navegando({ sogKn: 0.2, xteNm: 2 }));
  assert.equal(r.action, null);
});

/* --------------------------------------------------------------------- */
/* XTE                                                                    */
/* --------------------------------------------------------------------- */

test("o afastamento só vira aviso depois de se confirmar", () => {
  // Uma leitura fora da linha pode ser salto de GPS. Três seguidas é derrota.
  const fora = navegando({ xteNm: XTE_ON_NM + 0.1 });
  let s = ALERTS_IDLE;

  const um = tickAlerts(s, fora); s = um.state;
  assert.equal(um.action, null, "uma leitura não basta");
  const dois = tickAlerts(s, { ...fora, nowMono: 1_001_100 }); s = dois.state;
  assert.equal(dois.action, null, "duas não bastam");
  const tres = tickAlerts(s, { ...fora, nowMono: 1_002_200 }); s = tres.state;
  assert.deepEqual(tres.action, { kind: "xte", alert: "xte" }, "a terceira confirma");
});

test("a trava de 45 s cala o segundo aviso de afastamento", () => {
  const fora = navegando({ xteNm: XTE_ON_NM + 0.5 });
  let s = ALERTS_IDLE;
  let t = 1_000_000;
  for (let i = 0; i < 3; i++) { const r = tickAlerts(s, { ...fora, nowMono: t }); s = r.state; t += 1100; }
  // Já alertou. Volta pra linha e sai de novo, ainda dentro da janela.
  for (let i = 0; i < 3; i++) { const r = tickAlerts(s, { ...navegando({ nowMono: t }) }); s = r.state; t += 1100; }
  let segundo = null;
  for (let i = 0; i < 4; i++) {
    const r = tickAlerts(s, { ...fora, nowMono: t }); s = r.state; t += 1100;
    if (r.action) segundo = r.action;
  }
  assert.equal(segundo, null, "fora da derrota o rebocador segue fora; repetir vira alarme de incêndio");
});

test("passada a trava, o afastamento volta a ser avisado", () => {
  const fora = navegando({ xteNm: XTE_ON_NM + 0.5 });
  let s = ALERTS_IDLE;
  let t = 1_000_000;
  for (let i = 0; i < 3; i++) { const r = tickAlerts(s, { ...fora, nowMono: t }); s = r.state; t += 1100; }
  // Volta pra linha (esfria o vigia) e sai de novo, já depois da trava.
  for (let i = 0; i < 4; i++) { const r = tickAlerts(s, navegando({ nowMono: t })); s = r.state; t += 1100; }
  t += XTE_COOLDOWN_MS;
  let voltou = null;
  for (let i = 0; i < 4; i++) {
    const r = tickAlerts(s, { ...fora, nowMono: t }); s = r.state; t += 1100;
    if (r.action) voltou = r.action;
  }
  assert.deepEqual(voltou, { kind: "xte", alert: "xte" });
});

/* --------------------------------------------------------------------- */
/* Waypoint                                                               */
/* --------------------------------------------------------------------- */

test("cruzar um waypoint rende um relatório, com o próximo apontado", () => {
  const s = tickAlerts(ALERTS_IDLE, navegando({ alongNm: 7.6 })).state;
  const r = tickAlerts(s, navegando({ alongNm: 8.2, nowMono: 1_001_100 }));
  assert.equal(r.action?.kind, "waypoint");
  if (r.action?.kind !== "waypoint") return;
  assert.equal(r.action.passed.nome, "WP meio");
  assert.equal(r.action.next?.nome, "Pecém");
});

test("o mesmo waypoint não é relatado duas vezes", () => {
  let s = tickAlerts(ALERTS_IDLE, navegando({ alongNm: 7.6 })).state;
  const primeiro = tickAlerts(s, navegando({ alongNm: 8.2, nowMono: 1_001_100 }));
  s = primeiro.state;
  assert.equal(primeiro.action?.kind, "waypoint");
  let t = 1_001_100 + WAYPOINT_COOLDOWN_MS + 5_000;
  for (let i = 0; i < 5; i++) {
    const r = tickAlerts(s, navegando({ alongNm: 8.5 + i * 0.1, nowMono: t }));
    s = r.state; t += 1100;
    assert.equal(r.action, null, `repetiu no passo ${i}`);
  }
});

test("trocar o GPX zera as passagens — derrota nova, viagem nova", () => {
  let s = tickAlerts(ALERTS_IDLE, navegando({ alongNm: 7.6 })).state;
  s = tickAlerts(s, navegando({ alongNm: 8.2, nowMono: 1_001_100 })).state;
  // Importa outra derrota e passa pela mesma milha.
  const outra = navegando({ routeSource: "outra.gpx", alongNm: 7.6, nowMono: 1_100_000 });
  s = tickAlerts(s, outra).state;
  const r = tickAlerts(s, { ...outra, alongNm: 8.2, nowMono: 1_101_100 });
  assert.equal(r.action?.kind, "waypoint", "o GPX novo tem de poder relatar a mesma marca");
});

/* --------------------------------------------------------------------- */
/* Precedência                                                            */
/* --------------------------------------------------------------------- */

test("estar fora da derrota importa mais que anunciar por onde se passou", () => {
  // Fora da linha há 2 leituras e cruzando um waypoint: o XTE ganha o passo.
  const fora = navegando({ xteNm: XTE_ON_NM + 0.4, alongNm: 7.6 });
  let s = ALERTS_IDLE;
  s = tickAlerts(s, fora).state;
  s = tickAlerts(s, { ...fora, nowMono: 1_001_100 }).state;
  const r = tickAlerts(s, { ...fora, alongNm: 8.2, nowMono: 1_002_200 });
  assert.equal(r.action?.kind, "xte");
});

test("o waypoint engolido pelo XTE é atrasado, não perdido", () => {
  // Comportamento herdado do laço original e preservado de propósito: o tick de
  // waypoint não roda no passo em que o XTE alerta, então a marca é detectada
  // no passo seguinte, porque a milha percorrida segue adiante dela.
  const fora = navegando({ xteNm: XTE_ON_NM + 0.4, alongNm: 7.6 });
  let s = ALERTS_IDLE;
  s = tickAlerts(s, fora).state;
  s = tickAlerts(s, { ...fora, nowMono: 1_001_100 }).state;
  const comXte = tickAlerts(s, { ...fora, alongNm: 8.2, nowMono: 1_002_200 });
  s = comXte.state;
  assert.equal(comXte.action?.kind, "xte");
  // Passo seguinte, já de volta à linha: a marca aparece.
  const depois = tickAlerts(s, navegando({ alongNm: 8.4, nowMono: 1_003_300 }));
  assert.equal(depois.action?.kind, "waypoint");
  if (depois.action?.kind !== "waypoint") return;
  assert.equal(depois.action.passed.nome, "WP meio");
});

/* --------------------------------------------------------------------- */
/* Próxima marca                                                          */
/* --------------------------------------------------------------------- */

test("a próxima marca ignora quem está colado na que passou", () => {
  // Em derrota de manobra os waypoints vêm quase em cima uns dos outros;
  // anunciar "próximo: X, 0,1 milha" não informa nada.
  const coladas = [
    { nome: "A", nm: 8 },
    { nome: "B", nm: 8.2 },
    { nome: "C", nm: 12 },
  ];
  assert.equal(nextMarkAfter(coladas, coladas[0]!)?.nome, "C");
  assert.equal(nextMarkAfter(coladas, coladas[2]!), null, "depois da última não há próxima");
  assert.equal(nextMarkAfter([], { nome: "X", nm: 1 }), null);
});

/* --------------------------------------------------------------------- */
/* Hora cheia (1.12.0)                                                    */
/* --------------------------------------------------------------------- */

test("a primeira leitura arma na hora atual e não fala", () => {
  // Abrir o app às 14h05 não rende relatório às 14h05: hora quebrada é fala
  // não pedida.
  const r = tickAlerts(ALERTS_IDLE, navegando());
  assert.equal(r.action, null);
  assert.equal(r.state.lastHourKey, H14);
});

test("dentro da mesma hora, nada", () => {
  const r = tickAlerts(armado(), navegando({ nowWall: H14 + 59 * 60_000 }));
  assert.equal(r.action, null);
  assert.equal(r.state.lastHourKey, H14);
});

test("virou a hora em singradura: relatório, pra falar", () => {
  const r = tickAlerts(armado(), navegando({ nowWall: H15 + 2_000 }));
  assert.deepEqual(r.action, { kind: "hourly", hourKey: H15, underway: true });
  assert.equal(r.state.lastHourKey, H15);
});

test("virou a hora no cais: relatório pra gravar, não pra falar", () => {
  // O diário quer a linha (Hs medido × previsto vale mesmo fundeado); a
  // tripulação não quer a Lara falando sozinha num cais às 3 da manhã.
  const r = tickAlerts(armado(), navegando({ nowWall: H15 + 2_000, sogKn: 0.2 }));
  assert.deepEqual(r.action, { kind: "hourly", hourKey: H15, underway: false });
});

test("a mesma hora não é relatada duas vezes", () => {
  const um = tickAlerts(armado(), navegando({ nowWall: H15 + 2_000 }));
  const dois = tickAlerts(um.state, navegando({ nowWall: H15 + 3_100 }));
  assert.equal(dois.action, null);
});

test("sem captura a hora passa em branco — e a chave não avança", () => {
  // Se a captura voltar ainda nesta hora, o relatório sai.
  const semSensor = tickAlerts(armado(), navegando({ nowWall: H15 + 2_000, capturing: false }));
  assert.equal(semSensor.action, null);
  assert.equal(semSensor.state.lastHourKey, H14);
  const voltou = tickAlerts(semSensor.state, navegando({ nowWall: H15 + 20 * 60_000 }));
  assert.equal(voltou.action?.kind, "hourly");
});

test("o XTE ganha da hora; o relatório sai no passo seguinte", () => {
  // Duas leituras fora ainda na hora 14; a terceira, que confirma o
  // afastamento, cai exatamente no passo em que a hora vira.
  const antes = navegando({ xteNm: XTE_ON_NM + 0.1, nowWall: H14 + 59 * 60_000 });
  const fora = { ...antes, nowWall: H15 + 1_000 };
  let s = armado();
  s = tickAlerts(s, antes).state;
  s = tickAlerts(s, antes).state;
  const tres = tickAlerts(s, fora);
  assert.equal(tres.action?.kind, "xte");
  assert.equal(tres.state.lastHourKey, H14, "a hora ainda não foi relatada");
  const depois = tickAlerts(tres.state, { ...fora, nowMono: fora.nowMono + 1_100 });
  assert.equal(depois.action?.kind, "hourly");
});

test("waypoint relatado há pouco: a hora espera 18 s pra não emendar dois relatórios", () => {
  const recente = armado({ lastWaypointAt: 1_000_000 - 5_000 });
  const cedo = tickAlerts(recente, navegando({ nowWall: H15 + 1_000 }));
  assert.equal(cedo.action, null);
  const tarde = tickAlerts(recente, navegando({ nowWall: H15 + 1_000, nowMono: 1_000_000 + WAYPOINT_COOLDOWN_MS }));
  assert.equal(tarde.action?.kind, "hourly");
});

test("hourOf é a hora cheia, com o mesmo resultado de utils.hourKey", () => {
  assert.equal(hourOf(H14 + 59 * 60_000 + 59_000), H14);
  assert.equal(hourOf(H15), H15);
});
