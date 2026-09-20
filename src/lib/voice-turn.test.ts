/**
 * Proa · TugLife Systems — Testes do roteamento do turno
 * ---------------------------------------------------------------------------
 * @autor  Jossian Brito
 * @versao 1.14.0 · 2026-09-20 12:00 UTC (ano 2026)
 *
 * Estes testes foram escritos ANTES de o roteamento sair do componente, contra
 * a escada de `return` original, justamente pra que a extração pudesse ser
 * conferida em vez de acreditada. É a rede que faltava pra mexer no laço de
 * turno sem apostar.
 * ---------------------------------------------------------------------------
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { FOLLOW_UP_MS, inFollowUp, routeHeard, type HeardInput } from "./voice-turn.ts";

/** Nada é eco — o caso normal. */
const semEco = () => false;
/** Tudo é eco — pra forçar o lado oposto de cada peneira. */
const tudoEco = () => true;

/** Conversa fechada, Lara livre, frase fechada: o estado de repouso. */
function ouvindo(over: Partial<HeardInput> = {}): HeardInput {
  return {
    text: "",
    isFinal: true,
    fromPtt: false,
    busy: false,
    talkOn: false,
    // Conversa aberta nos testes antigos = "ela acabou de responder", que é
    // a janela de continuação (1.14.0). Os testes da janela sobrescrevem.
    followUp: over.talkOn === true,
    inIntroEcho: false,
    ...over,
  };
}

/* --------------------------------------------------------------------- */
/* 1. Linha ocupada                                                       */
/* --------------------------------------------------------------------- */

test("ocupada: pergunta atrás do nome fica guardada, não se perde", () => {
  // Quem está no passadiço emenda a pergunta por cima da resposta. Descartar
  // obrigaria a repetir; responder na hora atropelaria a própria fala.
  const r = routeHeard(
    ouvindo({ busy: true, text: "lara qual a maré agora" }),
    semEco,
  );
  assert.equal(r.kind, "defer");
});

test("ocupada: fala curta atrás do nome é ruído de cabine, não pergunta", () => {
  // Menos de 6 caracteres depois do nome não é pedido nenhum.
  assert.equal(routeHeard(ouvindo({ busy: true, text: "lara" }), semEco).kind, "ignore");
  assert.equal(routeHeard(ouvindo({ busy: true, text: "lara oi" }), semEco).kind, "ignore");
});

test("ocupada: o próprio eco nunca é guardado", () => {
  // Senão a Lara responderia à própria frase assim que a linha abrisse.
  assert.equal(
    routeHeard(ouvindo({ busy: true, text: "lara qual a maré agora" }), tudoEco).kind,
    "ignore",
  );
});

test("ocupada e em conversa: pergunta sem o nome também fica guardada", () => {
  const r = routeHeard(
    ouvindo({ busy: true, talkOn: true, text: "quanto falta pro destino" }),
    semEco,
  );
  assert.equal(r.kind, "defer");
});

test("ocupada e SEM conversa: fala sem o nome é papo de ponte, se descarta", () => {
  // A Lara não é secretária de tudo que se diz no passadiço.
  const r = routeHeard(
    ouvindo({ busy: true, text: "põe mais dois graus a bombordo" }),
    semEco,
  );
  assert.equal(r.kind, "ignore");
});

test("ocupada: 'tchau' em conversa não vira pergunta guardada", () => {
  // Guardar uma despedida faria a Lara se despedir minutos depois, do nada.
  const r = routeHeard(ouvindo({ busy: true, talkOn: true, text: "tchau" }), semEco);
  assert.equal(r.kind, "ignore");
});

test("ocupada: vazio não guarda nada", () => {
  assert.equal(routeHeard(ouvindo({ busy: true, text: "" }), semEco).kind, "ignore");
  assert.equal(routeHeard(ouvindo({ busy: true, text: "   " }), semEco).kind, "ignore");
});

/* --------------------------------------------------------------------- */
/* 2. Vazio                                                               */
/* --------------------------------------------------------------------- */

test("transcrição vazia não faz nada", () => {
  assert.equal(routeHeard(ouvindo({ text: "" }), semEco).kind, "ignore");
  assert.equal(routeHeard(ouvindo({ text: "  \n " }), semEco).kind, "ignore");
});

/* --------------------------------------------------------------------- */
/* 3. Conversa aberta ou botão apertado                                   */
/* --------------------------------------------------------------------- */

test("em conversa não é preciso chamar pelo nome a cada frase", () => {
  const r = routeHeard(ouvindo({ talkOn: true, text: "qual a maré agora" }), semEco);
  assert.equal(r.kind, "ask");
  if (r.kind !== "ask") return;
  assert.equal(r.question, "qual a maré agora");
});

