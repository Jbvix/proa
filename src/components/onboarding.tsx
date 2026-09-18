import type { ReactNode } from "react";
import { Gauge, MapPinned, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProaMark } from "@/components/mark";
import { DeckTools } from "@/components/deck-tools";

export function Onboarding({
  onImport,
  onDemo,
  error,
}: {
  onImport: () => void;
  onDemo: () => void;
  error?: string | null;
}) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="flex items-center gap-3 text-accent">
        <ProaMark className="size-9" />
        <span className="font-display text-3xl italic text-fg">Proa</span>
        <div className="ml-auto flex items-center text-fg">
          <DeckTools />
        </div>
      </div>
      <h1 className="mt-8 font-display text-4xl leading-[1.1] tracking-[-0.03em] text-fg">
        A derrota entra por GPX.
      </h1>
      <p className="mt-4 text-base text-muted">
        Importe o arquivo da viagem. Sem o track o painel não tem rumo, distância
        nem o que falta até o destino. No passadiço, chama{" "}
        <span className="text-fg">Alana</span> pelo nome — ela escuta sem botão.
      </p>

      <ol className="mt-8 space-y-4">
        <Step
          icon={<MapPinned className="size-4" />}
          title="1. Arquivo GPX"
          body="Track (trkpt), rota (rtept) ou waypoints. Sai do ECDIS, TimeZero, OpenCPN, Navionics."
        />
        <Step
          icon={<Gauge className="size-4" />}
          title="2. RPM atual"
          body="Depois da derrota, informe o regime do motor. A faixa ideal se desenha em volta dele."
        />
        <Step
          icon={<Waves className="size-4" />}
          title="Sensores e Open-Meteo"
          body="O aparelho lê o mar no casco. Vento e corrente vêm da Open-Meteo; a previsão de onda segue os waypoints do GPX."
        />
      </ol>

      {error ? (
        <p className="mt-6 rounded-md bg-danger/15 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-10 flex flex-col gap-3">
        <Button onClick={onImport} size="lg">
          Importar arquivo GPX
        </Button>
        <Button onClick={onDemo} variant="ghost">
          Usar derrota de demonstração
        </Button>
      </div>
    </div>
  );
}

function Step({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="text-sm text-muted">{body}</p>
      </div>
    </li>
  );
}
