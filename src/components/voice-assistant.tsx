import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AlanaMark, ALANA_FACE_LABEL, type AlanaFace } from "@/components/alana-mark";
import { useLiveBridge } from "@/components/bridge-provider";
import { useBridge, useSettings } from "@/lib/store";
import { ALANA_BYE, ALANA_GREET, ALANA_ROLL, ALANA_XTE, type CannedKind } from "@/lib/voice-copy";
import {
  holdEchoCanceller,
  playVoiceMp3,
  releaseEchoCanceller,
  stopVoice,
  unlockVoice,
  voiceCool,
} from "@/lib/voice-play";
import {
  beginBridgePtt,
  endBridgePtt,
  getVoiceSnap,
  pauseBridgeListen,
  resumeBridgeListen,
  resumeListenCtx,
  setBridgePtt,
  startBridgeListen,
  stopBridgeListen,
  subscribeVoiceSnap,
  type VoiceSnap,
} from "@/lib/voice-listen";
import { buildVoiceContext, type VoiceTurn } from "@/lib/voice-context";
import { hearWake, isAlanaEcho } from "@/lib/wake-word";
import { extractCrewNames, mergeCrew, parseWatchAsk, parseWatchCancel, pruneWatches, dueWarn, dueWatch, dropWatch, upsertWatch, watchLine, watchWarnLine } from "@/lib/crew";
import { formatEtaClock } from "@/lib/utils";
import { quickReply } from "@/lib/voice-quick";
import { passageOf } from "@/lib/passage";
import { tickWatch, WATCH_IDLE, type WatchKind, type WatchState } from "@/lib/voice-watch";
import { cn } from "@/lib/utils";

type Mode = "off" | "wake" | "session";

