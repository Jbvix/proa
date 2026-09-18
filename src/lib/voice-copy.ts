export const ALANA_GREET = "Oi. Tô na escuta.";
export const ALANA_BYE = "Fechou. Me chama quando precisar.";

export type CannedKind = "greet" | "bye";

export function isCannedKind(v: unknown): v is CannedKind {
  return v === "greet" || v === "bye";
}
