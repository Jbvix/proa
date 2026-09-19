import { foldPt } from "./wake-word.ts";

const STOP = new Set([
  "alana",
  "olana",
  "elana",
  "radio",
  "rebocador",
  "proa",
  "cara",
  "mano",
  "velho",
  "comandante",
  "senhor",
  "senhora",
  "capitao",
  "tripulacao",
  "passadico",
  "bordo",
  "do",
  "da",
  "de",
  "dos",
  "das",
]);

const INTRO_RE =
  /(?:meu nome (?:e|eh)|me chamo|pode me chamar de|me chama de|aqui (?:e|eh) o|aqui (?:e|eh) a|(?:eu )?sou o|(?:eu )?sou a)\s+([a-z]{2,18}(?:\s+[a-z]{2,18})?)/g;

function titleName(s: string) {
  return s.replace(/[a-zà-ú]+/gi, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function extractCrewNames(raw: string): string[] {
  const t = foldPt(raw);
  if (!t) return [];
  const out: string[] = [];
  INTRO_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INTRO_RE.exec(t))) {
    const parts = m[1]!.split(" ").filter((p) => p.length >= 2 && !STOP.has(p));
    if (!parts.length) continue;
    const name = titleName(parts.slice(0, 2).join(" "));
    if (name && !out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

export function mergeCrew(prev: string[], found: string[]) {
  const next = [...prev];
  for (const n of found) {
    if (next.some((p) => p.toLowerCase() === n.toLowerCase())) continue;
    next.push(n);
  }
  return next.slice(0, 6);
}
