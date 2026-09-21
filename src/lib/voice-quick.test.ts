import assert from "node:assert/strict";
import { test } from "node:test";
import type { VoiceContext } from "./voice-context.ts";
import { quickReply } from "./voice-quick.ts";

function ctx(over: Partial<VoiceContext> = {}): VoiceContext {
  return {
    aviso: "",
    agora: "sáb. 19 set 07:10",
    tripulacao: ["Jossian"],
    viagem: {
      nome: "Fortaleza–Pecém",
      origem: "Fortaleza",
      destino: "Pecém",
      totalNm: 40,
      feitoNm: 10,
      faltaNm: 30,
      progressoPct: 25,
    },
    posicao: {
      lat: -3.7,
      lon: -38.5,
      latLon: "3.7000° S  38.5000° W",
      costa: "12 milhas",
      costaNome: "Ceará",
      costaNm: 12,
      portoNm: 8,
      rumoDeg: 310,
      rumo: "310° NO",
      sogKn: 7.2,
      sogValidacao: "gps",
      xteNm: 0.04,
      xteLado: "linha",
      variacaoMag: "20°24' W",
      variacaoDeg: -20.4,
    },
    waypoints: [],
    cidades: [{ nome: "Pecém", faltaNm: 18.4, eta: "hoje 11:20", passou: false }],
    mar: {
      hsCasco: 0.8,
      ampM: 0.4,
      tzS: 5,
      ondasMin: 12,
      estado: "marulhado",
      confiavel: true,
      hsPrev: 1.1,
      tzPrev: 6,
      swellPrev: 0.6,
      balancoDeg: 4,
      beaufort: 4,
      hsVento: 1.28,
    },
    meteo: {
      tempo: "parcialmente nublado",
      ventoKn: 12,
      ventoDir: 80,
      ventoCard: "80° L",
      rajadaKn: 16,
      correnteKn: 0.6,
      correnteDir: 300,
      correnteCard: "300° NO",
    },
    mare: {
      fase: "enchente",
      m: 1.2,
      eta: "11:40",
      etaDia: "hoje 11:40",
      etaFalta: "4 h 30 min",
      enchenteIdeal: "10:50",
      sogAlvoKn: 7,
      conselho: "Segura 7 nós.",
    },
    rpm: {
      atual: 920,
      faixa: "880-980",
      min: 880,
      max: 980,
      centro: 930,
      situacao: "na faixa",
      motivo: "",
      mar: "ok",
    },
    combustivel: {
      rpmSugerido: 920,
      aFavor: [],
      contra: [],
      conselho: "Mantém 920.",
    },
    consulta: {
      papel: "Colega presencial no passadiço.",
      navegacao: "",
      colreg: "",
      estabilidade: "",
      norman: "",
      marpol: "",
      solas: "",
    },
    captura: true,
    modo: "ao vivo",
    ...over,
  };
}

test("eta and city hit without grok", () => {
  const a = quickReply("qual o eta", ctx());
  assert.match(a ?? "", /ETA hoje 11:40/);
  const b = quickReply("quando passa em pecem", ctx());
  assert.match(b ?? "", /Pecém/);
  assert.match(b ?? "", /11:20/);
});

test("sea wind sog use the live numbers", () => {
  assert.match(quickReply("como ta o hs", ctx()) ?? "", /0\.8/);
  assert.match(quickReply("e o vento", ctx()) ?? "", /12 nós/);
  assert.match(quickReply("qual o sog", ctx()) ?? "", /7\.2 nós/);
});

test("consulting hits without grok and skips small talk", () => {
  assert.match(quickReply("o que é superfície livre", ctx()) ?? "", /Superfície livre/);
  assert.match(quickReply("o que a COLREG pede", ctx()) ?? "", /vigia/);
  assert.equal(quickReply("e o futebol ontem", ctx()), null);
  assert.equal(quickReply("me dá o relatório", ctx()), null);
});

test("variação magnética sai da posição, com o rumo na agulha", () => {
  // 310° verdadeiro com 20,4° W: agulha marca 330°.
  const r = quickReply("qual a variação aqui", ctx()) ?? "";
  assert.match(r, /Variação 20°24' W/);
  assert.match(r, /310 dá 330 na agulha/);
  assert.match(quickReply("desvio da agulha", ctx()) ?? "", /Variação/);
  const semPos = ctx();
  semPos.posicao = { ...semPos.posicao, variacaoMag: null, variacaoDeg: null };
  assert.match(quickReply("declinação", semPos) ?? "", /Sem posição/);
});
