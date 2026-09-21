/**
 * Proa · TugLife Systems — Aba Rota
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.18.0
 * @data     2026-09-21 12:00 UTC  (ano 2026)
 *
 * MODIFICAÇÕES NA 1.18.0 (P15, item 15.2)
 *  - Cada waypoint ganha uma linha de CLIMATOLOGIA do mês (vento predominante,
 *    força, corrente), ao lado da previsão da Open-Meteo que já havia. É a
 *    pergunta que o passadiço faz de cabeça — "esta semana está fora do
 *    normal?" — respondida com o atlas da DHN, rotulado como climatologia.
 *  - Cabeçalho de módulo adicionado; o arquivo não tinha.
 * ---------------------------------------------------------------------------
 */
import { useRef, useState } from "react";
import { NauticalMap } from "@/components/nautical-map";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { parseGpxFile } from "@/lib/gpx";
import { loadSampleRoute } from "@/lib/sample-route";
import { sensorEngine } from "@/lib/sensor-engine";
import { useLiveBridge } from "@/components/bridge-provider";
import { useSettings } from "@/lib/store";
import { passageOf, speedHint } from "@/lib/passage";
import { routeMapMarks } from "@/lib/places";
import { coastFix } from "@/lib/coastline";
import { phaseLabel, planFloodArrival } from "@/lib/tide";
import { formatEtaClock, formatDurationMin, formatLatLon } from "@/lib/utils";
import { atlasSummary, octantName, toward } from "@/lib/atlas";

