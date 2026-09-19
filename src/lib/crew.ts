import { foldPt } from "./wake-word.ts";
import { formatEtaClock } from "./utils.ts";

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

export type CrewWatch = {
  name: string;
  endMs: number;
  warned: boolean;
  fired: boolean;
};

export const WATCH_WARN_MS = 5 * 60_000;

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

function atHour(nowMs: number, h: number, min: number) {
  const d = new Date(nowMs);
  d.setSeconds(0, 0);
  d.setHours(h, min, 0, 0);
  if (d.getTime() < nowMs - 120_000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function parseClockPt(raw: string, nowMs: number): number | null {
  const t = foldPt(raw);
  if (/meia[\s-]*noite/.test(t)) return atHour(nowMs, 0, 0);
  if (/meio[\s-]*dia/.test(t)) return atHour(nowMs, 12, 0);
  const rel = t.match(/\bdaqui\s+(\d{1,2})\s*(horas?|h|minutos?|min)\b/);
  if (rel) {
    const n = Number(rel[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    const unit = rel[2]!;
    return nowMs + (unit.startsWith("min") ? n * 60_000 : n * 3_600_000);
  }
  const hm = t.match(
    /\b(\d{1,2})\s*(?:[:h]|horas?)\s*(\d{2})?\s*(?:da\s+(manha|tarde|noite))?\b/,
  );
  const per = t.match(/\b(\d{1,2})\s+da\s+(manha|tarde|noite)\b/);
  let h: number | null = null;
  let min = 0;
  let period: string | undefined;
  if (hm) {
    h = Number(hm[1]);
    min = hm[2] ? Number(hm[2]) : 0;
    period = hm[3];
  } else if (per) {
    h = Number(per[1]);
    period = per[2];
  }
  if (h == null || !Number.isFinite(h) || h > 24 || min > 59) return null;
  if (h === 24) h = 0;
  if (period === "tarde" && h < 12) h += 12;
  if (period === "noite") {
    if (h === 12) h = 0;
    else if (h < 12) h += 12;
  }
  if (h > 23) return null;
  return atHour(nowMs, h, min);
}

function isWatchAsk(t: string) {
  return /turno|vigia|\bavisa\b|\baviso\b|acaba|acabar|termina|termino|fim de/.test(t);
}

function nameInText(t: string, crew: string[]): string | null {
  let best: string | null = null;
  for (const n of crew) {
    const f = foldPt(n);
    if (f.length < 3) continue;
    if (t.includes(f) && (!best || n.length > best.length)) best = n;
  }
  return best;
}

function pickName(t: string, crew: string[]): string | null {
  const known = nameInText(t, crew);
  if (known) return known;
  const m = t.match(
    /(?:avisa|chama|lembra|turno (?:do|da|de)|fim de turno (?:do|da|de)|pro|para o|para a)\s+(?:o |a )?([a-z]{3,18})/,
  );
  if (m && !STOP.has(m[1]!)) return titleName(m[1]!);
  if (/\bmeu\b|\bme avisa\b|\bavisa meu\b|\bme chama\b/.test(t)) {
    if (crew.length === 1) return crew[0]!;
    if (crew.length) return crew[crew.length - 1]!;
  }
  return null;
}

export function parseWatchAsk(raw: string, crew: string[], nowMs: number): CrewWatch | null {
  const t = foldPt(raw);
  if (!t || !isWatchAsk(t)) return null;
  const endMs = parseClockPt(t, nowMs);
  if (endMs == null) return null;
  const intros = extractCrewNames(raw);
  const names = mergeCrew(crew, intros);
  const name = pickName(t, names) ?? intros[0] ?? null;
  if (!name) return null;
  return { name, endMs, warned: false, fired: false };
}

export function parseWatchCancel(raw: string, crew: string[], watches: CrewWatch[]): string | null {
  const t = foldPt(raw);
  if (!t || !/cancela|esquece|nao (precisa|quero) avisar|tira o aviso/.test(t)) return null;
  const name = pickName(t, crew);
  if (name) return name;
  const live = watches.filter((w) => !w.fired);
  if (live.length === 1) return live[0]!.name;
  return nameInText(t, watches.map((w) => w.name));
}

export function watchLine(w: CrewWatch) {
  return `${w.name}. Fim de turno. ${formatEtaClock(w.endMs)}.`;
}

export function watchWarnLine(w: CrewWatch, nowMs = Date.now()) {
  const min = Math.max(1, Math.round((w.endMs - nowMs) / 60_000));
  if (min <= 1) return `${w.name}. Um minuto pro fim de turno.`;
  return `${w.name}. ${min} minutos pro fim de turno.`;
}

export function upsertWatch(prev: CrewWatch[], next: CrewWatch): CrewWatch[] {
  const rest = prev.filter((w) => w.name.toLowerCase() !== next.name.toLowerCase());
  return [...rest, next].slice(-6);
}

export function dropWatch(prev: CrewWatch[], name: string): CrewWatch[] {
  return prev.filter((w) => w.name.toLowerCase() !== name.toLowerCase());
}

export function pruneWatches(watches: CrewWatch[], nowMs: number): CrewWatch[] {
  return watches
    .map((w) => {
      if (!w.fired && nowMs > w.endMs + 8 * 60_000) return { ...w, warned: true, fired: true };
      return w;
    })
    .filter((w) => w.endMs > nowMs - 36 * 3_600_000);
}

export function dueWarn(watches: CrewWatch[], nowMs: number): CrewWatch | null {
  for (const w of watches) {
    if (w.fired || w.warned) continue;
    if (nowMs >= w.endMs - WATCH_WARN_MS && nowMs < w.endMs) return w;
  }
  return null;
}

export function dueWatch(watches: CrewWatch[], nowMs: number): CrewWatch | null {
  for (const w of watches) {
    if (w.fired) continue;
    if (nowMs >= w.endMs && nowMs <= w.endMs + 8 * 60_000) return w;
  }
  return null;
}

