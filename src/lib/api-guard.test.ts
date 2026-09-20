/**
 * Proa · TugLife Systems — Testes da guarda dos endpoints
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.0.0
 * @data   2026-09-20 02:14 UTC  (ano 2026)
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  METEO_RULES,
  VOICE_RULES,
  clientKey,
  createRateState,
  isAllowedOrigin,
  parseAllowedOrigins,
  rateLimit,
} from "./api-guard.ts";

function cab(pares: Record<string, string>) {
  return new Headers(pares);
}

/* --------------------------------------------------------------------- */
/* Identificação do cliente                                               */
/* --------------------------------------------------------------------- */

test("o IP da Netlify tem precedência sobre cabeçalhos forjáveis", () => {
  // `x-forwarded-for` chega do cliente e pode ser inventado; o
  // `x-nf-client-connection-ip` é escrito pela plataforma.
  const h = cab({
    "x-nf-client-connection-ip": "200.1.2.3",
    "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    "x-real-ip": "9.9.9.9",
  });
  assert.equal(clientKey(h), "200.1.2.3");
});

test("sem o IP da plataforma, vale a primeira entrada do encaminhamento", () => {
  // Só a primeira: as seguintes são o que a cadeia de proxies acrescentou.
  assert.equal(clientKey(cab({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" })), "1.1.1.1");
  assert.equal(clientKey(cab({ "x-forwarded-for": "  3.3.3.3  " })), "3.3.3.3");
  assert.equal(clientKey(cab({ "x-real-ip": "4.4.4.4" })), "4.4.4.4");
});

test("sem nenhuma pista, todo mundo cai na mesma chave", () => {
  // Conservador de propósito: limitar demais é melhor que não limitar nada.
  assert.equal(clientKey(cab({})), "desconhecido");
  assert.equal(clientKey(cab({ "x-forwarded-for": "" })), "desconhecido");
});

/* --------------------------------------------------------------------- */
/* Origem                                                                 */
/* --------------------------------------------------------------------- */

test("sem cabeçalho Origin o pedido passa", () => {
  // Navegador não manda Origin em GET de mesma origem. Barrar quebraria o uso
  // legítimo sem impedir abuso — quem ataca simplesmente omite o cabeçalho.
  assert.equal(isAllowedOrigin(null, "tuglife-proa.netlify.app"), true);
  assert.equal(isAllowedOrigin("", "tuglife-proa.netlify.app"), true);
});

test("mesma origem passa, em produção e em deploy preview", () => {
  assert.equal(
    isAllowedOrigin("https://tuglife-proa.netlify.app", "tuglife-proa.netlify.app"),
    true,
  );
  // Deploy preview: o host do pedido é o próprio host do preview, então a
  // regra de mesma origem já cobre, sem precisar de caso especial.
  assert.equal(
    isAllowedOrigin(
      "https://deploy-preview-7--tuglife-proa.netlify.app",
      "deploy-preview-7--tuglife-proa.netlify.app",
    ),
    true,
  );
  // Sandbox de preview idem.
  assert.equal(
    isAllowedOrigin("https://abc.grok-sandbox.com", "abc.grok-sandbox.com"),
    true,
  );
});

test("o desenvolvimento local passa", () => {
  assert.equal(isAllowedOrigin("http://localhost:8080", "127.0.0.1:8080"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:5173", "outra.coisa"), true);
});

test("origem de terceiro é barrada", () => {
  assert.equal(
    isAllowedOrigin("https://sitedoladrao.com", "tuglife-proa.netlify.app"),
    false,
  );
  // Sufixo parecido não engana: o host tem de bater inteiro.
  assert.equal(
    isAllowedOrigin(
      "https://tuglife-proa.netlify.app.ladrao.com",
      "tuglife-proa.netlify.app",
    ),
    false,
  );
});

test("esquemas que não são http nem https são barrados", () => {
  const host = "tuglife-proa.netlify.app";
  assert.equal(isAllowedOrigin("file:///etc/passwd", host), false);
  assert.equal(isAllowedOrigin("javascript:alert(1)", host), false);
  assert.equal(isAllowedOrigin("não é uma URL", host), false);
});

test("a allowlist extra do ambiente é respeitada", () => {
  const extras = parseAllowedOrigins("parceiro.com, outro.org ,,");
  assert.deepEqual(extras, ["parceiro.com", "outro.org"]);
  assert.equal(isAllowedOrigin("https://parceiro.com", "proa.app", extras), true);
  assert.equal(isAllowedOrigin("https://terceiro.com", "proa.app", extras), false);
  assert.deepEqual(parseAllowedOrigins(undefined), []);
  assert.deepEqual(parseAllowedOrigins(""), []);
});

/* --------------------------------------------------------------------- */
/* Limite de taxa                                                         */
/* --------------------------------------------------------------------- */

test("deixa passar até o teto e barra a seguinte", () => {
  const s = createRateState();
  const regra = [{ limit: 3, windowMs: 60_000 }];
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(rateLimit(s, "ip", regra, t0 + i).ok, true, `passagem ${i + 1}`);
  }
  const barrada = rateLimit(s, "ip", regra, t0 + 3);
  assert.equal(barrada.ok, false);
  assert.ok(!barrada.ok && barrada.retryAfterS > 0);
});

test("a janela desliza: passado o tempo, volta a passar", () => {
  const s = createRateState();
  const regra = [{ limit: 2, windowMs: 60_000 }];
  const t0 = 1_000_000;
  rateLimit(s, "ip", regra, t0);
  rateLimit(s, "ip", regra, t0 + 1000);
  assert.equal(rateLimit(s, "ip", regra, t0 + 2000).ok, false);
  // Passada a janela inteira, a conta zera.
  assert.equal(rateLimit(s, "ip", regra, t0 + 61_000).ok, true);
});

test("pedido barrado NÃO é contado — ninguém fica preso para sempre", () => {
  // Se cada tentativa bloqueada empurrasse a janela, um script de terceiro
  // trancaria o aparelho da tripulação indefinidamente.
  const s = createRateState();
  const regra = [{ limit: 1, windowMs: 10_000 }];
  const t0 = 1_000_000;
  rateLimit(s, "ip", regra, t0);
  // Martela durante toda a janela.
  for (let t = t0 + 1; t < t0 + 10_000; t += 100) {
    assert.equal(rateLimit(s, "ip", regra, t).ok, false);
  }
  // Assim que a janela vence, libera — as marteladas não a prorrogaram.
  assert.equal(rateLimit(s, "ip", regra, t0 + 10_001).ok, true);
});

test("cada cliente tem sua própria conta", () => {
  const s = createRateState();
  const regra = [{ limit: 1, windowMs: 60_000 }];
  const t0 = 1_000_000;
  assert.equal(rateLimit(s, "reboque-a", regra, t0).ok, true);
  assert.equal(rateLimit(s, "reboque-b", regra, t0).ok, true);
  assert.equal(rateLimit(s, "reboque-a", regra, t0 + 1).ok, false);
  assert.equal(rateLimit(s, "reboque-b", regra, t0 + 1).ok, false);
});

test("as duas janelas valem ao mesmo tempo — a horária segura o laço lento", () => {
  const s = createRateState();
  const regras = [
    { limit: 10, windowMs: 60_000 },
    { limit: 15, windowMs: 3_600_000 },
  ];
  const t0 = 1_000_000;
  // Dez no primeiro minuto: dentro dos dois tetos.
  for (let i = 0; i < 10; i++) {
    assert.equal(rateLimit(s, "ip", regras, t0 + i * 100).ok, true);
  }
  // Minuto seguinte: o teto por minuto renovou, mas o horário só deixa mais 5.
  const t1 = t0 + 61_000;
  for (let i = 0; i < 5; i++) {
    assert.equal(rateLimit(s, "ip", regras, t1 + i * 100).ok, true, `extra ${i}`);
  }
  assert.equal(rateLimit(s, "ip", regras, t1 + 600).ok, false, "o teto horário tem de pegar");
});

test("o retryAfter diz um tempo que realmente libera", () => {
  const s = createRateState();
  const regra = [{ limit: 1, windowMs: 30_000 }];
  const t0 = 1_000_000;
  rateLimit(s, "ip", regra, t0);
  const v = rateLimit(s, "ip", regra, t0 + 5_000);
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.ok(v.retryAfterS >= 1 && v.retryAfterS <= 30, `retryAfter ${v.retryAfterS}`);
  // Esperar o que ele mandou tem de bastar.
  assert.equal(rateLimit(s, "ip", regra, t0 + 5_000 + v.retryAfterS * 1000).ok, true);
});

test("sem regras, não há portaria", () => {
  assert.equal(rateLimit(createRateState(), "ip", [], 0).ok, true);
});

test("os tetos publicados cabem no uso real de bordo", () => {
  // Meteo: o app busca quando a posição muda de célula. Poucas por hora.
  const meteoMin = METEO_RULES.find((r) => r.windowMs === 60_000)!;
  assert.ok(meteoMin.limit >= 30, "folga demais é melhor que cortar a tripulação");

  // Voz: uma conversa animada faz ~6 turnos/min, 2 chamadas por turno = 12.
  const vozMin = VOICE_RULES.find((r) => r.windowMs === 60_000)!;
  assert.ok(vozMin.limit >= 24, `teto por minuto ${vozMin.limit} apertaria a conversa`);

  // E o teto horário tem de ser menor que o por minuto vezes 60, senão não
  // limita nada além do que o por minuto já limita.
  for (const regras of [METEO_RULES, VOICE_RULES]) {
    const porMin = regras.find((r) => r.windowMs === 60_000)!;
    const porHora = regras.find((r) => r.windowMs === 3_600_000)!;
    assert.ok(
      porHora.limit < porMin.limit * 60,
      "o teto horário precisa morder antes do por-minuto saturar",
    );
  }
});
