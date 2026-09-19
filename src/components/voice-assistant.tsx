import { useEffect, useRef, useState } from "react";
import { Mic, Send, X } from "lucide-react";
import { useLiveBridge } from "@/components/bridge-provider";
import { useBridge, useSettings } from "@/lib/store";
import { ALANA_BYE, ALANA_GREET, ALANA_ROLL, ALANA_XTE, type CannedKind } from "@/lib/voice-copy";
import {
  holdEchoCanceller,
  isAndroidVoice,
  playVoiceMp3,
  releaseEchoCanceller,
  stopVoice,
  unlockVoice,
  voiceCool,
} from "@/lib/voice-play";
import {
  pauseBridgeListen,
  resumeBridgeListen,
  startBridgeListen,
  stopBridgeListen,
} from "@/lib/voice-listen";
import { buildVoiceContext, type VoiceTurn } from "@/lib/voice-context";
import { hearWake, isAlanaEcho } from "@/lib/wake-word";
import { passageOf } from "@/lib/passage";
import { tickWatch, WATCH_IDLE, type WatchKind, type WatchState } from "@/lib/voice-watch";
import { cn } from "@/lib/utils";

type Recog = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: {
    resultIndex: number;
    results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
  }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type Mode = "off" | "wake" | "session";

const SESSION_MS = 90_000;
const TTS_CACHE = {
  greet: "proa-alana-tts-greet-v2",
  bye: "proa-alana-tts-bye-v2",
  xte: "proa-alana-tts-xte-v1",
  roll: "proa-alana-tts-roll-v1",
} as const;

const ASK_CHIPS: { q: string; label: string }[] = [
  { q: "Como tá a viagem agora? Me dá um relatório.", label: "Relatório" },
  { q: "Onde a gente tá? Lat, long e a costa.", label: "Posição" },
  {
    q: "Dá pra economizar combustível na faixa de RPM, aproveitando o tempo a favor?",
    label: "Combustível",
  },
];

