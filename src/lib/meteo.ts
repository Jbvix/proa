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
};

export type MeteoPlano = "comercial" | "gratuito";

export type MeteoBundle = {
  now: MeteoNow;
  hourly: MeteoHour[];
  plano: MeteoPlano;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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

export function syntheticMeteo(lat: number, lon: number, nowMs = Date.now()): MeteoBundle {
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
    plano: "gratuito",
  };
}

export async function fetchMeteo(lat: number, lon: number): Promise<MeteoBundle> {
  const r = await fetch(`/api/meteo?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
  if (!r.ok) throw new Error("Falha ao ler meteorologia.");
  return (await r.json()) as MeteoBundle;
}

export async function fetchMeteoUpstream(
  lat: number,
  lon: number,
  apiKey = "",
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

  const marineUrl =
    `${host("marine-api")}/v1/marine?latitude=${latS}&longitude=${lonS}` +
    `&current=wave_height,wave_direction,wave_period,wave_peak_period,swell_wave_height,swell_wave_period,wind_wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction` +
    `&hourly=wave_height,wave_direction,wave_period,swell_wave_height,sea_surface_temperature` +
    `&forecast_days=2&timezone=auto` +
    q;

  const marineFallback =
    `${host("marine-api")}/v1/marine?latitude=${latS}&longitude=${lonS}` +
    `&hourly=wave_height,wave_direction,wave_period,swell_wave_height,sea_surface_temperature` +
    `&forecast_days=2&timezone=auto` +
    q;

  const [weatherRes, marinePrimary] = await Promise.all([
    pullJson(weatherUrl),
    pullJson(marineUrl),
  ]);

  if (!weatherRes.ok) throw new Error("Falha ao ler o Open-Meteo (vento).");
  const weather = (await weatherRes.json()) as {
    current?: Record<string, unknown>;
    hourly?: Record<string, unknown[]>;
  };

  let marineRes = marinePrimary;
  if (!marineRes.ok) marineRes = await pullJson(marineFallback);

  let marine: {
    current?: Record<string, unknown>;
    hourly?: Record<string, unknown[]>;
  } = {};
  if (marineRes.ok) {
    marine = (await marineRes.json()) as typeof marine;
  }

  const nowMs = Date.now();
  const wTimes = weather.hourly?.time as unknown as string[] | undefined;
  const mTimes = marine.hourly?.time as unknown as string[] | undefined;
  const wi = nearestHourIndex(wTimes, nowMs);
  const mi = nearestHourIndex(mTimes, nowMs);

  const currentKn =
    pickCurrentOrHour(marine.current, marine.hourly, "ocean_current_velocity", mi);
  const currentKnVal = currentKn != null ? currentKn * 1.94384 : null;

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
    waveHs: pickCurrentOrHour(marine.current, marine.hourly, "wave_height", mi),
    waveDir: pickCurrentOrHour(marine.current, marine.hourly, "wave_direction", mi),
    wavePeriod: pickCurrentOrHour(marine.current, marine.hourly, "wave_period", mi),
    wavePeak: pickCurrentOrHour(marine.current, marine.hourly, "wave_peak_period", mi),
    swellHs: pickCurrentOrHour(marine.current, marine.hourly, "swell_wave_height", mi),
    swellPeriod: pickCurrentOrHour(marine.current, marine.hourly, "swell_wave_period", mi),
    windWaveHs: pickCurrentOrHour(marine.current, marine.hourly, "wind_wave_height", mi),
    sstC: pickCurrentOrHour(marine.current, marine.hourly, "sea_surface_temperature", mi),
    currentKn: currentKnVal,
    currentDir: pickCurrentOrHour(marine.current, marine.hourly, "ocean_current_direction", mi),
  };

  const hours: MeteoHour[] = [];
  const n = Math.max(wTimes?.length ?? 0, mTimes?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const tStr = (mTimes?.[i] ?? wTimes?.[i]) as string | undefined;
    if (!tStr) continue;
    const t = Date.parse(tStr);
    hours.push({
      t,
      windKn: num(weather.hourly?.wind_speed_10m?.[i]),
      windDir: num(weather.hourly?.wind_direction_10m?.[i]),
      gustKn: num(weather.hourly?.wind_gusts_10m?.[i]),
      waveHs: num(marine.hourly?.wave_height?.[i]),
      waveDir: num(marine.hourly?.wave_direction?.[i]),
      wavePeriod: num(marine.hourly?.wave_period?.[i]),
      swellHs: num(marine.hourly?.swell_wave_height?.[i]),
    });
  }

  return { now, hourly: hours, plano: comercial ? "comercial" : "gratuito" };
}
