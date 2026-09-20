/**
 * Proa · TugLife Systems — Nomes da tripulação
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.14.0
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * MODIFICAÇÕES NA 1.14.0 (P13, item 13.1)
 *  - `dropCrew`: tira um nome da lista E a impressão vocal dele. Até aqui não
 *    havia como apagar um nome do aparelho a não ser limpando os dados do
 *    site inteiro — e foi assim que "Tadala" ficou meses num tablet.
 *  - A gravação em si passou a exigir confirmação (`voice-enroll.ts`);
 *    `extractCrewNames` e `extractNameAnswer` continuam só PROPONDO.
 *  - Cabeçalho de módulo adicionado; o arquivo não tinha.
 * ---------------------------------------------------------------------------
 */
import type { VoiceCard } from "./voice-print.ts";
import { foldPt } from "./wake-word.ts";

const STOP = new Set([
  "lara",
  "iara",
  "yara",
  "hiara",
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
  "eta",
  "sog",
  "rpm",
  "vento",
  "onda",
  "mare",
  "turno",
  "vigia",
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

/** "Jossian" after she asked the name. */
export function extractNameAnswer(raw: string): string | null {
  const t = foldPt(raw).replace(/^(eu sou (o|a)|sou (o|a)|me chamo|meu nome e)\s+/, "");
  if (/\b(qual|quando|como|onde|quanto|eta|hs|sog|xte|vento|mare|turno)\b/.test(t)) return null;
  const parts = t.split(/[^a-zà-ú]+/).filter((p) => p.length >= 2 && !STOP.has(p));
  if (parts.length < 1 || parts.length > 2) return null;
  if (parts.some((p) => p.length > 14)) return null;
  return titleName(parts.join(" "));
}

export function mergeCrew(prev: string[], found: string[]) {
  const next = [...prev];
  for (const n of found) {
    if (next.some((p) => p.toLowerCase() === n.toLowerCase())) continue;
    next.push(n);
  }
  return next.slice(0, 6);
}


/**
 * Tira `name` da lista de nomes e do banco de vozes, sem distinguir
 * maiúsculas. Devolve as duas listas novas; nada é mudado no lugar.
 */
export function dropCrew(
  names: readonly string[],
  voices: readonly VoiceCard[],
  name: string,
): { names: string[]; voices: VoiceCard[] } {
  const key = name.trim().toLowerCase();
  return {
    names: names.filter((n) => n.toLowerCase() !== key),
    voices: voices.filter((v) => v.name.toLowerCase() !== key),
  };
}