function getCtor() {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function readTtsCache(kind: CannedKind): string | null {
  try {
    const v = localStorage.getItem(TTS_CACHE[kind]);
    return v && v.length > 80 ? v : null;
  } catch {
    return null;
  }
}

function writeTtsCache(kind: CannedKind, audio: string) {
  try {
    localStorage.setItem(TTS_CACHE[kind], audio);
  } catch {
    /* quota */
  }
}

export function AlanaRadio() {
  const { engine, meteo } = useLiveBridge();
  const route = useSettings((s) => s.route);
  const rpm = useSettings((s) => s.rpm);
  const profile = useSettings((s) => s.profile);
  const muted = useSettings((s) => s.alanaMuted);
  const setMuted = useSettings((s) => s.setAlanaMuted);
  const tab = useBridge((s) => s.tab);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("off");
  const [busy, setBusy] = useState(false);
  const [interim, setInterim] = useState("");
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastLine, setLastLine] = useState<string | null>(null);

  const recRef = useRef<Recog | null>(null);
  const asking = useRef(false);
  const locking = useRef(false);
  const speaking = useRef(false);
  const cooling = useRef(false);
  const wanted = useRef(false);
  const held = useRef(false);
  const holdTimer = useRef(0);
  const coolTimer = useRef(0);
  const armDelay = useRef(0);
  const genRef = useRef(0);
  const deafUntil = useRef(0);
  const liveAt = useRef(0);
  const prevLineRef = useRef<string | null>(null);
  const modeRef = useRef<Mode>("off");
  const sessionTimer = useRef<number>(0);
  const lastLineRef = useRef<string | null>(null);
  const watchRef = useRef<WatchState>(WATCH_IDLE);
  const lastAlertAt = useRef(0);
  const engineRef = useRef(engine);
  const meteoRef = useRef(meteo);
  const routeRef = useRef(route);
  const rpmRef = useRef(rpm);
  const profileRef = useRef(profile);
  const tabRef = useRef(tab);
  const turnsRef = useRef(turns);
  engineRef.current = engine;
  meteoRef.current = meteo;
  routeRef.current = route;
  rpmRef.current = rpm;
  profileRef.current = profile;
  tabRef.current = tab;
  turnsRef.current = turns;
  modeRef.current = mode;
  lastLineRef.current = lastLine;

  function blocked() {
    return (
      speaking.current ||
      asking.current ||
      cooling.current ||
      performance.now() < deafUntil.current
    );
  }

  function rememberLine(text: string) {
    prevLineRef.current = lastLineRef.current;
    lastLineRef.current = text;
    setLastLine(text);
  }

  function heardEcho(raw: string) {
    return isAlanaEcho(raw, lastLineRef.current) || isAlanaEcho(raw, prevLineRef.current);
  }

  function bumpSession() {
    window.clearTimeout(sessionTimer.current);
    sessionTimer.current = window.setTimeout(() => {
      modeRef.current = "wake";
      setMode("wake");
    }, SESSION_MS);
  }

  function stopRec() {
    genRef.current += 1;
    pauseBridgeListen();
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    rec.onresult = null;
    rec.onend = null;
    rec.onerror = null;
    try {
      rec.stop();
    } catch {
      /* ok */
    }
    try {
      rec.abort();
    } catch {
      /* already dead */
    }
  }

  function handleHeard(heard: string, isFinal: boolean) {
    if (blocked()) return;
    if (performance.now() < liveAt.current) return;
    const text = heard.trim();
    if (!text) return;
    if (heardEcho(text)) return;
    const parse = hearWake(text);
    if (modeRef.current !== "session") {
      if (!parse.woke || !isFinal) return;
      if (parse.rest && heardEcho(parse.rest)) return;
      void wake(parse.rest, parse.sleep);
      return;
    }
    if (!isFinal) return;
    if (parse.sleep) {
      void sleep();
      return;
    }
    const q = parse.rest;
    if (q && !heardEcho(q)) void ask(q);
  }

  function arm() {
    if (muted || speaking.current || asking.current) return;
    if (typeof window === "undefined") return;
    if (performance.now() < deafUntil.current) {
      window.clearTimeout(armDelay.current);
      armDelay.current = window.setTimeout(
        () => arm(),
        Math.max(80, deafUntil.current - performance.now()),
      );
      return;
    }
    stopRec();
    releaseEchoCanceller();
    const my = genRef.current;
    const { flush } = voiceCool();
    liveAt.current = performance.now() + flush;
    wanted.current = true;
    if (isAndroidVoice()) {
      resumeBridgeListen();
      void startBridgeListen((heard) => {
        if (my !== genRef.current) return;
        handleHeard(heard, true);
      }).then(() => {
        if (my !== genRef.current) return;
        if (modeRef.current === "off") {
          modeRef.current = "wake";
          setMode("wake");
        }
        setError(null);
      }).catch(() => {
        if (my !== genRef.current) return;
        wanted.current = false;
        setMode("off");
        setError("Microfone bloqueado — toca no ícone da Alana pra liberar.");
      });
      return;
    }
    const Ctor = getCtor();
    if (!Ctor) {
      setError("Este aparelho não captura voz. Escreve no rádio.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      if (my !== genRef.current) return;
      if (blocked()) return;
      if (performance.now() < liveAt.current) return;
      let final = "";
      let mid = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]!;
        if (r.isFinal) final += r[0]!.transcript;
        else mid += r[0]!.transcript;
      }
      setInterim(mid);
      const heard = (final || mid).trim();
      if (!heard) return;
      handleHeard(heard, Boolean(final));
    };
    rec.onerror = (ev) => {
      if (my !== genRef.current) return;
      const err = ev.error ?? "";
      if (err === "not-allowed") {
        wanted.current = false;
        setMode("off");
        setError("Microfone bloqueado — toca no ícone da Alana pra liberar.");
        return;
      }
      if (err === "aborted") return;
      if (err === "audio-capture") {
        releaseEchoCanceller();
        window.setTimeout(() => {
          if (my === genRef.current && wanted.current && !muted && !blocked()) arm();
        }, 700);
      }
    };
    rec.onend = () => {
      if (my !== genRef.current) return;
      if (recRef.current === rec) recRef.current = null;
      if (wanted.current && !muted && !blocked()) {
        window.setTimeout(() => {
          if (my === genRef.current && wanted.current && !muted && !blocked()) arm();
        }, 400);
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      if (modeRef.current === "off") {
        modeRef.current = "wake";
        setMode("wake");
      }
      setError(null);
    } catch {
      window.setTimeout(() => {
        if (wanted.current && my === genRef.current) arm();
      }, 600);
    }
  }

  function coolThenArm(extra = 0) {
    cooling.current = true;
    const { cool, flush } = voiceCool();
    const wait = cool + Math.max(0, extra);
    deafUntil.current = performance.now() + wait + flush;
    window.clearTimeout(coolTimer.current);
    coolTimer.current = window.setTimeout(() => {
      cooling.current = false;
      if (wanted.current && !muted && !speaking.current && !asking.current) arm();
    }, wait);
  }

  async function playReply(text: string, audio: string | null) {
    speaking.current = true;
    cooling.current = true;
    stopRec();
    stopVoice();
    void holdEchoCanceller();
    let extra = 0;
    const { tail } = voiceCool();
    try {
      if (audio) {
        const dur = await playVoiceMp3(audio);
        extra = Math.min(1_600, Math.max(0, dur * 0.14));
      }
      await new Promise((r) => window.setTimeout(r, tail));
    } finally {
      speaking.current = false;
      coolThenArm(extra);
    }
    void text;
  }

  async function fetchCanned(kind: CannedKind): Promise<string | null> {
    const cached = readTtsCache(kind);
    if (cached) return cached;
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canned: kind }),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json()) as { ok?: boolean; audio?: string | null };
    if (data.ok && data.audio) {
      writeTtsCache(kind, data.audio);
      return data.audio;
    }
    return null;
  }

  function prefetchCanned() {
    void fetchCanned("greet");
    void fetchCanned("xte");
    void fetchCanned("roll");
  }

  async function speakAlert(kind: WatchKind) {
    if (muted || speaking.current || asking.current || locking.current) return false;
    if (performance.now() - lastAlertAt.current < 12_000) return false;
    lastAlertAt.current = performance.now();
    locking.current = true;
    void unlockVoice();
    const text = kind === "roll" ? ALANA_ROLL : ALANA_XTE;
    rememberLine(text);
    setTurns((t) => [...t, { role: "assistant", content: text }]);
    modeRef.current = "session";
    setMode("session");
    bumpSession();
    setBusy(true);
    try {
      const audio = await fetchCanned(kind);
      await playReply(text, audio);
    } finally {
      setBusy(false);
      locking.current = false;
    }
    return true;
  }

  async function wake(rest: string, goingSleep: boolean) {
    if (asking.current || locking.current) return;
    locking.current = true;
    setOpen(true);
    modeRef.current = "session";
    setMode("session");
    bumpSession();
    try {
      if (goingSleep) {
        await sleep();
        return;
      }
      if (!rest) {
        rememberLine(ALANA_GREET);
        setTurns((t) => [...t, { role: "assistant", content: ALANA_GREET }]);
        setBusy(true);
        try {
          const audio = await fetchCanned("greet");
          await playReply(ALANA_GREET, audio);
        } finally {
          setBusy(false);
        }
        return;
      }
      await ask(rest);
    } finally {
      locking.current = false;
    }
  }

  async function sleep() {
    window.clearTimeout(sessionTimer.current);
    modeRef.current = "wake";
    setMode("wake");
    rememberLine(ALANA_BYE);
    setTurns((t) => [...t, { role: "assistant", content: ALANA_BYE }]);
    setBusy(true);
    try {
      const audio = await fetchCanned("bye");
      await playReply(ALANA_BYE, audio);
    } finally {
      setBusy(false);
    }
    window.setTimeout(() => setOpen(false), 1800);
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || asking.current) return;
    asking.current = true;
    setBusy(true);
    setError(null);
    setInterim("");
    bumpSession();
    const history = turnsRef.current.slice(-6);
    setTurns((t) => [...t, { role: "user", content: q }]);
    stopRec();
    stopVoice();
    try {
      const ctx = buildVoiceContext({
        engine: engineRef.current,
        meteo: meteoRef.current,
        route: routeRef.current,
        rpm: rpmRef.current,
        profile: profileRef.current,
        tab: tabRef.current,
      });
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
      rememberLine(data.text);
      setTurns((t) => [...t, { role: "assistant", content: data.text! }]);
      await playReply(data.text, data.audio ?? null);
      bumpSession();
    } catch {
      setError("Sem ligação com a Alana.");
    } finally {
      setBusy(false);
      asking.current = false;
      if (!speaking.current && !cooling.current && wanted.current && !muted) {
        coolThenArm();
      }
    }
  }

  function sendChip(q: string) {
    void unlockVoice();
    modeRef.current = "session";
    setMode("session");
    bumpSession();
    void ask(q);
  }

  useEffect(() => {
    if (muted) {
      wanted.current = false;
      stopRec();
      stopVoice();
      stopBridgeListen();
      releaseEchoCanceller();
      setMode("off");
      return;
    }
    wanted.current = true;
    arm();
    const onVis = () => {
      if (document.hidden) {
        stopRec();
        stopVoice();
        stopBridgeListen();
        releaseEchoCanceller();
      } else if (wanted.current && !muted) arm();
    };
    const onPtr = () => {
      void unlockVoice();
      prefetchCanned();
      if (!wanted.current || modeRef.current === "off") {
        wanted.current = true;
        arm();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", onPtr, { once: true });
    return () => {
      wanted.current = false;
      stopRec();
      stopVoice();
      stopBridgeListen();
      releaseEchoCanceller();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", onPtr);
      window.clearTimeout(sessionTimer.current);
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(coolTimer.current);
      window.clearTimeout(armDelay.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  useEffect(() => {
    if (muted) {
      watchRef.current = WATCH_IDLE;
      return;
    }
    const id = window.setInterval(() => {
      if (muted || speaking.current || asking.current || cooling.current || locking.current) return;
      const engine = engineRef.current;
      const p = passageOf(routeRef.current, engine);
      const hit = tickWatch(watchRef.current, {
        xteNm: p?.xteNm ?? null,
        rollP2P: engine?.rollP2P ?? null,
        sogKn: p?.sogKn ?? engine?.fix?.sogKn ?? 0,
        alongNm: p?.alongNm ?? 0,
        remainNm: p?.remainNm ?? 0,
        capturing: !!engine?.capturing,
      });
      if (hit.alert) {
        if (performance.now() - lastAlertAt.current < 12_000) return;
        watchRef.current = hit.state;
        void speakAlert(hit.alert);
        return;
      }
      watchRef.current = hit.state;
    }, 1_100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  const listening = mode === "wake" || mode === "session";

  function beginHold() {
    held.current = false;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      stopVoice();
      stopBridgeListen();
      releaseEchoCanceller();
      setMuted(true);
      setOpen(false);
    }, 650);
  }

  function endHold() {
    window.clearTimeout(holdTimer.current);
  }

  return (
    <>
      <button
        type="button"
        aria-label={muted ? "Ligar Alana" : "Alana"}
        title={muted ? "Alana desligada — toca pra ligar" : "Alana escuta o nome. Segura pra desligar."}
        onPointerDown={beginHold}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onContextMenu={(e) => {
          e.preventDefault();
          stopVoice();
          stopBridgeListen();
          releaseEchoCanceller();
          setMuted(true);
          setOpen(false);
        }}
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          void unlockVoice();
          if (muted) {
            setMuted(false);
            return;
          }
          setOpen(true);
        }}
        className={cn(
          "flex size-11 items-center justify-center rounded-md transition-[background-color,color] duration-150 active:scale-[0.96]",
          muted
            ? "text-subtle hover:bg-surface-2 hover:text-fg"
            : mode === "session"
              ? "voice-pulse bg-accent text-accent-fg"
              : listening
                ? "text-accent hover:bg-surface-2"
                : "text-muted hover:bg-surface-2 hover:text-fg",
        )}
      >
        <Mic className="size-5" />
      </button>

      {!open && mode === "session" && lastLine ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 truncate rounded-md bg-surface/95 px-3 py-2 text-left text-sm text-fg shadow-[var(--shadow-border)] backdrop-blur-sm"
        >
          <span className="mr-2 font-display italic text-accent">Alana</span>
          {lastLine}
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-bg/55 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-[2px]">
          <div className="flex max-h-[min(78dvh,36rem)] w-full max-w-lg flex-col rounded-2xl bg-surface shadow-[var(--shadow-border)]">
            <div className="flex items-center gap-2 px-4 py-3">
              <p className="flex-1 font-display text-2xl italic text-fg">Alana</p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-subtle">
                {muted
                  ? "desligada"
                  : busy
                    ? "falando"
                    : mode === "session"
                      ? "à disposição"
                      : listening
                        ? "escuta o nome"
                        : "parada"}
              </p>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setOpen(false)}
                className="flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
              {turns.length === 0 ? (
                <p className="text-sm text-muted">
                  Chama <span className="text-fg">Alana</span> pelo nome. Conversa
                  solta, mas ela fica no apoio da viagem — posição, mar, rota,
                  RPM — sem mudar de tela. Se o rebocador abrir da derrota ou o
                  balanço de banda apertar, ela fala sozinha. Pede relatório,
                  posição ou como economizar combustível.
                </p>
              ) : (
                turns.map((t, i) => (
                  <p
                    key={`${t.role}-${i}`}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm leading-relaxed",
                      t.role === "user" ? "bg-surface-2 text-fg" : "bg-bg text-fg",
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
            <div className="flex gap-2 overflow-x-auto px-3 pb-1">
              {ASK_CHIPS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  disabled={busy}
                  onClick={() => sendChip(c.q)}
                  className="h-11 shrink-0 rounded-md bg-surface-2 px-3 text-xs font-medium uppercase tracking-[0.12em] text-muted transition-[background-color,color] duration-150 hover:text-fg disabled:opacity-40"
                >
                  {c.label}
                </button>
              ))}
            </div>
            <form
              className="flex items-center gap-2 border-t border-border px-3 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement;
                const v = input.value;
                input.value = "";
                modeRef.current = "session";
                setMode("session");
                bumpSession();
                void ask(v);
              }}
            >
              <input
                name="q"
                className="h-12 min-w-0 flex-1 rounded-md bg-bg px-3 text-sm text-fg outline-none shadow-[var(--shadow-border)] placeholder:text-subtle"
                placeholder="Ou escreve aqui…"
                autoComplete="off"
                disabled={busy}
              />
              <button
                type="submit"
                aria-label="Enviar"
                disabled={busy}
                className="flex size-11 shrink-0 items-center justify-center rounded-md text-accent hover:bg-surface-2 disabled:opacity-40"
              >
                <Send className="size-5" />
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
