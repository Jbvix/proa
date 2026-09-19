import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { BridgeProvider, useLiveBridge } from "@/components/bridge-provider";
import { PainelScreen } from "@/components/screens/painel";
import { OndasScreen } from "@/components/screens/ondas";
import { RotaScreen } from "@/components/screens/rota";
import { RpmScreen } from "@/components/screens/rpm";
import { sensorEngine } from "@/lib/sensor-engine";
import { useBridge } from "@/lib/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <BridgeProvider>
      <App />
    </BridgeProvider>
  );
}

function App() {
  const tab = useBridge((s) => s.tab);
  const { engine } = useLiveBridge();

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
        else void sensorEngine.start("live");
      }}
    >
      {tab === "painel" ? <PainelScreen /> : null}
      {tab === "ondas" ? <OndasScreen /> : null}
      {tab === "rota" ? <RotaScreen /> : null}
      {tab === "rpm" ? <RpmScreen /> : null}
    </Shell>
  );
}
