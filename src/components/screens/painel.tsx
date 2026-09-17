import { HeaveScope } from "@/components/heave-scope";
import { RpmBand } from "@/components/rpm-band";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { useLiveBridge } from "@/components/bridge-provider";
import { cardinal, formatLatLon, pad3 } from "@/lib/utils";
import { weatherLabel } from "@/lib/meteo";
import { recommendRpm } from "@/lib/rpm";
import { blendHs, seaStateFromHs } from "@/lib/waves";
import { useSettings } from "@/lib/store";
import { alongTrack, pathLengthNm } from "@/lib/geo";

export function PainelScreen() {
  const rpm = useSettings((s) => s.rpm);
  const profile = useSettings((s) => s.profile);
  const route = useSettings((s) => s.route);
  const { engine, meteo } = useLiveBridge();

  const obsHs = engine?.wave.hsM ?? 0;
  const fcHs = meteo?.now.waveHs ?? null;
  const hs = blendHs(obsHs > 0.05 ? obsHs : null, fcHs);
  const period = engine?.wave.periodS || meteo?.now.wavePeriod || 0;
  const amp = hs / 2;
  const sea = seaStateFromHs(hs);
  const heading = engine?.fix?.cogDeg ?? engine?.attitude?.heading ?? null;
  const advice = recommendRpm({
    profile,
    currentRpm: rpm,
    hsM: hs,
    periodS: period,
    windKn: meteo?.now.windKn ?? 0,
    headingDeg: heading,
    waveDirDeg: meteo?.now.waveDir ?? null,
  });

  const remain = (() => {
    if (!route || !engine?.fix) return null;
    const along = engine.mode === "sim" ? engine.simNm : null;
    if (along != null) {
      const p = alongTrack(route.points, along);
      return p;
    }
    return null;
  })();

  const etaMin =
    remain && engine?.fix && engine.fix.sogKn > 0.4
      ? (remain.remainNm / engine.fix.sogKn) * 60
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={engine?.capturing ? "ok" : "mute"}>
          {engine?.mode === "live"
            ? "Sensores vivos"
            : engine?.mode === "sim"
              ? "Simulação"
              : "Parado"}
        </Badge>
        <Badge
          tone={sea.code >= 4 ? "danger" : sea.code >= 3 ? "warn" : "accent"}
        >
          {sea.label}
        </Badge>
        <Badge tone="mute">{weatherLabel(meteo?.now.weatherCode ?? null)}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="rounded-2xl p-4">
          <Stat
            label="Altura Hs"
            value={hs.toFixed(2)}
            unit="m"
            hint={fcHs != null ? `previsão ${fcHs.toFixed(2)} m` : "sem previsão"}
          />
        </Card>
        <Card className="rounded-2xl p-4">
          <Stat label="Amplitude" value={amp.toFixed(2)} unit="m" hint="Hs / 2" />
        </Card>
        <Card className="rounded-2xl p-4">
          <Stat
            label="Período"
            value={period ? period.toFixed(1) : "—"}
            unit="s"
            hint={
              meteo?.now.wavePeriod
                ? `Open-Meteo ${meteo.now.wavePeriod.toFixed(1)} s`
                : undefined
            }
          />
        </Card>
        <Card className="rounded-2xl p-4">
          <Stat
            label="Vento"
            value={(meteo?.now.windKn ?? 0).toFixed(0)}
            unit="kn"
            hint={`${pad3(meteo?.now.windDir ?? 0)}° ${cardinal(meteo?.now.windDir ?? 0)} · raj. ${(meteo?.now.gustKn ?? 0).toFixed(0)}`}
          />
        </Card>
      </div>

      <Card className="rounded-2xl p-4 md:p-5">
        <RpmBand rpm={rpm} advice={advice} max={profile.max} />
      </Card>

      <Card className="rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>Heave do casco</CardTitle>
          <span className="font-mono text-xs text-muted tabular">
            {(engine?.wave.heaveM ?? 0).toFixed(2)} m
            {engine?.hz ? ` · ${engine.hz.toFixed(0)} Hz` : ""}
          </span>
        </div>
        <HeaveScope />
        <p className="mt-2 text-xs text-subtle">
          Janela de{" "}
          {(engine?.wave.windowS ?? 0) >= 60
            ? `${Math.round((engine?.wave.windowS ?? 0) / 60)} min`
            : `${Math.round(engine?.wave.windowS ?? 0)} s`}{" "}
          · Hs observado {(engine?.wave.hsM ?? 0).toFixed(2)} m
        </p>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="rounded-2xl p-4">
          <CardTitle>Posição</CardTitle>
          <p className="mt-3 font-mono text-sm tabular text-fg">
            {engine?.fix
              ? formatLatLon(engine.fix.lat, engine.fix.lon)
              : "Sem fixo"}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat
              label="SOG"
              value={engine?.fix ? engine.fix.sogKn.toFixed(1) : "—"}
              unit="kn"
            />
            <Stat
              label="COG"
              value={engine?.fix ? pad3(engine.fix.cogDeg) : "—"}
              unit="°"
            />
            <Stat
              label="Rumo"
              value={heading != null ? cardinal(heading) : "—"}
            />
          </div>
        </Card>
        <Card className="rounded-2xl p-4">
          <CardTitle>Derrota</CardTitle>
          <p className="mt-3 text-sm text-fg">{route?.name ?? "Nenhum GPX"}</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat
              label="Extensão"
              value={route ? pathLengthNm(route.points).toFixed(1) : "—"}
              unit="nmi"
            />
            <Stat
              label="Falta"
              value={remain ? remain.remainNm.toFixed(1) : "—"}
              unit="nmi"
            />
            <Stat
              label="ETA"
              value={
                etaMin == null
                  ? "—"
                  : etaMin >= 60
                    ? `${Math.floor(etaMin / 60)}h${String(Math.round(etaMin % 60)).padStart(2, "0")}`
                    : `${Math.round(etaMin)}`
              }
              unit={etaMin != null && etaMin < 60 ? "min" : undefined}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
