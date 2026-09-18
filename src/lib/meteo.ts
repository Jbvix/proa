import type { TideHour } from "./tide";

export type MeteoPlano = "comercial" | "gratuito";

export type MeteoNow = {
  fetchedAt: number;
  lat: number;
  lon: number;
  tempC: number | null;
  weatherCode: number | null;
  windKn: number;
  windDir: number;
  gustKn: number;
  pressureHpa: number | null;
  visibilityM: number | null;
  waveHs: number | null;
  waveDir: number | null;
  wavePeriod: number | null;
  wavePeak: number | null;
  swellHs: number | null;
  swellPeriod: number | null;
  windWaveHs: number | null;
  sstC: number | null;
  currentKn: number | null;
  currentDir: number | null;
};

export type MeteoHour = {
  t: number;
  windKn: number | null;
  windDir: number | null;
  gustKn: number | null;
  waveHs: number | null;
  waveDir: number | null;
  wavePeriod: number | null;
  swellHs: number | null;
  currentKn: number | null;
  currentDir: number | null;
};

export type RouteStation = {
  lat: number;
  lon: number;
  distNm: number;
  label: string;
  waveHs: number | null;
  waveDir: number | null;
  wavePeriod: number | null;
  swellHs: number | null;
  currentKn: number | null;
  currentDir: number | null;
};

export type MeteoBundle = {
  now: MeteoNow;
  hourly: MeteoHour[];
  alongRoute: RouteStation[];
  tideHours: TideHour[];
  plano: MeteoPlano;
};

export type StationInput = {
  lat: number;
  lon: number;
  distNm?: number;
  label?: string;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function msToKn(v: number | null) {
  return v == null ? null : v * 1.94384;
}

function pickCurrentOrHour(
  current: Record<string, unknown> | undefined,
  hourly: Record<string, unknown[]> | undefined,
  key: string,
  timeIndex: number,
): number | null {
  const fromCurrent = current ? num(current[key]) : null;
  if (fromCurrent != null) return fromCurrent;
  const arr = hourly?.[key];
  return arr ? num(arr[timeIndex]) : null;
}

function nearestHourIndex(times: string[] | undefined, now: number) {
  if (!times?.length) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]!);
    const d = Math.abs(t - now);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const UA = "Proa/1.0 (TugLife Systems; https://github.com/Jbvix/proa)";

/** Host + query suffix. Key stays on the server; never returned to the browser. */
export function openMeteoEndpoints(apiKey = "") {
  const key = apiKey.trim();
  const comercial = key.length > 0;
  const host = (sub: "api" | "marine-api") =>
    comercial
      ? `https://customer-${sub}.open-meteo.com`
      : `https://${sub}.open-meteo.com`;
  const q = comercial ? `&apikey=${encodeURIComponent(key)}` : "";
  return { comercial, host, q };
}

async function pullJson(url: string): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12_000);
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
  } finally {
    clearTimeout(t);
  }
}

export const WMO: Record<number, string> = {
  0: "Céu limpo",
  1: "Principalmente limpo",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Névoa",
  48: "Névoa gelada",
  51: "Garoa fraca",
  53: "Garoa",
  55: "Garoa forte",
  61: "Chuva fraca",
  63: "Chuva",
  65: "Chuva forte",
  71: "Neve fraca",
  80: "Pancadas",
  81: "Pancadas",
  82: "Pancadas fortes",
  95: "Trovoada",
  96: "Trovoada com granizo",
  99: "Trovoada forte",
};

export function weatherLabel(code: number | null) {
  if (code == null) return "—";
  return WMO[code] ?? `Código ${code}`;
}

export function parseWaypointQuery(raw: string | null): StationInput[] {
  if (!raw) return [];
  const out: StationInput[] = [];
  for (const part of raw.split(";").slice(0, 6)) {
    const bits = part.split(",");
    const lat = Number(bits[0]);
    const lon = Number(bits[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({ lat, lon });
  }
  return out;
}

export function encodeWaypointQuery(stations: StationInput[]) {
  return stations
    .slice(0, 6)
    .map((s) => `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`)
    .join(";");
}

type OmBlock = {
  current?: Record<string, unknown>;
  hourly?: Record<string, unknown[]>;
};

function marineNow(marine: OmBlock, nowMs: number) {
  const times = marine.hourly?.time as unknown as string[] | undefined;
  const i = nearestHourIndex(times, nowMs);
  return {
    waveHs: pickCurrentOrHour(marine.current, marine.hourly, "wave_height", i),
    waveDir: pickCurrentOrHour(marine.current, marine.hourly, "wave_direction", i),
    wavePeriod: pickCurrentOrHour(marine.current, marine.hourly, "wave_period", i),
    wavePeak: pickCurrentOrHour(marine.current, marine.hourly, "wave_peak_period", i),
    swellHs: pickCurrentOrHour(marine.current, marine.hourly, "swell_wave_height", i),
    swellPeriod: pickCurrentOrHour(marine.current, marine.hourly, "swell_wave_period", i),
    windWaveHs: pickCurrentOrHour(marine.current, marine.hourly, "wind_wave_height", i),
    sstC: pickCurrentOrHour(marine.current, marine.hourly, "sea_surface_temperature", i),
    currentKn: msToKn(
      pickCurrentOrHour(marine.current, marine.hourly, "ocean_current_velocity", i),
    ),
    currentDir: pickCurrentOrHour(
      marine.current,
      marine.hourly,
      "ocean_current_direction",
      i,
    ),
  };
}

function tideHoursFrom(marine: OmBlock): TideHour[] {
  const times = marine.hourly?.time as unknown as string[] | undefined;
  const sea = marine.hourly?.sea_level_height_msl;
  if (!times?.length || !sea) return [];
  const out: TideHour[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]!);
    const seaM = num(sea[i]);
    if (!Number.isFinite(t) || seaM == null) continue;
    out.push({ t, seaM });
  }
  return out;
}

