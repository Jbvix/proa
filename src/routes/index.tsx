import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Onboarding } from "@/components/onboarding";
import { Shell } from "@/components/shell";
import { BridgeProvider, useLiveBridge } from "@/components/bridge-provider";
import { PainelScreen } from "@/components/screens/painel";
import { OndasScreen } from "@/components/screens/ondas";
import { RotaScreen } from "@/components/screens/rota";
import { RpmScreen } from "@/components/screens/rpm";
import { parseGpxFile } from "@/lib/gpx";
import { loadSampleRoute } from "@/lib/sample-route";
import { sensorEngine } from "@/lib/sensor-engine";
import { useBridge, useSettings } from "@/lib/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <BridgeProvider>
      <App />
    </BridgeProvider>
  );
}

function App() {
  const route = useSettings((s) => s.route);
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const setRoute = useSettings((s) => s.setRoute);
  const tab = useBridge((s) => s.tab);
  const { engine } = useLiveBridge();
  const fileRef = useRef<HTMLInputElement>(null);
  const [gpxError, setGpxError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = await parseGpxFile(file);
      setRoute(parsed);
      sensorEngine.setRoute(parsed);
      setOnboarded(true);
      setGpxError(null);
    } catch (err) {
      setGpxError(err instanceof Error ? err.message : "GPX inválido");
    }
  }

  if (!route) {
    return (
      <>
        <input
          ref={fileRef}
          type="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Onboarding
          error={gpxError}
          onImport={() => fileRef.current?.click()}
          onDemo={() => {
            const sample = loadSampleRoute();
            setRoute(sample);
            sensorEngine.setRoute(sample);
            setOnboarded(true);
            setGpxError(null);
          }}
        />
      </>
    );
  }

  const modeLabel =
    engine?.mode === "live"
      ? "Sensores do aparelho"
      : engine?.mode === "sim"
        ? "Simulação de bordo"
        : "Captura parada";

  return (
    <Shell
      capturing={!!engine?.capturing}
      modeLabel={modeLabel}
      onToggleCapture={() => {
        if (sensorEngine.capturing) sensorEngine.stop();
        else void sensorEngine.start(sensorEngine.mode === "idle" ? "sim" : sensorEngine.mode);
      }}
      onLive={() => {
        void sensorEngine.start("live");
      }}
    >
      {tab === "painel" ? <PainelScreen /> : null}
      {tab === "ondas" ? <OndasScreen /> : null}
      {tab === "rota" ? <RotaScreen /> : null}
      {tab === "rpm" ? <RpmScreen /> : null}
    </Shell>
  );
}
