/**
 * Proa · TugLife Systems — Aba RPM
 * ---------------------------------------------------------------------------
 * @autor    Jossian Brito
 * @versao   1.14.0
 * @data     2026-09-20 12:00 UTC  (ano 2026)
 *
 * MODIFICAÇÕES NA 1.14.0 (P13, item 13.1)
 *  - Cartão "Tripulação": os nomes que a Lara conhece, com apagar em cada
 *    um (leva a impressão vocal junto). Não havia como tirar um nome do
 *    aparelho sem limpar os dados do site inteiro.
 *
 * MODIFICAÇÕES NA 1.12.0 (P12, item 12.3)
 *  - Cartão "Diário de travessia": quantas horas gravadas, a última, e os
 *    botões Compartilhar/Baixar CSV e Limpar. Fica nesta aba, e não na Rota,
 *    porque o diário existe para calibrar o casco (P8b) — é o dado que
 *    alimenta a faixa de RPM mostrada logo acima.
 *  - Cabeçalho de módulo adicionado; o arquivo não tinha.
 * ---------------------------------------------------------------------------
 */
import { RpmBand } from "@/components/rpm-band";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { recommendRpm } from "@/lib/rpm";
import { useLiveBridge } from "@/components/bridge-provider";
import { useSettings } from "@/lib/store";
import { clamp, formatHour } from "@/lib/utils";
import { LOG_MAX, csvFilename, logToCsv } from "@/lib/passage-log";
import { dropCrew } from "@/lib/crew";

export function RpmScreen() {
  const rpm = useSettings((s) => s.rpm);
  const setRpm = useSettings((s) => s.setRpm);
  const profile = useSettings((s) => s.profile);
  const setProfile = useSettings((s) => s.setProfile);
  const hull = useSettings((s) => s.hull);
  const setHull = useSettings((s) => s.setHull);
  const passageLog = useSettings((s) => s.passageLog);
  const clearLog = useSettings((s) => s.clearLog);
  const crewNames = useSettings((s) => s.crewNames);
  const crewVoices = useSettings((s) => s.crewVoices);
  const setCrewNames = useSettings((s) => s.setCrewNames);
  const setCrewVoices = useSettings((s) => s.setCrewVoices);
  const { engine, meteo } = useLiveBridge();

  const hs = engine?.wave.hsM ?? 0;
  const period = engine?.wave.periodS ?? 0;
  const heading = engine?.fix?.cogDeg ?? engine?.attitude?.heading ?? null;
  const advice = recommendRpm({
    profile,
    hull,
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
          Informe o regime atual. A faixa usa o mar do casco e o vento da Open-Meteo.
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
        <CardTitle>Casco</CardTitle>
        <p className="mt-2 text-sm text-muted">
          A resistência que a onda adiciona depende da boca e de quão curta é a
          proa na linha d&apos;água. Meça no plano de linhas; padrão de
          rebocador de porto de ~30 m.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field
            label="Boca (m)"
            value={hull.beamM}
            onChange={(n) => setHull({ beamM: n })}
          />
          <Field
            label="Proa na LWL (m)"
            value={hull.bowLengthM}
            onChange={(n) => setHull({ bowLengthM: n })}
          />
        </div>
      </Card>

      <Card className="rounded-2xl p-4">
        <CardTitle>Tripulação</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Os nomes pelos quais a Lara chama. Ela pergunta o nome uma vez por
          sessão e só grava depois de você confirmar. Apagar leva a voz junto.
        </p>
        {crewNames.length === 0 ? (
          <p className="mt-3 text-sm text-subtle">Nenhum nome gravado.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {crewNames.map((n) => (
              <li key={n} className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2">
                <span className="text-sm text-fg">
                  {n}
                  {crewVoices.some((v) => v.name.toLowerCase() === n.toLowerCase()) ? (
                    <span className="ml-2 text-[11px] uppercase tracking-[0.12em] text-subtle">voz</span>
                  ) : null}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Apagar ${n}`}
                  onClick={() => {
                    const r = dropCrew(crewNames, crewVoices, n);
                    setCrewNames(r.names);
                    setCrewVoices(r.voices);
                  }}
                >
                  Apagar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="rounded-2xl p-4">
        <CardTitle>Diário de travessia</CardTitle>
        <p className="mt-2 text-sm text-muted">
          A Lara grava uma linha por hora cheia: posição, SOG, Hs medido e
          previsto, vento, corrente, RPM e faixa. É o dado que calibra a
          resistência do casco. Fica só neste aparelho, até {LOG_MAX / 24} dias.
        </p>
        <p className="mt-3 font-mono text-sm tabular text-fg">
          {passageLog.length === 0
            ? "Nenhuma hora gravada ainda."
            : `${passageLog.length} ${passageLog.length === 1 ? "hora" : "horas"} · última ${formatHour(passageLog[passageLog.length - 1].t)}`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={passageLog.length === 0}
            onClick={() => void exportLog(logToCsv(passageLog))}
          >
            Compartilhar CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={passageLog.length === 0}
            onClick={() => {
              if (window.confirm("Apagar o diário deste aparelho? Exporte antes se precisar.")) clearLog();
            }}
          >
            Limpar
          </Button>
        </div>
      </Card>

      <Card className="rounded-2xl p-4">
        <CardTitle>Por que esta faixa</CardTitle>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            Mar do casco: −{advice.seaPenalty} rpm (Hs {hs.toFixed(1)} m
            {period ? `, Tz ${period.toFixed(0)} s` : ""})
          </li>
          <li>
            Resistência adicionada pela onda:{" "}
            <span className="text-fg">{advice.addedResistanceKn.toFixed(1)} kN</span>{" "}
            (STAWAVE-1, cresce com o quadrado do Hs)
          </li>
          <li>Vento: −{advice.windPenalty} rpm</li>
          <li>
            Encontro com a onda: {advice.encounterPenalty >= 0 ? "−" : "+"}
            {Math.abs(advice.encounterPenalty)} rpm
          </li>
        </ul>
        <p className="mt-3 text-sm text-subtle">
          Dobrar a altura da onda quadruplica a resistência — por isso a faixa
          cai rápido quando o mar cresce. Período curto pede menos RPM ainda,
          para reduzir slamming; mar de popa devolve um pouco de regime. Não
          substitui o julgamento do mestre.
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

/**
 * Entrega o CSV ao usuário. No Android, a folha de compartilhar (WhatsApp,
 * Drive, e-mail) é o caminho natural de um tablet de passadiço sem cabo;
 * onde não há Web Share com arquivo, cai no download comum.
 */
async function exportLog(csv: string) {
  const name = csvFilename(new Date());
  const file = new File([csv], name, { type: "text/csv" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Diário de travessia — Proa" });
      return;
    } catch {
      /* cancelou a folha: cai no download */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}