test("a pergunta sai crua sem o nome e dobrada com ele", () => {
  // Assimetria herdada e preservada: sem palavra de acordar a frase vai como
  // veio do transcritor, com acento; com ela, vai o resto já dobrado por
  // `hearWake` (sem acento, minúsculas). Só muda a grafia do que chega ao
  // modelo, e ele lê os dois — mas o comportamento fica documentado aqui em
  // vez de surpreender quem mexer no roteamento depois.
  const sem = routeHeard(ouvindo({ talkOn: true, text: "qual a maré agora" }), semEco);
  const com = routeHeard(ouvindo({ talkOn: true, text: "lara qual a maré agora" }), semEco);
  assert.equal(sem.kind === "ask" && sem.question, "qual a maré agora");
  assert.equal(com.kind === "ask" && com.question, "qual a mare agora");
});

test("o botão de falar dispensa o nome mesmo com a conversa fechada", () => {
  const r = routeHeard(ouvindo({ fromPtt: true, text: "me dá um relatório" }), semEco);
  assert.equal(r.kind, "ask");
});

test("em conversa, o nome na frente é retirado da pergunta", () => {
  const r = routeHeard(
    ouvindo({ talkOn: true, text: "lara, quanto falta pro destino" }),
    semEco,
  );
  assert.equal(r.kind, "ask");
  if (r.kind !== "ask") return;
  assert.ok(!r.question.startsWith("lara"), `sobrou o nome: ${r.question}`);
  assert.match(r.question, /quanto falta/);
});

test("despedida com a conversa aberta fecha o turno", () => {
  for (const t of ["tchau", "tchau lara", "valeu", "pode parar"]) {
    assert.equal(routeHeard(ouvindo({ talkOn: true, text: t }), semEco).kind, "endTalk", t);
  }
});

test("só o nome, com a conversa fechada e o botão apertado, abre a conversa", () => {
  const r = routeHeard(ouvindo({ fromPtt: true, text: "lara" }), semEco);
  assert.equal(r.kind, "startTalk");
});

test("só o nome, com a conversa já aberta, é a pessoa se corrigindo", () => {
  // Não reabre nem responde: ela já está ouvindo.
  const r = routeHeard(ouvindo({ talkOn: true, text: "lara" }), semEco);
  assert.equal(r.kind, "ignore");
});

test("em conversa, o eco da própria Lara não vira pergunta", () => {
  const r = routeHeard(ouvindo({ talkOn: true, text: "passando o mucuripe" }), tudoEco);
  assert.equal(r.kind, "ignore");
});

/* --------------------------------------------------------------------- */
/* 4. Conversa fechada: só o nome acorda                                  */
/* --------------------------------------------------------------------- */

test("com a conversa fechada, papo de ponte não acorda a Lara", () => {
  // O motivo de existir da palavra de acordar: o passadiço conversa o tempo
  // todo e ela não pode responder a tudo.
  for (const t of [
    "põe mais dois graus a bombordo",
    "o prático já chamou no canal 16",
    "cadê o café",
  ]) {
    assert.equal(routeHeard(ouvindo({ text: t }), semEco).kind, "ignore", t);
  }
});

test("chamar pelo nome acorda, e o pedido vem junto", () => {
  const r = routeHeard(ouvindo({ text: "lara me dá um relatório" }), semEco);
  assert.equal(r.kind, "wake");
  if (r.kind !== "wake") return;
  assert.match(r.rest, /relatorio/);
});

test("chamar só pelo nome acorda com cumprimento, sem pedido", () => {
  const r = routeHeard(ouvindo({ text: "lara" }), semEco);
  assert.equal(r.kind, "wake");
  if (r.kind !== "wake") return;
  assert.equal(r.rest, "");
});

test("frase parcial não acorda — esperaria acordar no meio de uma palavra", () => {
  assert.equal(
    routeHeard(ouvindo({ text: "lara me dá", isFinal: false }), semEco).kind,
    "ignore",
  );
  assert.equal(
    routeHeard(ouvindo({ text: "lara me dá", isFinal: true }), semEco).kind,
    "wake",
  );
});

test("logo depois de se apresentar, o nome que volta é o alto-falante", () => {
  // Ela diz "Sou a Lara, do passadiço"; o microfone devolve "Lara".
  assert.equal(
    routeHeard(ouvindo({ text: "lara", inIntroEcho: true }), semEco).kind,
    "ignore",
  );
  // Mas com um pedido junto é gente de verdade falando.
  assert.equal(
    routeHeard(ouvindo({ text: "lara qual a maré", inIntroEcho: true }), semEco).kind,
    "wake",
  );
});

test("o eco com o nome dentro não acorda", () => {
  assert.equal(routeHeard(ouvindo({ text: "lara qual a maré" }), tudoEco).kind, "ignore");
});

test("despedida com o nome e conversa fechada segue outro caminho", () => {
  // Rota distinta de `endTalk` de propósito: com a conversa fechada ela ainda
  // abre a gaveta e se despede, em vez de só fechar calada. Achatar as duas
  // numa rota só faria a despedida sumir justamente quando ninguém a abriu.
  const r = routeHeard(ouvindo({ text: "tchau lara" }), semEco);
  assert.equal(r.kind, "sleep");
});

