export const ALANA_GREET = "Boa tarde. Sou a Alana, do passadiço. Qual o seu nome?";
export const ALANA_BYE = "Beleza. Me chama se precisar.";
export const ALANA_MISS = "Não peguei. Manda de novo.";
export const ALANA_XTE =
  "Olha só. A gente abriu demais da derrota. XTE alto — volta pra linha.";
export const ALANA_ROLL =
  "Ó o balanço de banda. Tá forte. Segura o rumo e a faixa de RPM.";

export type CannedKind = "greet" | "bye" | "miss" | "xte" | "roll";

export function isCannedKind(v: unknown): v is CannedKind {
  return v === "greet" || v === "bye" || v === "miss" || v === "xte" || v === "roll";
}

export function cannedText(kind: CannedKind) {
  if (kind === "bye") return ALANA_BYE;
  if (kind === "miss") return ALANA_MISS;
  if (kind === "xte") return ALANA_XTE;
  if (kind === "roll") return ALANA_ROLL;
  return ALANA_GREET;
}
