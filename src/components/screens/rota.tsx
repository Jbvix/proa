import { useRef } from "react";
import { RoutePlot } from "@/components/route-plot";
import { Stat } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { parseGpxFile } from "@/lib/gpx";
import { loadSampleRoute } from "@/lib/sample-route";
import { sensorEngine } from "@/lib/sensor-engine";
import { useLiveBridge } from "@/components/bridge-provider";
import { useSettings } from "@/lib/store";
import { pathLengthNm } from "@/lib/geo";
import { formatLatLon } from "@/lib/utils";

export function RotaScreen() {
  const inputRef = useRef<HTMLInputElement>(null);
  const route = useSettings((s) => s.route);
  const setRoute = useSettings((s) => s.setRoute);
  const { engine } = useLiveBridge();

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = await parseGpxFile(file);
      setRoute(parsed);
      sensorEngine.setRoute(parsed);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "GPX inválido");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl tracking-[-0.03em]">Derrota</h1>
        <p className="mt-1 text-sm text-muted">
          Importe o GPX da viagem. O painel segue o track com o GPS (ou simula).
        </p>
      </div>

      <Card className="rounded-2xl p-4">
        <RoutePlot
          route={route}
          lat={engine?.fix?.lat}
          lon={engine?.fix?.lon}
          cog={engine?.fix?.cogDeg}
          className="h-64 md:h-80"
        />
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="rounded-2xl p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            Nome
          </p>
          <p className="mt-2 truncate text-lg text-fg">{route?.name ?? "—"}</p>
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
          <CardTitle>Extremos</CardTitle>
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

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" onClick={() => inputRef.current?.click()}>
          Importar GPX
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          onClick={() => {
            const sample = loadSampleRoute();
            setRoute(sample);
            sensorEngine.setRoute(sample);
          }}
        >
          Exemplo Mucuripe → Pecém
        </Button>
      </div>
    </div>
  );
}
