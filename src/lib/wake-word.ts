const WAKE_RE =
  /\b(?:oi|ola|eai|e ai|eae|fala|hey|ei|boa\s+tarde|bom\s+dia|boa\s+noite)?\s*h?a[\s.-]*l+a+n+a+h?s?\b/;

const SLEEP_RE =
  /^(tchau|xau|flw|desliga|pode parar|silencio|cala a boca|ate ja|ate logo|valeu|obrigad[ao]|depois a gente se fala)(?:\s+alana)?\.?$/;

export function foldPt(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function hearWake(raw: string): {
  woke: boolean;
  rest: string;
  sleep: boolean;
} {
  const t = foldPt(raw);
  if (!t) return { woke: false, rest: "", sleep: false };
  const sleep = SLEEP_RE.test(t);
  const m = t.match(WAKE_RE);
  if (!m) return { woke: false, rest: t, sleep };
  const rest = t.slice((m.index ?? 0) + m[0].length).replace(/^[\s,.\-:;?!]+/, "");
  return { woke: true, rest, sleep: SLEEP_RE.test(rest) || (sleep && rest.length < 12) };
}
