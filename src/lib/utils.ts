import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function round(n: number, digits = 1) {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export function pad3(n: number) {
  const v = ((Math.round(n) % 360) + 360) % 360;
  return v.toString().padStart(3, "0");
}

export function cardinal(deg: number) {
  const dirs = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[i]!;
}

export function formatLatLon(lat: number, lon: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}  ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

export function hourKey(ms: number) {
  return Math.floor(ms / 3_600_000) * 3_600_000;
}

export function formatHour(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatEtaClock(ms: number) {
  return new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatEtaDay(ms: number, nowMs = Date.now()) {
  const t = new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const start = (x: number) => {
    const d = new Date(x);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const diff = Math.round((start(ms) - start(nowMs)) / 86_400_000);
  if (diff === 0) return `hoje ${t}`;
  if (diff === 1) return `amanhã ${t}`;
  if (diff === -1) return `ontem ${t}`;
  const dia = new Date(ms).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${dia} ${t}`;
}

export function formatNowStamp(ms = Date.now()) {
  const d = new Date(ms);
  const wd = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const day = d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  const t = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${wd} ${day} ${t}`;
}

export function formatDurationMin(min: number) {
  if (!Number.isFinite(min) || min < 0) return "—";
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${h}h${String(m).padStart(2, "0")}`;
  }
  return `${Math.round(min)} min`;
}
