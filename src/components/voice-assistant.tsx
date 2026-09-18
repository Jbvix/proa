import { useEffect, useRef, useState } from "react";
import { Mic, X } from "lucide-react";
import { useLiveBridge } from "@/components/bridge-provider";
import { useBridge, useSettings } from "@/lib/store";
import { buildVoiceContext, type VoiceTurn } from "@/lib/voice-context";
import { cn } from "@/lib/utils";

type Recog = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getRecog(): Recog | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "pt-BR";
  rec.interimResults = true;
  rec.continuous = false;
  return rec;
}

export function VoiceButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label="Assistente de voz"
      title="Assistente de voz"
      onClick={onOpen}
      className="flex size-11 items-center justify-center rounded-md text-muted transition-[background-color,color] duration-150 hover:bg-surface-2 hover:text-fg"
    >
      <Mic className="size-5" />
    </button>
  );
}

export function VoiceSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { engine, meteo } = useLiveBridge();
  const route = useSettings((s) => s.route);
  const rpm = useSettings((s) => s.rpm);
  const profile = useSettings((s) => s.profile);
  const tab = useBridge((s) => s.tab);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [interim, setInterim] = useState("");
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recog | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const asking = useRef(false);

  useEffect(() => {
    if (!open) {
      recRef.current?.abort();
      audioRef.current?.pause();
      setListening(false);
    }
  }, [open]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || asking.current) return;
    asking.current = true;
    setBusy(true);
    setError(null);
    setInterim("");
    const history = turns.slice(-6);
    setTurns((t) => [...t, { role: "user", content: q }]);
    try {
      const ctx = buildVoiceContext({ engine, meteo, route, rpm, profile, tab });
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, context: ctx, history }),
        signal: AbortSignal.timeout(45_000),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        text?: string;
        audio?: string | null;
        error?: string;
      };
      if (!data.ok || !data.text) {
        setError(data.error ?? "Não rolou agora.");
        return;
      }
      setTurns((t) => [...t, { role: "assistant", content: data.text! }]);
      if (data.audio) {
        const bin = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bin], { type: "audio/mpeg" }));
        audioRef.current?.pause();
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        void audio.play().catch(() => {
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(data.text);
          u.lang = "pt-BR";
          speechSynthesis.speak(u);
        });
      } else {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(data.text);
        u.lang = "pt-BR";
        speechSynthesis.speak(u);
      }
    } catch {
      setError("Sem ligação com o assistente.");
    } finally {
      setBusy(false);
      asking.current = false;
    }
  }

  function listen() {
    audioRef.current?.pause();
    speechSynthesis.cancel();
    const rec = getRecog();
    if (!rec) {
      setError("Este aparelho não captura voz. Usa o campo embaixo.");
      return;
    }
    recRef.current?.abort();
    recRef.current = rec;
    rec.onresult = (ev) => {
      let final = "";
      let mid = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i]!;
        if (r.isFinal) final += r[0]!.transcript;
        else mid += r[0]!.transcript;
      }
      setInterim(mid);
      if (final.trim()) void ask(final);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
      setError(null);
    } catch {
      setError("Não deu pra abrir o microfone.");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-bg/55 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-[2px]">
      <div className="flex max-h-[min(78dvh,36rem)] w-full max-w-lg flex-col rounded-2xl bg-surface shadow-[var(--shadow-border)]">
        <div className="flex items-center gap-2 px-4 py-3">
          <p className="flex-1 font-display text-2xl italic text-fg">Rádio</p>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
          {turns.length === 0 ? (
            <p className="text-sm text-muted">
              Fala comigo no microfone. Pergunta o que o Proa faz, o Hs, o RPM,
              o ETA, a maré… eu explico no papo, sem enrolação.
            </p>
          ) : (
            turns.map((t, i) => (
              <p
                key={`${t.role}-${i}`}
                className={cn(
                  "rounded-md px-3 py-2 text-sm leading-relaxed",
                  t.role === "user"
                    ? "bg-surface-2 text-fg"
                    : "bg-bg text-fg",
                )}
              >
                {t.content}
              </p>
            ))
          )}
          {interim ? <p className="text-sm text-subtle">{interim}</p> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {busy ? <p className="text-sm text-subtle">Espera um segundo…</p> : null}
        </div>
        <form
          className="flex items-center gap-2 border-t border-border px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement;
            const v = input.value;
            input.value = "";
            void ask(v);
          }}
        >
          <button
            type="button"
            aria-label={listening ? "Parar de ouvir" : "Falar"}
            onClick={() => (listening ? recRef.current?.stop() : listen())}
            disabled={busy}
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-md text-accent-fg",
              listening ? "voice-pulse bg-accent" : "bg-accent",
            )}
          >
            <Mic className="size-5" />
          </button>
          <input
            name="q"
            className="h-12 min-w-0 flex-1 rounded-md bg-bg px-3 text-sm text-fg outline-none shadow-[var(--shadow-border)] placeholder:text-subtle"
            placeholder="Ou escreve aqui…"
            autoComplete="off"
            disabled={busy}
          />
        </form>
      </div>
    </div>
  );
}
