/**
 * Proa · TugLife Systems — Cadastro de nome com confirmação
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.14.0  (módulo novo nesta versão)
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * O DEFEITO QUE ISTO CORRIGE (P13, item 13.2)
 * Até a 1.13.0, depois de "Qual o seu nome?" QUALQUER fala de uma ou duas
 * palavras virava nome e ia pro aparelho para sempre. Foi assim que um
 * tablet passou a cumprimentar "Bom dia, Tadala" — ninguém a bordo se chama
 * Tadala; foi ruído de passadiço que o transcritor vestiu de nome.
 *
 * A REGRA NOVA
 * Nome só entra com CONFIRMAÇÃO. Ouviu um candidato → ela repete: "Anotei
 * Jossian. Certo?" → só grava se a próxima fala, em até 20 s, for um sim.
 * Um não descarta com uma frase; qualquer outra coisa descarta em silêncio
 * e a fala segue o caminho normal (pode ser uma pergunta de verdade).
 *
 * É como se passa um nome pelo rádio: soletra, o outro lado repete, e só
 * então se anota. Sem a repetição, não vale.
 *
 * Este módulo é puro: entra o estado e a fala, sai o próximo estado e UMA
 * ação. Quem grava no aparelho e quem fala é o componente.
 * ---------------------------------------------------------------------------
 */
import { askedForName } from "./alana-presence.ts";
import { extractCrewNames, extractNameAnswer } from "./crew.ts";
import { foldPt } from "./wake-word.ts";

/** Prazo para o sim depois de "Anotei X. Certo?", em ms. */
export const NAME_CONFIRM_MS = 20_000;

const YES = new Set([
  "sim", "isso", "isso mesmo", "isso ai", "certo", "correto", "exato", "exatamente",
  "confirma", "confirmado", "positivo", "afirmativo", "pode ser", "beleza", "fechou",
  "e isso", "e isso mesmo", "ta certo", "ta certo sim", "sim senhora", "sim sim", "uhum", "aham",
]);
const NO = new Set([
  "nao", "nao e", "nao e isso", "errado", "negativo", "ta errado", "nao nao", "nada a ver", "nao senhora",
]);

/**
 * Normaliza a fala pra comparar com as listas: sem acento, sem pontuação,
 * sem o nome dela no fim ("sim, Lara" é sim). Frase longa começando com
 * "sim" NÃO é confirmação — é outra coisa, e a lista é de frases inteiras.
 */
function plain(text: string): string {
  return foldPt(text)
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(lara|iara|yara)$/, "")
    .trim();
}

export function isYes(text: string): boolean {
  return YES.has(plain(text));
}

export function isNo(text: string): boolean {
  return NO.has(plain(text));
}

export type EnrollState = {
  /** Nome à espera de confirmação, ou `null`. */
  pending: string | null;
  /** Relógio monotônico de quando ela perguntou "Certo?". */
  askedAt: number;
};

export const ENROLL_IDLE: EnrollState = { pending: null, askedAt: Number.NEGATIVE_INFINITY };

export type EnrollInput = {
  /** A fala, já aparada. */
  text: string;
  nowMono: number;
  /** Última fala da Lara, para saber se ela acabou de perguntar o nome. */
  lastAssistant?: string | null;
};

export type EnrollAction =
  /** Nada a ver com nome: a fala segue o caminho normal. */
  | { kind: "none" }
  /** Ouviu um candidato: falar `confirmLine(name)` e esperar o sim. */
  | { kind: "confirm"; name: string }
  /** Veio o sim: gravar `name` (e a impressão vocal de quando ele foi dito). */
  | { kind: "save"; name: string }
  /** Veio o não: descartar com `discardLine()`. */
  | { kind: "discard" };

/**
 * Um passo do cadastro.
 *
 * Comportamento conforme as variáveis:
 *   pendente e dentro de 20 s, fala = sim   → `save`, limpa o pendente
 *   pendente e dentro de 20 s, fala = não   → `discard`, limpa
 *   pendente e dentro de 20 s, outra fala   → `none`, limpa (não era sobre o
 *                                              nome; a fala segue normal)
 *   pendente vencido                        → como se não houvesse pendente
 *   "meu nome é X" / "sou o X" na fala      → `confirm` X
 *   Lara acabou de perguntar o nome, e a fala
 *     tem cara de nome (1–2 palavras, sem
 *     palavra de pergunta)                  → `confirm`
 *   senão                                   → `none`
 */
export function routeEnroll(
  state: EnrollState,
  input: EnrollInput,
): { state: EnrollState; action: EnrollAction } {
  const text = input.text.trim();
  const vivo = state.pending && input.nowMono - state.askedAt <= NAME_CONFIRM_MS;

  if (vivo && state.pending) {
    if (isYes(text)) return { state: ENROLL_IDLE, action: { kind: "save", name: state.pending } };
    if (isNo(text)) return { state: ENROLL_IDLE, action: { kind: "discard" } };
    return { state: ENROLL_IDLE, action: { kind: "none" } };
  }

  if (!text) return { state: ENROLL_IDLE, action: { kind: "none" } };
  const found = extractCrewNames(text);
  const candidate =
    found[0] ?? (askedForName(input.lastAssistant) ? extractNameAnswer(text) : null);
  if (!candidate) return { state: ENROLL_IDLE, action: { kind: "none" } };
  return {
    state: { pending: candidate, askedAt: input.nowMono },
    action: { kind: "confirm", name: candidate },
  };
}

/** O que ela diz ao ouvir um candidato. Sem "Lara" no texto: o microfone acorda. */
export function confirmLine(name: string): string {
  return `Anotei ${name}. Certo?`;
}

/** O que ela diz ao gravar. */
export function savedLine(name: string): string {
  return `Fechou, ${name}. Tô aqui. Pode mandar.`;
}

/** O que ela diz ao descartar. */
export function discardLine(): string {
  return "Beleza, deixa pra lá. Me diz de novo quando quiser.";
}
