export type DayPart = "manha" | "tarde" | "noite";

export function dayPart(ms = Date.now()): DayPart {
  const h = new Date(ms).getHours();
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

export function helloWord(ms = Date.now()) {
  const p = dayPart(ms);
  if (p === "manha") return "Bom dia";
  if (p === "tarde") return "Boa tarde";
  return "Boa noite";
}

/** First wake: introduce and ask the name. Later: greet the known colleague. */
/**
 * O cumprimento ao abrir a conversa.
 *
 * `askName` (1.14.0): sem nome na lista ela pergunta o nome — mas só uma vez
 * por sessão, e é o componente quem controla isso. Perguntar a cada
 * cumprimento com a lista vazia era pedir ruído: qualquer coisa que o
 * microfone pegasse depois virava tripulante.
 */
export function greetLine(names: string[], ms = Date.now(), heard?: string | null, askName = true) {
  const hi = helloWord(ms);
  const who =
    heard && names.some((n) => n.toLowerCase() === heard.toLowerCase()) ? heard : names[0];
  if (!who) {
    return askName ? `${hi}. Sou a Lara, do passadiço. Qual o seu nome?` : `${hi}. Tô aqui. Pode mandar.`;
  }
  return `${hi}, ${who}. Tô aqui. Pode mandar.`;
}

export function byeLine(names: string[]) {
  const who = names[0];
  return who ? `Beleza, ${who}. Me chama se precisar.` : "Beleza. Me chama se precisar.";
}

export function askedForName(lastAssistant?: string | null) {
  const t = (lastAssistant ?? "").toLowerCase();
  return t.includes("qual o seu nome") || t.includes("qual seu nome");
}
