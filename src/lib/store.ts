import { create } from "zustand";
import { persist } from "zustand/middleware";
import { hourKey } from "./utils";
import type { ParsedRoute } from "./gpx";
import { DEFAULT_PROFILE, type EngineProfile } from "./rpm";
import type { HourlyWave } from "./waves";
import { sensorEngine } from "./sensor-engine";

export type TabId = "painel" | "ondas" | "rota" | "rpm";

type SettingsState = {
  onboarded: boolean;
  rpm: number;
  profile: EngineProfile;
  route: ParsedRoute | null;
  hourly: HourlyWave[];
  setOnboarded: (v: boolean) => void;
  setRpm: (n: number) => void;
  setProfile: (p: Partial<EngineProfile>) => void;
  setRoute: (r: ParsedRoute | null) => void;
  upsertHour: (row: HourlyWave) => void;
  seedForecastHours: (rows: HourlyWave[]) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      onboarded: false,
      rpm: 920,
      profile: DEFAULT_PROFILE,
      route: null,
      hourly: [],
      setOnboarded: (v) => set({ onboarded: v }),
      setRpm: (n) => set({ rpm: n }),
      setProfile: (p) => set({ profile: { ...get().profile, ...p } }),
      setRoute: (r) => set({ route: r }),
      upsertHour: (row) => {
        const next = get().hourly.filter((h) => h.t !== row.t);
        next.push(row);
        next.sort((a, b) => a.t - b.t);
        set({ hourly: next.slice(-48) });
      },
      seedForecastHours: (rows) => {
        const map = new Map(get().hourly.map((h) => [h.t, h]));
        for (const row of rows) {
          const prev = map.get(row.t);
          map.set(row.t, {
            t: row.t,
            hsObs: prev?.hsObs ?? null,
            periodObs: prev?.periodObs ?? null,
            ampObs: prev?.ampObs ?? null,
            hsForecast: row.hsForecast,
            periodForecast: row.periodForecast,
            ampForecast: row.ampForecast,
            dirForecast: row.dirForecast,
            swellForecast: row.swellForecast,
          });
        }
        const next = [...map.values()].sort((a, b) => a.t - b.t).slice(-48);
        set({ hourly: next });
      },
    }),
    {
      name: "proa-settings",
      partialize: (s) => ({
        onboarded: s.onboarded,
        rpm: s.rpm,
        profile: s.profile,
        route: s.route,
      }),
    },
  ),
);

type BridgeState = {
  tab: TabId;
  setTab: (t: TabId) => void;
};

export const useBridge = create<BridgeState>((set) => ({
  tab: "painel",
  setTab: (t) => set({ tab: t }),
}));

export function recordObservedHour(wave: {
  hsM: number;
  periodS: number;
  amplitudeM: number;
}) {
  if (wave.hsM <= 0) return;
  const t = hourKey(Date.now());
  const prev = useSettings.getState().hourly.find((h) => h.t === t);
  useSettings.getState().upsertHour({
    t,
    hsObs: wave.hsM,
    periodObs: wave.periodS || null,
    ampObs: wave.amplitudeM,
    hsForecast: prev?.hsForecast ?? null,
    periodForecast: prev?.periodForecast ?? null,
    ampForecast: prev?.ampForecast ?? null,
    dirForecast: prev?.dirForecast ?? null,
    swellForecast: prev?.swellForecast ?? null,
  });
}

export function preferredLatLon(): { lat: number; lon: number } {
  const fix = sensorEngine.snapshot().fix;
  if (fix) return { lat: fix.lat, lon: fix.lon };
  const route = useSettings.getState().route;
  if (route?.points[0]) return { lat: route.points[0].lat, lon: route.points[0].lon };
  return { lat: -3.718, lon: -38.473 };
}
