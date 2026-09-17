import type { ReactNode } from "react";
import { Anchor, Gauge, MapPinned, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProaMark } from "@/components/mark";

export function Onboarding({
  onSample,
  onImport,
  onSkip,
}: {
  onSample: () => void;
  onImport: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="flex items-center gap-3 text-accent">
        <ProaMark className="size-9" />
        <span className="font-display text-3xl italic text-fg">Proa</span>
      </div>
      <h1 className="mt-8 font-display text-4xl leading-[1.1] tracking-[-0.03em] text-fg">
        Painel de bordo para o rebocador.
      </h1>
      <p className="mt-4 text-base text-muted">
        O aparelho no passadiço lê movimento e posição. O Open-Meteo entra com
        vento e mar. A cada hora o painel fecha altura, amplitude e período —
        e devolve a faixa de RPM ideal de viagem.
      </p>

      <ol className="mt-8 space-y-4">
        <Step
          icon={<MapPinned className="size-4" />}
          title="1. Importe o GPX"
          body="A derrota do reboque. Sem isso o app não sabe o rumo nem o que falta."
        />
        <Step
          icon={<Gauge className="size-4" />}
          title="2. Informe o RPM atual"
          body="O regime do motor neste momento. A faixa ideal se desenha em volta dele."
        />
        <Step
          icon={<Waves className="size-4" />}
          title="Sensores e meteorologia"
          body="Acelerômetro, giroscópio e GPS do aparelho, cruzados com a API marinha."
        />
        <Step
          icon={<Anchor className="size-4" />}
          title="Simulação neste preview"
          body="No desktop os sensores não existem — use a derrota de exemplo e o modo simulação."
        />
      </ol>

      <div className="mt-10 flex flex-col gap-3">
        <Button onClick={onSample} size="lg">
          Carregar derrota de exemplo — Mucuripe → Pecém
        </Button>
        <Button onClick={onImport} variant="outline" size="lg">
          Importar meu GPX
        </Button>
        <Button onClick={onSkip} variant="ghost">
          Entrar no painel
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
