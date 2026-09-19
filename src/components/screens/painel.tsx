import { HeaveScope } from "@/components/heave-scope";
import { NauticalMap } from "@/components/nautical-map";
import { RpmBand } from "@/components/rpm-band";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { useLiveBridge } from "@/components/bridge-provider";
import { cardinal, formatDurationMin, formatEtaClock, formatLatLon, pad3 } from "@/lib/utils";
import { weatherLabel } from "@/lib/meteo";
import { recommendRpm } from "@/lib/rpm";
import { seaStateFromHs } from "@/lib/waves";
import { useSettings } from "@/lib/store";
import { nearestProgress, pathLengthNm, xteSideLabel } from "@/lib/geo";
import { coastFix } from "@/lib/coastline";
import { passageOf, speedHint } from "@/lib/passage";
import { phaseLabel, planFloodArrival } from "@/lib/tide";
import { ROLL_ON_DEG, XTE_ON_NM } from "@/lib/voice-watch";

export function PainelScreen() {
  const rpm = useSettings((s) => s.rpm);
  const profile = useSettings((s) => s.profile);
  const route = useSettings((s) => s.route);
  const { engine, meteo } = useLiveBridge();

  const hs = engine?.wave.hsM ?? 0;
  const period = engine?.wave.periodS ?? 0;
  const amp = engine?.wave.amplitudeM ?? hs / 2;
  const sea = seaStateFromHs(hs);
  const heading = engine?.fix?.cogDeg ?? engine?.attitude?.heading ?? null;
  const passage = passageOf(route, engine);
  const plan = planFloodArrival(
    meteo?.tideHours ?? [],
    passage?.etaMs ?? null,
    passage?.remainNm ?? 0,
    passage?.sogKn ?? 0,
    9.2,
  );
  const nextWp = (() => {
    const stations = meteo?.alongRoute ?? [];
    if (!stations.length) return stations[0] ?? null;
    const along =
      engine?.mode === "sim"
        ? engine.simNm
        : engine?.fix && route
          ? nearestProgress(route.points, engine.fix.lat, engine.fix.lon)
          : 0;
    return stations.find((s) => s.distNm >= along - 0.05) ?? stations[stations.length - 1]!;
  })();
  const advice = recommendRpm({
    profile,
    currentRpm: rpm,
    hsM: hs,
    periodS: period,
    windKn: meteo?.now.windKn ?? 0,
    headingDeg: heading,
    waveDirDeg: nextWp?.waveDir ?? meteo?.now.waveDir ?? null,
  });
  const coast = engine?.fix ? coastFix(engine.fix.lat, engine.fix.lon) : null;
  const rollP2P = engine?.rollP2P ?? 0;

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
        {meteo ? (
          <Badge tone={meteo.plano === "comercial" ? "ok" : "mute"}>
            {meteo.plano === "comercial" ? "Open-Meteo" : "Open-Meteo livre"}
          </Badge>
        ) : null}
        {plan.atEta ? (
          <Badge
            tone={
              plan.atEta.phase === "enchente" || plan.atEta.phase === "preamar"
                ? "ok"
                : "warn"
            }
          >
            {phaseLabel(plan.atEta.phase)}
          </Badge>
        ) : null}
        {passage && passage.xteNm >= XTE_ON_NM ? (
          <Badge tone="danger">
            XTE {passage.xteNm.toFixed(2)} nmi {passage.xteSide}
          </Badge>
        ) : null}
        {rollP2P >= ROLL_ON_DEG ? (
          <Badge tone="danger">Balanço {rollP2P.toFixed(0)}°</Badge>
        ) : null}
      </div>

      <Card className="overflow-hidden rounded-2xl p-0">
        <NauticalMap
          route={route}
          lat={engine?.fix?.lat}
          lon={engine?.fix?.lon}
          cog={engine?.fix?.cogDeg}
          sogKn={passage?.sogKn ?? engine?.fix?.sogKn}
          speedValid={passage?.valid ?? engine?.fix?.valid}
          perMin={engine?.wave.perMin}
          etaLabel={
            passage?.etaMs != null ? formatEtaClock(passage.etaMs) : null
          }
          tideLabel={plan.atEta ? phaseLabel(plan.atEta.phase) : null}
          coastLabel={coast?.label ?? null}
          stations={meteo?.alongRoute}
          className="h-56 w-full md:h-80"
        />
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="rounded-2xl p-4">
          <Stat
            label="Hs casco"
            value={hs.toFixed(2)}
            unit="m"
            hint={
              !engine?.wave.trusted
                ? "casco filtrado — aparelho mexido"
                : nextWp?.waveHs != null
                  ? `prev. ${nextWp.label} ${nextWp.waveHs.toFixed(2)} m`
                  : "sensores do aparelho"
            }
          />
        </Card>
        <Card className="rounded-2xl p-4">
          <Stat label="Amplitude" value={amp.toFixed(2)} unit="m" hint="Hs / 2 do casco" />
        </Card>
        <Card className="rounded-2xl p-4">
          <Stat
            label="Período Tz"
            value={period ? period.toFixed(1) : "—"}
            unit="s"
            hint={
              nextWp?.wavePeriod
                ? `prev. ${nextWp.wavePeriod.toFixed(1)} s`
                : "cruzamentos de zero"
            }
          />
        </Card>
        <Card className="rounded-2xl p-4">
          <Stat
            label="Ondas / min"
            value={engine?.wave.perMin ? engine.wave.perMin.toFixed(1) : "—"}
            hint="casco"
          />
        </Card>
        <Card className="rounded-2xl p-4">
          <Stat
            label="Velocidade"
            value={(passage?.sogKn ?? engine?.fix?.sogKn)?.toFixed(1) ?? "—"}
            unit="kn"
            hint={passage ? speedHint(passage) : engine?.fix?.valid ? "GPS" : "SOG"}
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
        <Card className="rounded-2xl p-4">
          <Stat
            label="Corrente"
            value={
              meteo?.now.currentKn != null ? meteo.now.currentKn.toFixed(1) : "—"
            }
            unit="kn"
            hint={
              meteo?.now.currentDir != null
                ? `${pad3(meteo.now.currentDir)}° ${cardinal(meteo.now.currentDir)}`
                : "Open-Meteo Marine"
            }
          />
        </Card>
        <Card className="rounded-2xl p-4">
          <Stat
            label="ETA"
            value={passage?.etaMs != null ? formatEtaClock(passage.etaMs) : "—"}
            hint={
              passage?.etaMin != null
                ? `${formatDurationMin(passage.etaMin)} · ${plan.atEta ? phaseLabel(plan.atEta.phase) : "maré?"}`
                : "precisa de SOG"
            }
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
          Mar ao vivo pelos sensores · janela{" "}
          {Math.round(engine?.wave.windowS ?? 0)} s
          {engine?.wave.trusted === false ? " · filtro anti-deriva" : ""}
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
          <p className="mt-1 text-sm text-muted">{coast?.phrase ?? "Costa —"}</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat
              label="SOG"
              value={(passage?.sogKn ?? engine?.fix?.sogKn)?.toFixed(1) ?? "—"}
              unit="kn"
              hint={passage ? speedHint(passage) : engine?.fix?.valid ? "GPS" : undefined}
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
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Extensão"
              value={route ? pathLengthNm(route.points).toFixed(1) : "—"}
              unit="nmi"
            />
            <Stat
              label="Falta"
              value={passage ? passage.remainNm.toFixed(1) : "—"}
              unit="nmi"
            />
            <Stat
              label="XTE"
              value={
                passage
                  ? passage.xteSide === "linha"
                    ? passage.xteNm.toFixed(2)
                    : `${passage.xteNm.toFixed(2)} ${passage.xteSide}`
                  : "—"
              }
              unit={passage ? "nmi" : undefined}
              hint={passage ? xteSideLabel(passage.xteSide) : "fora da derrota"}
            />
            <Stat
              label="Enchente"
              value={
                plan.idealEtaMs != null ? formatEtaClock(plan.idealEtaMs) : "—"
              }
              hint={
                plan.targetKn != null
                  ? `${plan.targetKn.toFixed(1)} kn`
                  : undefined
              }
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
