/**
 * Proa · TugLife Systems — Estado persistido do aparelho
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.15.0
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * MODIFICAÇÕES NA 1.15.0 (P14, item 14.2)
 *  - `alanaWakeWord` (padrão FALSO): microfone aberto com a conversa fechada,
 *    à espera do nome. Desligado, o microfone só abre em conversa.
 *
 * MODIFICAÇÕES NA 1.12.0 (P12, item 12.3)
 *  - `passageLog`: o diário de travessia, uma linha por hora cheia, até 14
 *    dias, PERSISTIDO (entra no `partialize`). `appendLog` e `clearLog`.
 *  - Achado durante a leitura: `hourly[]` (série de ondas das 48 h do
 *    gráfico) NUNCA esteve no `partialize` — recarregar o app zera a série.
 *    Não mudei isso aqui: é série de gráfico, não de registro, e o diário
 *    passa a ser o lugar do registro. Fica anotado no GDD.
 *  - Cabeçalho de módulo adicionado; o arquivo não tinha.
 * ---------------------------------------------------------------------------
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { hourKey } from "./utils";
import { SETTINGS_VERSION, migrateSettings } from "./settings-migrate";
import type { ParsedRoute } from "./gpx";
import { DEFAULT_HULL, DEFAULT_PROFILE, type EngineProfile, type HullProfile } from "./rpm";
import type { HourlyWave } from "./waves";
import { appendLogEntry, type LogEntry } from "./passage-log";
import { sensorEngine } from "./sensor-engine";
import { applyTheme, type ThemeId } from "./theme";
import type { VoiceCard } from "./voice-print";
import { isVoicePrint } from "./voice-print";

export type TabId = "painel" | "ondas" | "rota" | "rpm";

type SettingsState = {
  onboarded: boolean;
  theme: ThemeId;
  alanaMuted: boolean;
  alanaPtt: boolean;
  /** Escuta pelo nome com a conversa fechada. Padrão falso: o áudio subiria pro transcritor o tempo todo. */
  alanaWakeWord: boolean;
  crewNames: string[];
  crewVoices: VoiceCard[];
  rpm: number;
  profile: EngineProfile;
  hull: HullProfile;
  route: ParsedRoute | null;
  hourly: HourlyWave[];
  /** Diário de travessia: uma linha por hora cheia, mais recente por último. */
  passageLog: LogEntry[];
  setOnboarded: (v: boolean) => void;
  setTheme: (t: ThemeId) => void;
  setAlanaMuted: (v: boolean) => void;
  setAlanaPtt: (v: boolean) => void;
  setAlanaWakeWord: (v: boolean) => void;
  setCrewNames: (n: string[]) => void;
  setCrewVoices: (v: VoiceCard[]) => void;
  setRpm: (n: number) => void;
  setProfile: (p: Partial<EngineProfile>) => void;
  setHull: (h: Partial<HullProfile>) => void;
  setRoute: (r: ParsedRoute | null) => void;
  upsertHour: (row: HourlyWave) => void;
  seedForecastHours: (rows: HourlyWave[]) => void;
  appendLog: (entry: LogEntry) => void;
  clearLog: () => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      onboarded: false,
      theme: "night",
      alanaMuted: false,
      alanaPtt: false,
      alanaWakeWord: false,
      crewNames: [],
      crewVoices: [],
      rpm: 920,
      profile: DEFAULT_PROFILE,
      hull: DEFAULT_HULL,
      route: null,
      hourly: [],
      passageLog: [],
      setOnboarded: (v) => set({ onboarded: v }),
      setTheme: (t) => {
        applyTheme(t);
        set({ theme: t });
      },
      setAlanaMuted: (v) => set({ alanaMuted: v }),
      setAlanaPtt: (v) => set({ alanaPtt: v }),
      setAlanaWakeWord: (v) => set({ alanaWakeWord: v }),
      setCrewNames: (n) => set({ crewNames: n.slice(0, 6) }),
      setCrewVoices: (v) => set({ crewVoices: v.slice(-6) }),
      setRpm: (n) => set({ rpm: n }),
      setProfile: (p) => set({ profile: { ...get().profile, ...p } }),
      setHull: (h) => set({ hull: { ...get().hull, ...h } }),
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
      // A regra (uma por hora, 14 dias) é de `appendLogEntry`, pura e testada.
      appendLog: (entry) => set({ passageLog: appendLogEntry(get().passageLog, entry) }),
      clearLog: () => set({ passageLog: [] }),
    }),
    {
      name: "proa-settings",
      // Subir a versão faz o zustand rodar `migrate` E regravar o blob na hora.
      // Sem isso, o que uma versão antiga gravou fica no aparelho até alguém
      // mexer numa configuração — o que num tablet de passadiço pode ser nunca.
      version: SETTINGS_VERSION,
      migrate: (guardado, versao) => migrateSettings(guardado, versao) as SettingsState,
      partialize: (s) => ({
        onboarded: s.onboarded,
        theme: s.theme,
        alanaMuted: s.alanaMuted,
        alanaPtt: s.alanaPtt,
        alanaWakeWord: s.alanaWakeWord,
        crewNames: s.crewNames,
        crewVoices: s.crewVoices,
        rpm: s.rpm,
        profile: s.profile,
        hull: s.hull,
        route: s.route,
        passageLog: s.passageLog,
      }),
      onRehydrateStorage: () => (state) => {
        const t = state?.theme === "day" ? "day" : "night";
        if (state) state.theme = t;
        applyTheme(t);
        if (state?.route && !Array.isArray(state.route.waypoints)) {
          state.route.waypoints = [];
        }
        if (!Array.isArray(state?.crewNames) && state) state.crewNames = [];
        // Diário de versão anterior à 1.12.0 não existe; blob sujo vira vazio.
        if (state && !Array.isArray(state.passageLog)) state.passageLog = [];
        // Casco veio de versão anterior a 1.6.0, ou com número sujo: volta ao
        // padrão. Boca zero ou negativa faria a raiz da STAWAVE-1 explodir.
        if (state) {
          const h = state.hull as Partial<HullProfile> | undefined;
          const boca = Number(h?.beamM);
          const proa = Number(h?.bowLengthM);
          state.hull = {
            beamM: boca > 0 ? boca : DEFAULT_HULL.beamM,
            bowLengthM: proa > 0 ? proa : DEFAULT_HULL.bowLengthM,
          };
        }
        if (state) {
          const voices = Array.isArray((state as { crewVoices?: VoiceCard[] }).crewVoices)
            ? (state as { crewVoices: VoiceCard[] }).crewVoices
            : [];
          state.crewVoices = voices
            .map((c) => ({
              name: String(c?.name ?? "").trim(),
              print: isVoicePrint(c?.print) ? c.print : [],
              enrolledMs: Number(c?.enrolledMs) || 0,
            }))
            .filter((c) => c.name && c.print.length);
        }
      },
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