function syntheticTide(nowMs: number): TideHour[] {
  const out: TideHour[] = [];
  const start = Math.floor(nowMs / 3_600_000) * 3_600_000 - 3 * 3_600_000;
  const period = 12.42 * 3_600_000;
  for (let i = 0; i < 72; i++) {
    const t = start + i * 3_600_000;
    const seaM = 0.15 + 1.05 * Math.sin((2 * Math.PI * (t - start)) / period);
    out.push({ t, seaM });
  }
  return out;
}

async function fetchMarineJson(
  lat: number,
  lon: number,
  host: (sub: "api" | "marine-api") => string,
  q: string,
): Promise<OmBlock> {
  const latS = lat.toFixed(4);
  const lonS = lon.toFixed(4);
  const full =
    `${host("marine-api")}/v1/marine?latitude=${latS}&longitude=${lonS}` +
    `&current=wave_height,wave_direction,wave_period,wave_peak_period,swell_wave_height,swell_wave_period,wind_wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction` +
    `&hourly=wave_height,wave_direction,wave_period,swell_wave_height,ocean_current_velocity,ocean_current_direction,sea_level_height_msl` +
    `&forecast_days=4&timezone=auto` +
    q;
  const fallback =
    `${host("marine-api")}/v1/marine?latitude=${latS}&longitude=${lonS}` +
    `&hourly=wave_height,wave_direction,wave_period,swell_wave_height,sea_level_height_msl` +
    `&forecast_days=4&timezone=auto` +
    q;
  let res = await pullJson(full);
  if (!res.ok) res = await pullJson(fallback);
  if (!res.ok) return {};
  return (await res.json()) as OmBlock;
}

export function syntheticMeteo(
  lat: number,
  lon: number,
  nowMs = Date.now(),
  waypoints: StationInput[] = [],
): MeteoBundle {
  const hours: MeteoHour[] = [];
  const start = Math.floor(nowMs / 3_600_000) * 3_600_000 - 6 * 3_600_000;
  for (let i = 0; i < 24; i++) {
    const t = start + i * 3_600_000;
    const phase = Math.sin(i / 5);
    const hs = 1.25 + phase * 0.28;
    hours.push({
      t,
      windKn: 14 + phase * 3,
      windDir: 85 + phase * 8,
      gustKn: 19 + phase * 4,
      waveHs: hs,
      waveDir: 90,
      wavePeriod: 7.6 + phase * 0.6,
      swellHs: 0.9 + phase * 0.15,
      currentKn: 0.4,
      currentDir: 310,
    });
  }
  const nowH = hours[6]!;
  return {
    now: {
      fetchedAt: nowMs,
      lat,
      lon,
      tempC: 27.4,
      weatherCode: 2,
      windKn: nowH.windKn ?? 14,
      windDir: nowH.windDir ?? 85,
      gustKn: nowH.gustKn ?? 19,
      pressureHpa: 1012,
      visibilityM: 20000,
      waveHs: nowH.waveHs,
      waveDir: nowH.waveDir,
      wavePeriod: nowH.wavePeriod,
      wavePeak: 9.1,
      swellHs: nowH.swellHs,
      swellPeriod: 10.2,
      windWaveHs: 0.5,
      sstC: 27.8,
      currentKn: 0.4,
      currentDir: 310,
    },
    hourly: hours,
    alongRoute: waypoints.map((wp, i) => {
      const phase = Math.sin(i / 2.2);
      return {
        lat: wp.lat,
        lon: wp.lon,
        distNm: wp.distNm ?? 0,
        label: wp.label ?? (i === 0 ? "Origem" : i === waypoints.length - 1 ? "Destino" : `WP ${i + 1}`),
        waveHs: 1.2 + phase * 0.25,
        waveDir: 85 + i * 4,
        wavePeriod: 7.4 + phase * 0.5,
        swellHs: 0.85 + phase * 0.12,
        currentKn: 0.35 + i * 0.04,
        currentDir: 300 + i * 6,
      };
    }),
    tideHours: syntheticTide(nowMs),
    plano: "gratuito",
  };
}