/* --------------------------------------------------------------------- */
/* Precedência das peneiras                                               */
/* --------------------------------------------------------------------- */

test("ocupada vence tudo: nem despedida passa na frente", () => {
  // A ordem das perguntas é o comportamento. Se 'ocupada' deixasse de vir
  // primeiro, a Lara se encerraria no meio da própria frase.
  const r = routeHeard(ouvindo({ busy: true, talkOn: true, text: "tchau lara" }), semEco);
  assert.equal(r.kind, "ignore");
});

test("conversa aberta vence a exigência do nome", () => {
  const fechada = routeHeard(ouvindo({ text: "qual a maré agora" }), semEco);
  const aberta = routeHeard(ouvindo({ talkOn: true, text: "qual a maré agora" }), semEco);
  assert.equal(fechada.kind, "ignore");
  assert.equal(aberta.kind, "ask");
});

test("o roteamento nunca devolve rota fora do catálogo", () => {
  const catalogo = new Set(["ignore", "defer", "sleep", "endTalk", "startTalk", "ask", "wake"]);
  const textos = ["", "lara", "tchau", "lara qual a maré", "põe a bombordo", "oi"];
  for (const text of textos) {
    for (const busy of [true, false]) {
      for (const talkOn of [true, false]) {
        for (const fromPtt of [true, false]) {
          for (const isFinal of [true, false]) {
            const r = routeHeard(
              { text, busy, talkOn, fromPtt, isFinal, inIntroEcho: false, followUp: false },
              semEco,
            );
            assert.ok(catalogo.has(r.kind), `${text} → ${r.kind}`);
          }
        }
      }
    }
  }
});

/* --------------------------------------------------------------------- */
/* 5. Janela de continuação (1.14.0)                                      */
/* --------------------------------------------------------------------- */

test("conversa aberta FORA da janela: fala sem o nome é papo de ponte", () => {
  // O furo da 1.10.0: gente falando perto do tablet mantinha a conversa viva
  // e cada frase ia pro modelo. Agora, passados 10 s da resposta dela, só o
  // nome acorda — com a gaveta aberta ou não.
  const r = routeHeard(ouvindo({ talkOn: true, followUp: false, text: "vira a boreste cinco graus" }), semEco);
  assert.equal(r.kind, "ignore");
});

test("conversa aberta fora da janela: com o nome, continua normal", () => {
  const r = routeHeard(ouvindo({ talkOn: true, followUp: false, text: "lara quanto falta pro destino" }), semEco);
  assert.equal(r.kind, "wake");
  if (r.kind === "wake") assert.match(r.rest, /quanto falta/);
});

test("conversa aberta fora da janela: a despedida ainda fecha o turno", () => {
  assert.equal(routeHeard(ouvindo({ talkOn: true, followUp: false, text: "tchau" }), semEco).kind, "endTalk");
});

test("ocupada, conversa aberta, ela ainda falando: fala por cima sem o nome não é guardada", () => {
  // Enquanto ela fala, `followUp` é falso. O que se diz por cima da resposta
  // só conta se a nomear — senão o papo do passadiço durante a resposta
  // viraria pergunta assim que ela calasse.
  const semNome = routeHeard(ouvindo({ busy: true, talkOn: true, followUp: false, text: "quanto falta pro destino" }), semEco);
  assert.equal(semNome.kind, "ignore");
  const comNome = routeHeard(ouvindo({ busy: true, talkOn: true, followUp: false, text: "lara quanto falta pro destino" }), semEco);
  assert.equal(comNome.kind, "defer");
});

test("em conversa, 'sim.' não é pergunta: a régua subiu para 10", () => {
  assert.equal(routeHeard(ouvindo({ busy: true, talkOn: true, text: "sim." }), semEco).kind, "ignore");
  assert.equal(routeHeard(ouvindo({ busy: true, talkOn: true, text: "e o vento?" }), semEco).kind, "defer");
});

test("inFollowUp: 10 s inclusivos depois do fim da fala; nunca falou = fora", () => {
  assert.equal(inFollowUp(1000, 1000 + FOLLOW_UP_MS), true);
  assert.equal(inFollowUp(1000, 1000 + FOLLOW_UP_MS + 1), false);
  assert.equal(inFollowUp(Number.NEGATIVE_INFINITY, 5), false);
});

test("conversa FECHADA, dentro da janela: 'e a corrente?' logo depois da resposta dispensa o nome", () => {
  // "Lara, qual o vento?" → resposta → "e a corrente?" em 10 s. É o modo de
  // continuação; a gaveta não precisa estar aberta.
  const r = routeHeard(ouvindo({ talkOn: false, followUp: true, text: "e a corrente" }), semEco);
  assert.equal(r.kind, "ask");
});

test("conversa fechada, dentro da janela: 'sim' chega como pergunta — é o cadastro que decide", () => {
  const r = routeHeard(ouvindo({ talkOn: false, followUp: true, text: "sim" }), semEco);
  assert.equal(r.kind, "ask");
});
