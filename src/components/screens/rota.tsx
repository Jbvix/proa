import { useRef, useState } from "react";
import { NauticalMap } from "@/components/nautical-map";
import { Stat } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { parseGpxFile } from "@/lib/gpx";
import { sensorEngine } from "@/lib/sensor-engine";
import { useLiveBridge } from "@/components/bridge-provider";
import { useSettings } from "@/lib/store";
import { pathLengthNm } from "@/lib/geo";
import { formatLatLon } from "@/lib/utils";

export function RotaScreen() {
  const inputRef = useRef<HTMLInputElement>(null);
  const route = useSettings((s) => s.route);
  const setRoute = useSettings((s) => s.setRoute);
  const { engine, meteo } = useLiveBridge();
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = await parseGpxFile(file);
      setRoute(parsed);
      sensorEngine.setRoute(parsed);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GPX inválido");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl tracking-[-0.03em]">Derrota</h1>
          <p className="mt-1 text-sm text-muted">
            Mapa da viagem. A posição do rebocador segue o GPS (ou a simulação).
          </p>
        </div>
        <Button
          className="w-full shrink-0 sm:w-auto"
          size="lg"
          onClick={() => inputRef.current?.click()}
        >
          {route ? "Trocar GPX" : "Importar GPX"}
        </Button>
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
          sogKn={engine?.fix?.sogKn}
          perMin={engine?.wave.perMin}
          stations={meteo?.alongRoute}
          className="h-72 w-full md:h-[28rem]"
        />
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="rounded-2xl">
          <Stat
            label="Velocidade"
            value={engine?.fix ? engine.fix.sogKn.toFixed(1) : "—"}
            unit="kn"
            hint="SOG"
          />
        </Card>
        <Card className="rounded-2xl">
          <Stat
            label="Ondas / min"
            value={
              engine?.wave.perMin ? engine.wave.perMin.toFixed(1) : "—"
            }
            hint={
              engine?.wave.periodS
                ? `Tz ${engine.wave.periodS.toFixed(1)} s`
                : "casco"
            }
          />
        </Card>
        <Card className="rounded-2xl">
          <Stat
            label="Pontos"
            value={route ? String(route.points.length) : "—"}
          />
        </Card>
        <Card className="rounded-2xl">
          <Stat
            label="Distância"
            value={route ? pathLengthNm(route.points).toFixed(1) : "—"}
            unit="nmi"
          />
        </Card>
      </div>

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
              {engine.fix.sogKn.toFixed(1)} kn
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
