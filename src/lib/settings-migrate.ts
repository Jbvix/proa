/**
 * Proa · TugLife Systems — Migração do estado guardado no aparelho
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.8.0  (módulo novo nesta versão)
 * @data     2026-09-20 02:14 UTC  (ano 2026)
 *
 * O PROBLEMA QUE ISTO RESOLVE
 * Tirar um campo do código NÃO tira o que ele já gravou no aparelho. Quando o
 * controle de turno saiu na 1.5.0, `crewWatches` sumiu do store — mas o que ele
 * escreveu no `localStorage` de cada tablet continuou lá, com **nome de
 * tripulante e hora de fim de turno**, e pior: sem nenhuma tela que mostrasse
 * ou apagasse aquilo, porque o painel de turnos foi removido junto.
 *
 * E não é só disco. O `merge` padrão do zustand é raso — `{...atual,
 * ...guardado}` — então a chave órfã voltava para dentro do objeto do store a
 * cada abertura do app, viva na memória e invisível para o TypeScript.
 *
 * POR QUE MIGRAÇÃO E NÃO ESPERAR A PRÓXIMA GRAVAÇÃO
 * Sem `version`, o zustand só reescreve o blob quando alguma configuração
 * muda. Num tablet de passadiço que ninguém reconfigura, "a próxima gravação"
 * pode não acontecer nunca. Com `version` diferente da guardada, a migração
 * roda e o zustand grava na hora (`if (migrated) return setItem()`), e o
 * `partialize` deixa de fora o que não existe mais. Dado morto tem de ser
 * jogado ao mar assim que se descobre, não na próxima faxina.
 * ---------------------------------------------------------------------------
 */

/** Versão atual do formato guardado. Subir aqui faz a migração rodar. */
export const SETTINGS_VERSION = 1;

/**
 * Campos que já foram gravados por versões antigas e não existem mais.
 *
 * Cada entrada é dado que ficou órfão no aparelho de alguém. Quem remover um
 * campo persistido daqui pra frente acrescenta o nome aqui e sobe
 * `SETTINGS_VERSION` — é o que garante que o dado saia do tablet, e não só do
 * código.
 */
export const DEAD_SETTINGS_KEYS = [
  /** Turno de serviço: nome de tripulante + hora de fim. Saiu na 1.5.0. */
  "crewWatches",
] as const;

/**
 * Limpa o que versões antigas gravaram e o app não usa mais.
 *
 * Comportamento conforme as variáveis:
 *   guardado nulo ou não-objeto → devolve `{}`, e o store fica no padrão
 *   versão < 1                  → remove `crewWatches` (nome e hora de turno)
 *   versão já atual             → devolve como veio, sem tocar
 *
 * Não inventa campo nem corrige valor: saneamento de conteúdo continua sendo
 * do `onRehydrateStorage`. Aqui só se joga fora o que não tem mais dono.
 *
 * @param guardado o que estava no `localStorage`, já desserializado
 * @param versao   a versão com que foi gravado
 */
export function migrateSettings(guardado: unknown, versao: number): unknown {
  if (!guardado || typeof guardado !== "object" || Array.isArray(guardado)) {
    return {};
  }
  const limpo = { ...(guardado as Record<string, unknown>) };
  if (versao < 1) {
    for (const morta of DEAD_SETTINGS_KEYS) delete limpo[morta];
  }
  return limpo;
}
