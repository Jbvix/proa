import { useRef, useState } from "react";
import { RoutePlot } from "@/components/route-plot";
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
      <div>
        <h1 className="font-display text-3xl tracking-[-0.03em]">Derrota</h1>
        <p className="mt-1 text-sm text-muted">
          A viagem entra por arquivo GPX. Troque o arquivo quando mudar a derrota.
        </p>
      </div>

      <Card className="rounded-2xl p-4">
        <RoutePlot
          route={route}
          lat={engine?.fix?.lat}
          lon={engine?.fix?.lon}
          cog={engine?.fix?.cogDeg}
          stations={meteo?.alongRoute}
          className="h-64 md:h-80"
        />
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="rounded-2xl p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Arquivo
          </p>
          <p className="mt-2 truncate text-lg text-fg">
            {route?.source ?? route?.name ?? "—"}
          </p>
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
        </Card>
      ) : null}

      {error ? (
        <p className="rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

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

      <Button className="w-full" size="lg" onClick={() => inputRef.current?.click()}>
        {route ? "Trocar arquivo GPX" : "Importar arquivo GPX"}
      </Button>
    </div>
  );
}