export function RotaScreen() {
  const inputRef = useRef<HTMLInputElement>(null);
  const route = useSettings((s) => s.route);
  const setRoute = useSettings((s) => s.setRoute);
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const { engine, meteo } = useLiveBridge();
  const [error, setError] = useState<string | null>(null);
  const passage = passageOf(route, engine);
  const plan = planFloodArrival(
    meteo?.tideHours ?? [],
    passage?.etaMs ?? null,
    passage?.remainNm ?? 0,
    passage?.sogKn ?? 0,
    9.2,
  );

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = await parseGpxFile(file);
      setRoute(parsed);
      sensorEngine.setRoute(parsed);
      setOnboarded(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GPX inválido");
    }
  }

  const etaLabel =
    passage?.etaMs != null
      ? `${formatEtaClock(passage.etaMs)} (${formatDurationMin(passage.etaMin ?? 0)})`
      : null;
  const tideLabel = plan.atEta
    ? `${phaseLabel(plan.atEta.phase)} ${plan.atEta.seaM.toFixed(2)} m`
    : null;
  const marks = routeMapMarks(route, meteo?.alongRoute);
  // Climatologia do mês por marca (atlas DHN). ~15 marcas × ~150 itens: barato.
  const mesNum = new Date().getMonth() + 1;
  const climaDe = (lat: number, lon: number) => {
    const s = atlasSummary(lat, lon, mesNum);
    const v = s.rosa?.[0];
    const vento = v ? `${octantName(v.oct)} ${Math.round(v.pct)} %${v.bf != null ? ` F${v.bf}` : ""}` : null;
    const corr = s.corrente
      ? `corr. ${s.corrente.kn != null ? `${s.corrente.kn.toFixed(1)} nós ` : ""}→ ${toward(s.corrente.dir)}`
      : null;
    return { mes: s.mes, linha: [vento, corr].filter(Boolean).join(" · ") || null };
  };
  const coast = engine?.fix ? coastFix(engine.fix.lat, engine.fix.lon) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl tracking-[-0.03em]">Derrota</h1>
          <p className="mt-1 text-sm text-muted">
            Posição do rebocador no mapa, ETA e maré de chegada.
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
          {!route ? (
            <Button
              className="w-full sm:w-auto"
              size="lg"
              variant="ghost"
              onClick={() => {
                const sample = loadSampleRoute();
                setRoute(sample);
                sensorEngine.setRoute(sample);
                setOnboarded(true);
              }}
            >
              Derrota demo
            </Button>
          ) : null}
          <Button
            className="w-full sm:w-auto"
            size="lg"
            onClick={() => inputRef.current?.click()}
          >
            {route ? "Trocar GPX" : "Importar GPX"}
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {error ? (
        <p className="rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      <Card className="overflow-hidden rounded-2xl p-0">
        <NauticalMap
          route={route}
          lat={engine?.fix?.lat}
          lon={engine?.fix?.lon}
          cog={engine?.fix?.cogDeg}
          sogKn={passage?.sogKn ?? engine?.fix?.sogKn}
          speedValid={passage?.valid}
          perMin={engine?.wave.perMin}
          etaLabel={etaLabel}
          tideLabel={tideLabel}
          coastLabel={coast?.label ?? null}
          stations={meteo?.alongRoute}
          className="h-72 w-full md:h-[28rem]"
        />
      </Card>

      {marks.length ? (
        <Card className="rounded-2xl p-4">
          <CardTitle>Waypoints e cidades</CardTitle>
          <ul className="mt-3 space-y-2">
            {marks.map((m) => {
              const clima = climaDe(m.lat, m.lon);
              return (
                <li key={`${m.kind}-${m.lat.toFixed(4)}-${m.lon.toFixed(4)}`} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-fg">{m.title}</span>
                    <span className="shrink-0 font-mono text-xs tabular text-subtle">
                      {m.lat.toFixed(3)}° {m.lon.toFixed(3)}°
                    </span>
                  </div>
                  {clima.linha ? (
                    <p className="mt-0.5 text-xs text-subtle">clima de {clima.mes}: {clima.linha}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-subtle">
            clima = Atlas de Cartas Piloto (DHN), médias de 1985–2013 em células de 300 milhas —
            climatologia, não previsão. A previsão é a da Open-Meteo, no mapa.
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="rounded-2xl">
          <Stat
            label="Velocidade"
            value={(passage?.sogKn ?? engine?.fix?.sogKn)?.toFixed(1) ?? "—"}
            unit="nós"
            hint={passage ? speedHint(passage) : engine?.fix?.valid ? "GPS" : "SOG"}
          />
        </Card>
        <Card className="rounded-2xl">
          <Stat
            label="ETA"
            value={passage?.etaMs != null ? formatEtaClock(passage.etaMs) : "—"}
            hint={
              passage?.etaMin != null
                ? `${formatDurationMin(passage.etaMin)} · falta ${passage.remainNm.toFixed(1)} mn`
                : "precisa de SOG"
            }
          />
        </Card>
        <Card className="rounded-2xl">
          <Stat
            label="Maré na chegada"
            value={plan.atEta ? phaseLabel(plan.atEta.phase) : "—"}
            hint={
              plan.atEta ? `${plan.atEta.seaM >= 0 ? "+" : ""}${plan.atEta.seaM.toFixed(2)} m MSL` : undefined
            }
          />
        </Card>
        <Card className="rounded-2xl">
          <Stat
            label="ETA enchente"
            value={
              plan.idealEtaMs != null ? formatEtaClock(plan.idealEtaMs) : "—"
            }
            hint={
              plan.targetKn != null
                ? `${plan.targetKn.toFixed(1)} nós para a janela`
                : "sem janela"
            }
          />
        </Card>
      </div>

      <Card className="rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Aproveitamento de enchente</CardTitle>
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
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">{plan.advice}</p>
        {plan.window ? (
          <p className="mt-2 font-mono text-xs tabular text-subtle">
            Enchente {formatEtaClock(plan.window.lowT)} → preá-mar{" "}
            {formatEtaClock(plan.window.highT)} · alvo{" "}
            {formatEtaClock(plan.window.idealT)}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-subtle">
          Nível do mar Open-Meteo (MSL, malha ~8 km) — estimativa, não substitui
          tábua de maré do porto.
        </p>
      </Card>

      {route?.points[0] ? (
        <Card className="rounded-2xl p-4">
          <CardTitle>{route.name}</CardTitle>
          <p className="mt-1 truncate text-sm text-muted">{route.source}</p>
          <p className="mt-3 font-mono text-sm tabular">
            Origem {formatLatLon(route.points[0].lat, route.points[0].lon)}
          </p>
          <p className="mt-1 font-mono text-sm tabular">
            Destino{" "}
            {formatLatLon(
              route.points[route.points.length - 1]!.lat,
              route.points[route.points.length - 1]!.lon,
            )}
          </p>
          {engine?.fix ? (
            <p className="mt-3 font-mono text-sm tabular text-accent">
              Rebocador {formatLatLon(engine.fix.lat, engine.fix.lon)} ·{" "}
              {engine.fix.sogKn.toFixed(1)} nós
              {passage?.valid ? " · validada" : ""}
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
