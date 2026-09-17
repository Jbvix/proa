import { RpmBand } from "@/components/rpm-band";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { recommendRpm } from "@/lib/rpm";
import { blendHs } from "@/lib/waves";
import { useLiveBridge } from "@/components/bridge-provider";
import { useSettings } from "@/lib/store";
import { clamp } from "@/lib/utils";

export function RpmScreen() {
  const rpm = useSettings((s) => s.rpm);
  const setRpm = useSettings((s) => s.setRpm);
  const profile = useSettings((s) => s.profile);
  const setProfile = useSettings((s) => s.setProfile);
  const { engine, meteo } = useLiveBridge();

  const hs = blendHs(
    (engine?.wave.hsM ?? 0) > 0.05 ? engine!.wave.hsM : null,
    meteo?.now.waveHs ?? null,
  );
  const period = engine?.wave.periodS || meteo?.now.wavePeriod || 0;
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl tracking-[-0.03em]">RPM</h1>
        <p className="mt-1 text-sm text-muted">
          Informe o regime atual. A faixa de viagem reage ao mar e ao vento.
        </p>
      </div>

      <Card className="rounded-2xl p-4 md:p-5">
        <RpmBand rpm={rpm} advice={advice} max={profile.max} />
        <div className="mt-6">
          <Label htmlFor="rpm">RPM atual</Label>
          <div className="mt-2 flex items-center gap-3">
            <Slider
              id="rpm"
              min={profile.idle}
              max={profile.max}
              step={10}
              value={[rpm]}
              onValueChange={(v) => setRpm(v[0] ?? rpm)}
            />
            <Input
              className="w-24 font-mono tabular"
              inputMode="numeric"
              value={rpm}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setRpm(clamp(n, 0, profile.max));
              }}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRpm(advice.center)}
          >
            Ir para o centro da faixa
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRpm(profile.cruise)}
          >
            Cruzeiro do perfil
          </Button>
        </div>
      </Card>

      <Card className="rounded-2xl p-4">
        <CardTitle>Perfil do motor</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Padrão de rebocador de porto (~1600 rpm máx.). Ajuste se o seu for outro.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Field
            label="Marcha lenta"
            value={profile.idle}
            onChange={(n) => setProfile({ idle: n })}
          />
          <Field
            label="Cruzeiro"
            value={profile.cruise}
            onChange={(n) => setProfile({ cruise: n })}
          />
          <Field
            label="Máximo"
            value={profile.max}
            onChange={(n) => setProfile({ max: n })}
          />
        </div>
      </Card>

      <Card className="rounded-2xl p-4">
        <CardTitle>Por que esta faixa</CardTitle>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            Mar: −{advice.seaPenalty} rpm (Hs {hs.toFixed(1)} m
            {period ? `, Tz ${period.toFixed(0)} s` : ""})
          </li>
          <li>Vento: −{advice.windPenalty} rpm</li>
          <li>
            Encontro com a onda: {advice.encounterPenalty >= 0 ? "−" : "+"}
            {Math.abs(advice.encounterPenalty)} rpm
          </li>
        </ul>
        <p className="mt-3 text-sm text-subtle">
          Mar de proa e período curto pedem menos RPM para reduzir slamming.
          Mar de popa devolve um pouco de regime. Não substitui o julgamento
          do mestre.
        </p>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <Input
        className="mt-1.5 font-mono tabular"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}
