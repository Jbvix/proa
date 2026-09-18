import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchMeteo, syntheticMeteo, type MeteoBundle } from "@/lib/meteo";
import { sampleRouteStations } from "@/lib/geo";
import { withCity } from "@/lib/places";
import { sensorEngine, type EngineSnapshot } from "@/lib/sensor-engine";
import {
  preferredLatLon,
  recordObservedHour,
  useSettings,
} from "@/lib/store";
import { hourKey } from "@/lib/utils";
import { amplitudeFromHs } from "@/lib/waves";

type BridgeCtx = {
  engine: EngineSnapshot | null;
  meteo: MeteoBundle | null;
  meteoError: string | null;
  meteoLoading: boolean;
};

const BOOT_FIX = {
  lat: -3.7184,
  lon: -38.4732,
  sogKn: 0,
  gpsKn: null,
  trackKn: null,
  valid: false,
  cogDeg: 0,
  accM: null,
  t: 0,
};

const BOOT_ENGINE: EngineSnapshot = {
  mode: "live",
  capturing: true,
  fix: BOOT_FIX,
  attitude: null,
  wave: {
    heaveM: 0,
    hsM: 0,
    amplitudeM: 0,
    periodS: 0,
    perMin: 0,
    samples: 0,
    windowS: 0,
    trusted: true,
  },
  hz: 0,
  simNm: 0,
  lastHourKey: 0,
  permission: "unknown",
};

const Ctx = createContext<BridgeCtx>({
  engine: null,
  meteo: null,
  meteoError: null,
  meteoLoading: false,
});

export function useLiveBridge() {
  return useContext(Ctx);
}

export function BridgeProvider({ children }: { children: ReactNode }) {
  const route = useSettings((s) => s.route);
  const [engine, setEngine] = useState<EngineSnapshot | null>(BOOT_ENGINE);
  const [meteo, setMeteo] = useState<MeteoBundle | null>(null);
  const [meteoError, setMeteoError] = useState<string | null>(null);
  const [meteoLoading, setMeteoLoading] = useState(false);

  useEffect(() => {
    if (route) sensorEngine.setRoute(route);
    if (!sensorEngine.capturing) void sensorEngine.start("live");
    const push = () => setEngine(sensorEngine.snapshot());
    const unsub = sensorEngine.on(push);
    push();
    const poll = window.setInterval(push, 200);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, [route]);

  const fixBucket = engine?.fix
    ? `${Math.round(engine.fix.lat * 8) / 8}_${Math.round(engine.fix.lon * 8) / 8}`
    : "boot";

  useEffect(() => {
    let cancelled = false;
    const { lat, lon } = preferredLatLon();
    const stations = route
      ? sampleRouteStations(route.points).map((s) => ({
          ...s,
          label: withCity(s.lat, s.lon, s.label),
        }))
      : [];
    setMeteoLoading(true);
    setMeteoError(null);
    fetchMeteo(lat, lon, stations)
      .then((bundle) => {
        if (cancelled) return;
        setMeteo(bundle);
        // Simulação de heave só para o preview sem IMU — o mar ao vivo continua no casco.
        sensorEngine.setSea(bundle.now.waveHs ?? 1.1, bundle.now.wavePeriod ?? 7.5);
        useSettings.getState().seedForecastHours(
          bundle.hourly.map((h) => ({
            t: hourKey(h.t),
            hsObs: null,
            periodObs: null,
            ampObs: null,
            hsForecast: h.waveHs,
            periodForecast: h.wavePeriod,
            ampForecast: h.waveHs != null ? amplitudeFromHs(h.waveHs) : null,
            dirForecast: h.waveDir,
            swellForecast: h.swellHs,
          })),
        );
      })
      .catch(() => {
        if (cancelled) return;
        const bundle = syntheticMeteo(lat, lon, Date.now(), stations);
        setMeteo(bundle);
        sensorEngine.setSea(bundle.now.waveHs ?? 1.1, bundle.now.wavePeriod ?? 7.5);
        setMeteoError("Open-Meteo indisponível — vento e corrente locais.");
      })
      .finally(() => {
        if (!cancelled) setMeteoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fixBucket, route?.source]);

  const lastHour = useRef(0);

  useEffect(() => {
    if (!engine?.capturing || engine.wave.samples < 80) return;
    const key = hourKey(Date.now());
    if (key === lastHour.current) return;
    lastHour.current = key;
    recordObservedHour(engine.wave);
  }, [engine?.capturing, engine?.wave.samples, engine?.wave.hsM]);

  const value = useMemo(
    () => ({ engine, meteo, meteoError, meteoLoading }),
    [engine, meteo, meteoError, meteoLoading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