const TTS_CACHE = {
  greet: "proa-alana-tts-greet-v3",
  bye: "proa-alana-tts-bye-v2",
  miss: "proa-alana-tts-miss-v1",
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
  const ptt = useSettings((s) => s.alanaPtt);
  const setPtt = useSettings((s) => s.setAlanaPtt);
  const crewNames = useSettings((s) => s.crewNames);
  const setCrewNames = useSettings((s) => s.setCrewNames);
  const crewWatches = useSettings((s) => s.crewWatches);
  const setCrewWatches = useSettings((s) => s.setCrewWatches);
  const tab = useBridge((s) => s.tab);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("off");
  const [busy, setBusy] = useState(false);
  const [interim, setInterim] = useState("");
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastLine, setLastLine] = useState<string | null>(null);
  const [debug, setDebug] = useState(false);
  const [snap, setSnap] = useState<VoiceSnap | null>(null);
  const [pttHeld, setPttHeld] = useState(false);
  const [saying, setSaying] = useState(false);
  const [thinking, setThinking] = useState(false);

  const asking = useRef(false);
  const locking = useRef(false);
  const speaking = useRef(false);
  const cooling = useRef(false);
  const wanted = useRef(false);
  const held = useRef(false);
  const holdTimer = useRef(0);
  const coolTimer = useRef(0);
  const armDelay = useRef(0);
  const deafUntil = useRef(0);
  const liveAt = useRef(0);
  const prevLineRef = useRef<string | null>(null);
  const modeRef = useRef<Mode>("off");
  const lastLineRef = useRef<string | null>(null);
  const watchRef = useRef<WatchState>(WATCH_IDLE);
  const lastAlertAt = useRef(0);
  const pendingHear = useRef<{ text: string; ptt: boolean; miss?: boolean } | null>(null);
  const pendingTimer = useRef(0);
  const engineRef = useRef(engine);
  const meteoRef = useRef(meteo);
  const routeRef = useRef(route);
  const rpmRef = useRef(rpm);
  const profileRef = useRef(profile);
  const tabRef = useRef(tab);
  const crewRef = useRef(crewNames);
  const watchesRef = useRef(crewWatches);
  const turnsRef = useRef(turns);
  engineRef.current = engine;
  meteoRef.current = meteo;
  routeRef.current = route;
  rpmRef.current = rpm;
  profileRef.current = profile;
  tabRef.current = tab;
  crewRef.current = crewNames;
  watchesRef.current = crewWatches;
  turnsRef.current = turns;
  modeRef.current = mode;
  lastLineRef.current = lastLine;

  function blocked() {
    return (
      speaking.current ||
      asking.current ||
      cooling.current ||
      locking.current ||
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

  function parkWake() {
    modeRef.current = "wake";
    setMode("wake");
  }

  function stopRec() {
    pauseBridgeListen();
  }

  function handleHeard(heard: string, isFinal: boolean, fromPtt = false, miss = false) {
    const text = heard.trim();
    const parse = hearWake(text);
    const gated = fromPtt || parse.woke;
    if (blocked() || performance.now() < liveAt.current) {
      if (gated && (text || miss)) {
        pendingHear.current = { text, ptt: fromPtt, miss };
        const until = Math.max(deafUntil.current, liveAt.current);
        scheduleFlush(until - performance.now());
      }
      return;
    }
    if (!text) {
      setThinking(false);
      return;
    }
    if (heardEcho(text)) {
      setThinking(false);
      return;
    }
    if (fromPtt) {
      if (parse.sleep) {
        void sleep();
        return;
      }
      const q = parse.woke ? parse.rest : text;
      if (!q) {
        void wake("", false);
        return;
      }
      if (!heardEcho(q)) void ask(q);
      return;
    }
    if (!parse.woke || !isFinal) {
      setThinking(false);
      return;
    }
    if (parse.rest && heardEcho(parse.rest)) {
      setThinking(false);
      return;
    }
    void wake(parse.rest, parse.sleep);
  }

  function scheduleFlush(wait: number) {
    window.clearTimeout(pendingTimer.current);
    pendingTimer.current = window.setTimeout(() => {
      if (speaking.current || asking.current || locking.current) {
        scheduleFlush(180);
        return;
      }
      const until = Math.max(deafUntil.current, liveAt.current);
      if (cooling.current || performance.now() < until) {
        scheduleFlush(Math.max(40, until - performance.now()));
        return;
      }
      flushPending();
    }, Math.max(40, wait));
  }

  function flushPending() {
    const p = pendingHear.current;
    pendingHear.current = null;
    if (p) handleHeard(p.text, true, p.ptt, !!p.miss);
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
    flushPending();
    releaseEchoCanceller();
    const { flush } = voiceCool();
    liveAt.current = performance.now() + flush;
    wanted.current = true;
    resumeBridgeListen();
    void resumeListenCtx();
    void startBridgeListen(
      (heard, meta) => {
        if (!wanted.current) return;
        handleHeard(heard, true, !!meta?.ptt, !!meta?.miss);
      },
    )
      .then(() => {
        if (modeRef.current === "off") {
          modeRef.current = "wake";
          setMode("wake");
        }
        setError(null);
      })
      .catch(() => {
        wanted.current = false;
        setMode("off");
        setError("Microfone bloqueado — toca no ícone da Alana pra liberar.");
      });
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
    setThinking(false);
    setSaying(true);
    modeRef.current = "session";
    setMode("session");
    stopRec();
    stopVoice();
    void holdEchoCanceller();
    let extra = 0;
    const { tail } = voiceCool();
    try {
      if (audio) {
        const dur = await playVoiceMp3(audio);
        extra = Math.min(1_600, Math.max(0, dur * 0.08));
      }
      await new Promise((r) => window.setTimeout(r, tail));
    } finally {
      speaking.current = false;
      setSaying(false);
      parkWake();
      resumeBridgeListen();
      coolThenArm(extra);
    }
    void text;
  }

  async function fetchSay(text: string): Promise<string | null> {
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ say: text }),
      signal: AbortSignal.timeout(16_000),
    });
    const data = (await res.json()) as { ok?: boolean; audio?: string | null };
    return data.ok && data.audio ? data.audio : null;
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
    void fetchCanned("miss");
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
    setBusy(true);
    setThinking(true);
    try {
      const audio = await fetchCanned(kind);
      await playReply(text, audio);
    } finally {
      setBusy(false);
      setThinking(false);
      locking.current = false;
    }
    return true;
  }

  async function speakWatch(kind: "warn" | "end", name: string, endMs: number) {
    if (muted || speaking.current || asking.current || locking.current) return false;
    if (performance.now() - lastAlertAt.current < 12_000) return false;
    lastAlertAt.current = performance.now();
    locking.current = true;
    void unlockVoice();
    const text =
      kind === "warn"
        ? watchWarnLine({ name, endMs, warned: false, fired: false })
        : watchLine({ name, endMs, warned: true, fired: false });
    rememberLine(text);
    setTurns((t) => [...t, { role: "assistant", content: text }]);
    setBusy(true);
    setThinking(true);
    try {
      const audio = await fetchSay(text);
      await playReply(text, audio);
    } finally {
      setBusy(false);
      setThinking(false);
      locking.current = false;
    }
    return true;
  }

  async function wake(rest: string, goingSleep: boolean) {
    if (asking.current || locking.current) return;
    locking.current = true;
    setOpen(true);
    try {
      if (goingSleep) {
        await sleep();
        return;
      }
      if (!rest) {
        rememberLine(ALANA_GREET);
        setTurns((t) => [...t, { role: "assistant", content: ALANA_GREET }]);
        setBusy(true);
        setThinking(true);
        try {
          const audio = await fetchCanned("greet");
          await playReply(ALANA_GREET, audio);
        } finally {
          setBusy(false);
          setThinking(false);
        }
        return;
      }
      await ask(rest);
    } finally {
      locking.current = false;
    }
  }

  async function sleep() {
    parkWake();
    rememberLine(ALANA_BYE);
    setTurns((t) => [...t, { role: "assistant", content: ALANA_BYE }]);
    setBusy(true);
    setThinking(true);
    try {
      const audio = await fetchCanned("bye");
      await playReply(ALANA_BYE, audio);
    } finally {
      setBusy(false);
      setThinking(false);
    }
    window.setTimeout(() => setOpen(false), 1800);
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || asking.current) return;
    asking.current = true;
    setBusy(true);
    setThinking(true);
    setError(null);
    setInterim("");
    const history = turnsRef.current.slice(-4);
    setTurns((t) => [...t, { role: "user", content: q }]);
    stopRec();
    stopVoice();
    try {
      const found = extractCrewNames(q);
      if (found.length) {
        const next = mergeCrew(crewRef.current, found);
        crewRef.current = next;
        setCrewNames(next);
      }
      const cancel = parseWatchCancel(q, crewRef.current, watchesRef.current);
      if (cancel) {
        const nextWatches = dropWatch(watchesRef.current, cancel);
        watchesRef.current = nextWatches;
        setCrewWatches(nextWatches);
      }
      const watch = parseWatchAsk(q, crewRef.current, Date.now());
      if (watch) {
        const nextNames = mergeCrew(crewRef.current, [watch.name]);
        crewRef.current = nextNames;
        setCrewNames(nextNames);
        const nextWatches = upsertWatch(pruneWatches(watchesRef.current, Date.now()), watch);
        watchesRef.current = nextWatches;
        setCrewWatches(nextWatches);
      }
      const ctx = buildVoiceContext({
        engine: engineRef.current,
        meteo: meteoRef.current,
        route: routeRef.current,
        rpm: rpmRef.current,
        profile: profileRef.current,
        tab: tabRef.current,
        crewNames: crewRef.current,
        crewWatches: watchesRef.current,
      });
      const local =
        watch && q.length < 90
          ? `Fechou. Aviso o ${watch.name} às ${formatEtaClock(watch.endMs)}.`
          : cancel && !watch && q.length < 70
            ? `Beleza. Cancelei o aviso do ${cancel}.`
            : quickReply(q, ctx);
      if (local) {
        rememberLine(local);
        setTurns((t) => [...t, { role: "assistant", content: local }]);
        const audio = await fetchSay(local);
        await playReply(local, audio);
        return;
      }
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, context: ctx, history }),
        signal: AbortSignal.timeout(28_000),
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
    } catch {
      setError("Sem ligação com a Alana.");
    } finally {
      setBusy(false);
      asking.current = false;
      setThinking(false);
      if (!speaking.current && !cooling.current && wanted.current && !muted) {
        coolThenArm();
      }
    }
  }

  function sendChip(q: string) {
    void unlockVoice();
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
      setSaying(false);
      setThinking(false);
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
      void resumeListenCtx();
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
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(coolTimer.current);
      window.clearTimeout(armDelay.current);
      window.clearTimeout(pendingTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  useEffect(() => {
    setBridgePtt(ptt);
  }, [ptt]);

  useEffect(() => {
    if (muted) {
      setSnap(null);
      return;
    }
    setSnap(getVoiceSnap());
    return subscribeVoiceSnap(setSnap);
  }, [muted]);

  useEffect(() => {
    if (muted) {
      watchRef.current = WATCH_IDLE;
      return;
    }
    const id = window.setInterval(() => {
      if (muted || speaking.current || asking.current || cooling.current || locking.current) return;
      const now = Date.now();
      const watches = pruneWatches(watchesRef.current, now);
      const pruned =
        watches.length !== watchesRef.current.length ||
        watches.some(
          (w, i) =>
            w.fired !== watchesRef.current[i]?.fired || w.warned !== watchesRef.current[i]?.warned,
        );
      if (pruned) {
        watchesRef.current = watches;
        setCrewWatches(watches);
      }
      const warn = dueWarn(watches, now);
      if (warn) {
        const marked = watches.map((w) =>
          w.name === warn.name && w.endMs === warn.endMs ? { ...w, warned: true } : w,
        );
        watchesRef.current = marked;
        setCrewWatches(marked);
        void speakWatch("warn", warn.name, warn.endMs);
        return;
      }
      const due = dueWatch(watches, now);
      if (due) {
        const marked = watches.map((w) =>
          w.name === due.name && w.endMs === due.endMs ? { ...w, warned: true, fired: true } : w,
        );
        watchesRef.current = marked;
        setCrewWatches(marked);
        void speakWatch("end", due.name, due.endMs);
        return;
      }
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
  const lost = snap?.state === "mic_lost" || snap?.state === "suspended";
  const face: AlanaFace = muted
    ? "off"
    : saying
      ? "falando"
      : thinking || snap?.state === "waiting"
        ? "processando"
        : lost
          ? "off"
          : listening || pttHeld || snap?.state === "user_speaking"
            ? "ouvindo"
            : "off";
  const faceLabel = muted
    ? "desligada"
    : lost
      ? "toca pra retomar"
      : ptt && face === "ouvindo" && !pttHeld
        ? "aperte pra falar"
        : ALANA_FACE_LABEL[face];
  const hearLevel =
    face === "ouvindo" && (snap?.state === "user_speaking" || pttHeld)
      ? (snap?.level ?? 0)
      : face === "ouvindo"
        ? 0.08
        : 0;

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
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={muted ? "Ligar Alana" : `Alana ${faceLabel}`}
        title={
          muted
            ? "Alana desligada — toca pra ligar"
            : `Alana ${faceLabel}. Segura pra desligar.`
        }
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
          muted || face === "off"
            ? "text-subtle hover:bg-surface-2 hover:text-fg"
            : face === "falando"
              ? "voice-pulse bg-accent text-accent-fg"
              : face === "processando"
                ? "text-warn hover:bg-surface-2"
                : "text-ok hover:bg-surface-2",
        )}
      >
        <AlanaMark face={face} level={hearLevel} className="size-5" />
      </button>

      {!open && mode === "session" && lastLine ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 truncate rounded-md bg-surface/95 px-3 py-2 text-left text-sm text-fg shadow-[var(--shadow-border)] backdrop-blur-sm"
        >
          <AlanaMark
            face={face}
            level={hearLevel}
            className={cn(
              "size-4 shrink-0",
              face === "falando"
                ? "text-accent"
                : face === "processando"
                  ? "text-warn"
                  : "text-ok",
            )}
          />
          <span className="mr-1 font-display italic text-accent">Alana</span>
          <span className="min-w-0 truncate">{lastLine}</span>
        </button>
      ) : null}

      {open ? (
        <>
          <button
            type="button"
            aria-label="Fechar Alana"
            className="fixed inset-0 z-30 bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-[calc(100%+0.45rem)] z-50 flex max-h-[min(64dvh,28rem)] w-[min(calc(100vw-1.25rem),22rem)] flex-col rounded-2xl bg-surface shadow-[var(--shadow-border)]">
            <div className="flex items-center gap-2 px-4 py-3">
              <AlanaMark
                face={face}
                level={hearLevel}
                className={cn(
                  "size-6 shrink-0",
                  muted || face === "off"
                    ? "text-subtle"
                    : face === "falando"
                      ? "text-accent"
                      : face === "processando"
                        ? "text-warn"
                        : "text-ok",
                )}
              />
              <p className="flex-1 font-display text-2xl italic text-fg">Alana</p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-subtle">{faceLabel}</p>
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
              {crewWatches.some((w) => !w.fired) ? (
                <div className="space-y-1 rounded-md bg-bg px-3 py-2">
                  {crewWatches
                    .filter((w) => !w.fired)
                    .map((w) => (
                      <p
                        key={`${w.name}-${w.endMs}`}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="text-fg">{w.name}</span>
                        <span className="text-subtle">{formatEtaClock(w.endMs)}</span>
                      </p>
                    ))}
                </div>
              ) : null}
              {turns.length === 0 ? (
                <p className="text-sm text-muted">
                  Chama <span className="text-fg">Alana</span> pelo nome cada
                  vez. Sem o nome, o rádio não responde.
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
              {face === "processando" ? (
                <p className="text-sm text-subtle">Processando…</p>
              ) : null}
              {debug && snap ? (
                <p className="font-mono text-xs leading-relaxed text-subtle">
                  MIC {snap.track} · ctx {snap.ctx} · {snap.state}
                  <br />
                  in {snap.inputHz} Hz → pcm {snap.pcmHz} · nível {snap.level}
                  {snap.clipping ? " · CLIP" : ""}
                  <br />
                  VAD {snap.vad} · hang {snap.hangMs} ms · frames {snap.framesIn} ·
                  clips {snap.clipsSent}
                  <br />
                  last {snap.lastFrameAgeMs} ms · clip {snap.lastClip} · {snap.visibility}
                  {snap.ptt ? " · PTT" : ""}
                </p>
              ) : null}
            </div>
            <div className="flex gap-2 overflow-x-auto px-3 pb-3">
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
              <button
                type="button"
                onClick={() => setPtt(!ptt)}
                className={cn(
                  "h-11 shrink-0 rounded-md px-3 text-xs font-medium uppercase tracking-[0.12em] transition-[background-color,color] duration-150",
                  ptt ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                {ptt ? "Mãos livres" : "Aperta pra falar"}
              </button>
              <button
                type="button"
                onClick={() => setDebug((v) => !v)}
                className={cn(
                  "h-11 shrink-0 rounded-md px-3 text-xs font-medium uppercase tracking-[0.12em] transition-[background-color,color] duration-150",
                  debug ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                Diagnóstico
              </button>
            </div>
            {ptt && !muted ? (
              <button
                type="button"
                disabled={busy}
                onPointerDown={(e) => {
                  e.preventDefault();
                  void unlockVoice();
                  void resumeListenCtx();
                  setPttHeld(true);
                  beginBridgePtt();
                }}
                onPointerUp={() => {
                  setPttHeld(false);
                  endBridgePtt();
                }}
                onPointerCancel={() => {
                  setPttHeld(false);
                  endBridgePtt();
                }}
                className={cn(
                  "mx-3 mb-2 h-12 rounded-md text-sm font-medium uppercase tracking-[0.12em] transition-[background-color,color] duration-150 disabled:opacity-40",
                  pttHeld ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg",
                )}
              >
                {pttHeld ? "Solta pra enviar" : "Aperta pra falar"}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
