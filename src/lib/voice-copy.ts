export const ALANA_GREET = "Oi. Tô no rádio, manda aí.";
export const ALANA_BYE = "Beleza. Me chama se precisar.";

export type CannedKind = "greet" | "bye";

export function isCannedKind(v: unknown): v is CannedKind {
  return v === "greet" || v === "bye";
}
