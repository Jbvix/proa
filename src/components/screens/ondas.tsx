import { WaveChart } from "@/components/wave-chart";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { cardinal, formatHour, hourKey, pad3 } from "@/lib/utils";
import { amplitudeFromHs, blendHs, seaStateFromHs, type HourlyWave } from "@/lib/waves";
import { useLiveBridge } from "@/components/bridge-provider";
import { useSettings } from "@/lib/store";

export function OndasScreen() {
  const stored = useSettings((s) => s.hourly);
  const { engine, meteo } = useLiveBridge();
  const obsHs = engine?.wave.hsM ?? 0;
  const hs = blendHs(obsHs > 0.05 ? obsHs : null, meteo?.now.waveHs ?? null);
  const sea = seaStateFromHs(hs);
  const now = Date.now();
  const hourly = mergeHours(meteo, stored);
  const upcoming = hourly.filter((h) => h.t >= now - 3_600_000).slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-[-0.03em]">Mar</h1>
          <p className="mt-1 text-sm text-muted">
            Atualização horária · casco + Open-Meteo Marine
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
          <Stat label="Hs combinado" value={hs.toFixed(2)} unit="m" />
        </Card>
        <Card className="rounded-2xl">
          <Stat label="Amplitude" value={(hs / 2).toFixed(2)} unit="m" />
        </Card>
        <Card className="rounded-2xl">
          <Stat
            label="Swell"
            value={meteo?.now.swellHs != null ? meteo.now.swellHs.toFixed(2) : "—"}
            unit="m"
            hint={
              meteo?.now.swellPeriod
                ? `${meteo.now.swellPeriod.toFixed(0)} s`
                : undefined
            }
          />
        </Card>
        <Card className="rounded-2xl">
          <Stat
            label="SST"
            value={meteo?.now.sstC != null ? meteo.now.sstC.toFixed(1) : "—"}
            unit="°C"
          />
        </Card>
      </div>

      <Card className="rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between">
          <CardTitle>Altura significativa / hora</CardTitle>
          <span className="text-[11px] uppercase tracking-[0.12em] text-subtle">
            aço = observado · fundo = previsão
          </span>
        </div>
        <WaveChart rows={hourly} />
      </Card>

      <Card className="rounded-2xl p-0 overflow-hidden">
        <div className="px-4 pt-4">
          <CardTitle>Registro horário</CardTitle>
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
                <th className="px-4 py-2 font-medium">Dir</th>
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
        <CardTitle>Como o Hs de bordo é medido</CardTitle>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          O acelerômetro do aparelho é projetado no eixo vertical, filtrado e
          integrado duas vezes (heave). A altura significativa é{" "}
          <span className="font-mono text-fg">Hs = 4 σ</span> na janela de até
          20 min; a amplitude é Hs/2; o período vem dos cruzamentos por zero.
          A cada hora esse bloco é gravado ao lado da previsão marinha.
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