export async function fetchMeteo(
  lat: number,
  lon: number,
  stations: StationInput[] = [],
): Promise<MeteoBundle> {
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
  });
  const wps = encodeWaypointQuery(stations);
  if (wps) params.set("wps", wps);
  const r = await fetch(`/api/meteo?${params.toString()}`);
  if (!r.ok) throw new Error("Falha ao ler meteorologia.");
  const data = (await r.json()) as MeteoBundle;
  if (!Array.isArray(data.alongRoute)) data.alongRoute = [];
  if (!Array.isArray(data.tideHours)) data.tideHours = [];
  data.alongRoute = data.alongRoute.map((s, i) => ({
    ...s,
    distNm: stations[i]?.distNm ?? s.distNm ?? 0,
    label: stations[i]?.label ?? s.label ?? `WP ${i + 1}`,
  }));
  return data;
}

export async function fetchMeteoUpstream(
  lat: number,
  lon: number,
  apiKey = "",
  waypoints: StationInput[] = [],
): Promise<MeteoBundle> {
  const { comercial, host, q } = openMeteoEndpoints(apiKey);
  const latS = lat.toFixed(4);
  const lonS = lon.toFixed(4);

  const weatherUrl =
    `${host("api")}/v1/forecast?latitude=${latS}&longitude=${lonS}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,visibility` +
    `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
    `&forecast_days=2&wind_speed_unit=kn&timezone=auto` +
    q;

  const uniqueWps: StationInput[] = [];
  for (const wp of waypoints.slice(0, 6)) {
    const dup = uniqueWps.some(
      (u) => Math.abs(u.lat - wp.lat) < 0.004 && Math.abs(u.lon - wp.lon) < 0.004,
    );
    if (!dup) uniqueWps.push(wp);
  }

  const [weatherRes, hereMarine, ...wpMarine] = await Promise.all([
    pullJson(weatherUrl),
    fetchMarineJson(lat, lon, host, q),
    ...uniqueWps.map((wp) => fetchMarineJson(wp.lat, wp.lon, host, q)),
  ]);

  if (!weatherRes.ok) throw new Error("Falha ao ler o Open-Meteo (vento).");
  const weather = (await weatherRes.json()) as OmBlock;
  const marine = hereMarine;

  const nowMs = Date.now();
  const wTimes = weather.hourly?.time as unknown as string[] | undefined;
  const mTimes = marine.hourly?.time as unknown as string[] | undefined;
  const wi = nearestHourIndex(wTimes, nowMs);
  const sea = marineNow(marine, nowMs);

  const now: MeteoNow = {
    fetchedAt: nowMs,
    lat,
    lon,
    tempC: pickCurrentOrHour(weather.current, weather.hourly, "temperature_2m", wi),
    weatherCode: pickCurrentOrHour(weather.current, weather.hourly, "weather_code", wi),
    windKn: pickCurrentOrHour(weather.current, weather.hourly, "wind_speed_10m", wi) ?? 0,
    windDir: pickCurrentOrHour(weather.current, weather.hourly, "wind_direction_10m", wi) ?? 0,
    gustKn: pickCurrentOrHour(weather.current, weather.hourly, "wind_gusts_10m", wi) ?? 0,
    pressureHpa: pickCurrentOrHour(weather.current, weather.hourly, "pressure_msl", wi),
    visibilityM: pickCurrentOrHour(weather.current, weather.hourly, "visibility", wi),
    ...sea,
  };

  const hours: MeteoHour[] = [];
  const n = Math.max(wTimes?.length ?? 0, mTimes?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const tStr = (mTimes?.[i] ?? wTimes?.[i]) as string | undefined;
    if (!tStr) continue;
    hours.push({
      t: Date.parse(tStr),
      windKn: num(weather.hourly?.wind_speed_10m?.[i]),
      windDir: num(weather.hourly?.wind_direction_10m?.[i]),
      gustKn: num(weather.hourly?.wind_gusts_10m?.[i]),
      waveHs: num(marine.hourly?.wave_height?.[i]),
      waveDir: num(marine.hourly?.wave_direction?.[i]),
      wavePeriod: num(marine.hourly?.wave_period?.[i]),
      swellHs: num(marine.hourly?.swell_wave_height?.[i]),
      currentKn: msToKn(num(marine.hourly?.ocean_current_velocity?.[i])),
      currentDir: num(marine.hourly?.ocean_current_direction?.[i]),
    });
  }

  const alongRoute: RouteStation[] = uniqueWps.map((wp, i) => {
    const block = wpMarine[i] ?? {};
    const s = marineNow(block, nowMs);
    return {
      lat: wp.lat,
      lon: wp.lon,
      distNm: wp.distNm ?? 0,
      label: wp.label ?? `WP ${i + 1}`,
      waveHs: s.waveHs,
      waveDir: s.waveDir,
      wavePeriod: s.wavePeriod,
      swellHs: s.swellHs,
      currentKn: s.currentKn,
      currentDir: s.currentDir,
    };
  });

  const destMarine = wpMarine[wpMarine.length - 1] ?? marine;
  const tideHours = tideHoursFrom(destMarine);
  return {
    now,
    hourly: hours,
    alongRoute,
    tideHours,
    plano: comercial ? "comercial" : "gratuito",
  };
}
