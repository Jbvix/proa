import { WaveChart } from "@/components/wave-chart";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { cardinal, formatHour, hourKey, pad3 } from "@/lib/utils";
import { amplitudeFromHs, seaStateFromHs, type HourlyWave } from "@/lib/waves";
import { useLiveBridge } from "@/components/bridge-provider";
import { useSettings } from "@/lib/store";

export function OndasScreen() {
  const stored = useSettings((s) => s.hourly);
  const { engine, meteo } = useLiveBridge();
  const hs = engine?.wave.hsM ?? 0;
  const period = engine?.wave.periodS ?? 0;
  const amp = engine?.wave.amplitudeM ?? hs / 2;
  const sea = seaStateFromHs(hs);
  const now = Date.now();
  const hourly = mergeHours(meteo, stored);
  const upcoming = hourly.filter((h) => h.t >= now - 3_600_000).slice(0, 12);
  const stations = meteo?.alongRoute ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-[-0.03em]">Mar</h1>
          <p className="mt-1 text-sm text-muted">
            Casco agora · previsão Open-Meteo nos waypoints do GPX
          </p>
        </div>
        <Badge
          tone={sea.code >= 4 ? "danger" : sea.code >= 3 ? "warn" : "accent"}
        >
          Douglas {sea.code} · {sea.label}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="rounded-2xl">
          <Stat label="Hs casco" value={hs.toFixed(2)} unit="m" hint="sensores" />
        </Card>
        <Card className="rounded-2xl">
          <Stat label="Amplitude" value={amp.toFixed(2)} unit="m" />
        </Card>
        <Card className="rounded-2xl">
          <Stat
            label="Tz casco"
            value={period ? period.toFixed(1) : "—"}
            unit="s"
          />
        </Card>
        <Card className="rounded-2xl">
          <Stat
            label="Ondas / min"
            value={engine?.wave.perMin ? engine.wave.perMin.toFixed(1) : "—"}
            hint="casco"
          />
        </Card>
      </div>

      <Card className="rounded-2xl p-0 overflow-hidden">
        <div className="px-4 pt-4">
          <CardTitle>Previsão marinha na derrota</CardTitle>
          <p className="mt-1 text-sm text-muted">
            Open-Meteo Marine em cada waypoint do GPX.
          </p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-subtle">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Waypoint</th>
                <th className="px-4 py-2 font-medium">Hs prev</th>
                <th className="px-4 py-2 font-medium">Tz</th>
                <th className="px-4 py-2 font-medium">Dir</th>
                <th className="px-4 py-2 font-medium">Swell</th>
                <th className="px-4 py-2 font-medium">Corrente</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular">
              {stations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    Importe o GPX para prever o mar ao longo da derrota.
                  </td>
                </tr>
              ) : (
                stations.map((s, i) => (
                  <tr key={`${s.lat}-${s.lon}-${i}`} className="border-b border-border/70">
                    <td className="px-4 py-2.5">{s.label}</td>
                    <td className="px-4 py-2.5">
                      {s.waveHs != null ? s.waveHs.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.wavePeriod != null ? s.wavePeriod.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.waveDir != null
                        ? `${pad3(s.waveDir)} ${cardinal(s.waveDir)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.swellHs != null ? s.swellHs.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.currentKn != null
                        ? `${s.currentKn.toFixed(1)} kn ${s.currentDir != null ? cardinal(s.currentDir) : ""}`
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between">
          <CardTitle>Série horária</CardTitle>
          <span className="text-[11px] uppercase tracking-[0.12em] text-subtle">
            aço = casco · fundo = previsão
          </span>
        </div>
        <WaveChart rows={hourly} />
      </Card>

      <Card className="rounded-2xl p-0 overflow-hidden">
        <div className="px-4 pt-4">
          <CardTitle>Registro horário do casco</CardTitle>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-subtle">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Hora</th>
                <th className="px-4 py-2 font-medium">Hs obs</th>
                <th className="px-4 py-2 font-medium">Hs prev</th>
                <th className="px-4 py-2 font-medium">Amp</th>
                <th className="px-4 py-2 font-medium">Tz</th>
                <th className="px-4 py-2 font-medium">Dir prev</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular">
              {upcoming.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    Sem série ainda — a captura preenche a cada hora.
                  </td>
                </tr>
              ) : (
                upcoming.map((row) => (
                  <tr key={row.t} className="border-b border-border/70">
                    <td className="px-4 py-2.5">{formatHour(row.t)}</td>
                    <td className="px-4 py-2.5">
                      {row.hsObs != null ? row.hsObs.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.hsForecast != null ? row.hsForecast.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {(row.ampObs ?? row.ampForecast)?.toFixed(2) ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {(row.periodObs ?? row.periodForecast)?.toFixed(1) ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.dirForecast != null
                        ? `${pad3(row.dirForecast)} ${cardinal(row.dirForecast)}`
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="rounded-2xl p-4">
        <CardTitle>De onde vem cada número</CardTitle>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Hs, amplitude e período ao vivo saem do acelerômetro ({`Hs = 4σ`} do
          heave). Vento e corrente vêm do Open-Meteo. A previsão de mar é lida
          na API Marine em cada waypoint da derrota GPX — não substitui o casco.
        </p>
      </Card>
    </div>
  );
}

function mergeHours(
  meteo: ReturnType<typeof useLiveBridge>["meteo"],
  stored: HourlyWave[],
): HourlyWave[] {
  const obs = new Map(stored.map((h) => [h.t, h]));
  if (!meteo?.hourly.length) return stored;
  return meteo.hourly.map((h) => {
    const t = hourKey(h.t);
    const prev = obs.get(t);
    return {
      t,
      hsObs: prev?.hsObs ?? null,
      periodObs: prev?.periodObs ?? null,
      ampObs: prev?.ampObs ?? null,
      hsForecast: h.waveHs,
      periodForecast: h.wavePeriod,
      ampForecast: h.waveHs != null ? amplitudeFromHs(h.waveHs) : null,
      dirForecast: h.waveDir,
      swellForecast: h.swellHs,
    };
  });
}
