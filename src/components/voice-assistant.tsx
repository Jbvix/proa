import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AlanaMark, ALANA_FACE_LABEL, type AlanaFace } from "@/components/alana-mark";
import { useLiveBridge } from "@/components/bridge-provider";
import { useBridge, useSettings } from "@/lib/store";
import { ALANA_XTE, type CannedKind } from "@/lib/voice-copy";
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
import { routeHeard } from "@/lib/voice-turn";
import { extractCrewNames, extractNameAnswer, mergeCrew } from "@/lib/crew";
import { quickReply } from "@/lib/voice-quick";
import { greetLine, byeLine, askedForName } from "@/lib/alana-presence";
import { matchVoice, upsertVoice } from "@/lib/voice-print";
import { passageOf } from "@/lib/passage";
import { type WatchKind } from "@/lib/voice-watch";
import { waypointMarks, waypointReport } from "@/lib/waypoint-pass";
import { ALERTS_IDLE, tickAlerts, type AlertState } from "@/lib/voice-alerts";
import { createEchoMemory } from "@/lib/voice-echo";
import { fetchCanned, fetchSay, prefetchCanned } from "@/lib/voice-tts";
import { cn } from "@/lib/utils";

type Mode = "off" | "wake" | "session";

const ASK_CHIPS: { q: string; label: string }[] = [
  { q: "Como tá a viagem agora? Me dá um relatório.", label: "Relatório" },
  { q: "Onde a gente tá? Lat, long e a costa.", label: "Posição" },
  {
    q: "Dá pra economizar combustível na faixa de RPM, aproveitando o tempo a favor?",
    label: "Combustível",
  },
];

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
  const crewVoices = useSettings((s) => s.crewVoices);
  const setCrewVoices = useSettings((s) => s.setCrewVoices);
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
  const [talking, setTalking] = useState(false);

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
  const modeRef = useRef<Mode>("off");
  /** Guarda as duas últimas falas da Lara pra não responder ao próprio eco. */
  const echoRef = useRef(createEchoMemory());
  /** Estado do vigia: XTE, travessia de waypoint e as travas de cadência. */
  const alertsRef = useRef<AlertState>(ALERTS_IDLE);
  const pendingHear = useRef<{ text: string; ptt: boolean; miss?: boolean; print?: number[] } | null>(null);
  const lastPrint = useRef<number[] | null>(null);
  const introEchoUntil = useRef(0);
  const voicesRef = useRef(crewVoices);
  const lastHeardName = useRef<string | null>(null);
  const talkOn = useRef(false);
  const pendingTalk = useRef(false);
  const pendingTimer = useRef(0);
  const engineRef = useRef(engine);
  const meteoRef = useRef(meteo);
  const routeRef = useRef(route);
  const rpmRef = useRef(rpm);
  const profileRef = useRef(profile);
  const tabRef = useRef(tab);
  const crewRef = useRef(crewNames);
  const turnsRef = useRef(turns);
  engineRef.current = engine;
  meteoRef.current = meteo;
  routeRef.current = route;
  rpmRef.current = rpm;
  profileRef.current = profile;
  tabRef.current = tab;
  crewRef.current = crewNames;
  voicesRef.current = crewVoices;
  turnsRef.current = turns;
  modeRef.current = mode;

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
    echoRef.current.remember(text);
    setLastLine(text);
  }

  function heardEcho(raw: string) {
    return echoRef.current.isEcho(raw);
  }

  function parkWake() {
    modeRef.current = "wake";
    setMode("wake");
  }

  function stopRec() {
    pauseBridgeListen();
  }

  function handleHeard(heard: string, isFinal: boolean, fromPtt = false, miss = false, print?: number[]) {
    const text = heard.trim();
    if (print?.length) lastPrint.current = print;

    // A DECISÃO é de `routeHeard`, pura e testada. Aqui só se colhem os fatos
    // do momento e se executa a rota. Era uma escada de nove `return` com
    // `setState` no meio, que não dava pra testar nem pra ler.
    const busy = blocked() || performance.now() < liveAt.current;
    const route = routeHeard(
      {
        text,
        isFinal,
        fromPtt,
        busy,
        talkOn: talkOn.current,
        inIntroEcho: performance.now() < introEchoUntil.current,
      },
      heardEcho,
    );

    switch (route.kind) {
      case "defer": {
        pendingHear.current = { text, ptt: fromPtt, miss, print };
        const until = Math.max(deafUntil.current, liveAt.current);
        scheduleFlush(until - performance.now());
        return;
      }
      case "ignore":
        // Com a linha ocupada o "pensando" pertence ao turno em andamento e
        // não se desliga aqui; em qualquer outro caso, descarta-se o spinner.
        if (!busy) setThinking(false);
        return;
      case "endTalk":
        void endTalk();
        return;
      case "startTalk":
        void startTalk();
        return;
      case "ask":
        void ask(route.question);
        return;
      case "sleep":
      case "wake": {
        // Quem falou fica registrado nos dois casos, inclusive na despedida:
        // é por esse nome que ela cumprimenta da próxima vez.
        const heardName =
          matchVoice(voicesRef.current, lastPrint.current)?.name ?? lastHeardName.current;
        if (heardName) lastHeardName.current = heardName;
        const goingSleep = route.kind === "sleep";
        void wake(goingSleep ? "" : route.rest, goingSleep, heardName);
        return;
      }
    }
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
    if (p) handleHeard(p.text, true, p.ptt, !!p.miss, p.print);
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
        handleHeard(heard, true, !!meta?.ptt, !!meta?.miss, meta?.print);
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
        setError("Microfone bloqueado — toca no ícone da Lara pra liberar.");
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
        extra = Math.min(1_600, Math.max(extra, dur * 0.08));
      }
      introEchoUntil.current = Math.max(
        introEchoUntil.current,
        performance.now() + (/sou a lara|sou a iara|sou a yara/i.test(text) ? 3_600 : 2_400),
      );
      if (/sou a lara|sou a iara|sou a yara/i.test(text)) extra = Math.max(extra, 1_400);
      await new Promise((r) => window.setTimeout(r, tail));
    } finally {
      speaking.current = false;
      setSaying(false);
      if (talkOn.current) {
        modeRef.current = "session";
        setMode("session");
      } else {
        parkWake();
      }
      resumeBridgeListen();
      coolThenArm(extra);
    }
  }

  async function speakAlert(kind: WatchKind) {
    if (kind !== "xte") return false;
    return speakLine(ALANA_XTE, "xte");
  }

  async function speakLine(text: string, canned?: CannedKind) {
    if (!text || muted || speaking.current || asking.current || locking.current) return false;
    locking.current = true;
    void unlockVoice();
    rememberLine(text);
    setTurns((t) => [...t, { role: "assistant", content: text }]);
    setOpen(true);
    setBusy(true);
    setThinking(true);
    try {
      const audio = canned ? await fetchCanned(canned) : await fetchSay(text);
      await playReply(text, audio);
    } finally {
      setBusy(false);
      setThinking(false);
      locking.current = false;
    }
    return true;
  }

  async function wake(rest: string, goingSleep: boolean, heardName?: string | null) {
    if (asking.current || locking.current) return;
    locking.current = true;
    setOpen(true);
    try {
      if (goingSleep) {
        await sleep();
        return;
      }
      if (!rest) {
        const line = greetLine(crewRef.current, Date.now(), heardName ?? lastHeardName.current);
        rememberLine(line);
        setTurns((t) => [...t, { role: "assistant", content: line }]);
        setBusy(true);
        setThinking(true);
        try {
          const audio = await fetchSay(line);
          await playReply(line, audio);
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
    talkOn.current = false;
    setTalking(false);
    parkWake();
    const line = byeLine(crewRef.current);
    rememberLine(line);
    setTurns((t) => [...t, { role: "assistant", content: line }]);
    setBusy(true);
    setThinking(true);
    try {
      const audio = await fetchSay(line);
      await playReply(line, audio);
    } finally {
      setBusy(false);
      setThinking(false);
    }
    window.setTimeout(() => setOpen(false), 1800);
  }

  async function startTalk() {
    if (talkOn.current || locking.current) {
      setOpen(true);
      return;
    }
    void unlockVoice();
    talkOn.current = true;
    setTalking(true);
    setOpen(true);
    if (muted) {
      pendingTalk.current = true;
      setMuted(false);
      return;
    }
    wanted.current = true;
    arm();
    await wake("", false);
  }

  async function endTalk() {
    if (!talkOn.current) {
      setOpen(false);
      return;
    }
    await sleep();
  }

  function toggleTalk() {
    if (held.current) return;
    if (talkOn.current) void endTalk();
    else void startTalk();
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
      const prevAssist = [...turnsRef.current].reverse().find((t) => t.role === "assistant")?.content;
      const named =
        askedForName(prevAssist) && !found.length ? extractNameAnswer(q) : null;
      if (found.length || named) {
        const next = mergeCrew(crewRef.current, named ? [named, ...found] : found);
        crewRef.current = next;
        setCrewNames(next);
      }
      const whoEnroll = named ?? found[0];
      if (whoEnroll && lastPrint.current) {
        const nextV = upsertVoice(voicesRef.current, whoEnroll, lastPrint.current);
        voicesRef.current = nextV;
        setCrewVoices(nextV);
        lastHeardName.current = whoEnroll;
      }
      const ctx = buildVoiceContext({
        engine: engineRef.current,
        meteo: meteoRef.current,
        route: routeRef.current,
        rpm: rpmRef.current,
        profile: profileRef.current,
        tab: tabRef.current,
        crewNames: crewRef.current,
      });
      const who = named ?? found[0];
      const introOnly = !!who && q.length < 48;
      const local = introOnly
        ? `Prazer, ${who}. Tô aqui. Pode mandar.`
        : quickReply(q, ctx);
      if (local) {
        const spoken = local;
        rememberLine(spoken);
        setTurns((t) => [...t, { role: "assistant", content: spoken }]);
        const audio = await fetchSay(spoken);
        await playReply(spoken, audio);
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
      setError("Sem ligação com a Lara.");
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
      talkOn.current = false;
      pendingTalk.current = false;
      setTalking(false);
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
    if (pendingTalk.current) {
      pendingTalk.current = false;
      void wake("", false);
    }
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
      alertsRef.current = ALERTS_IDLE;
      return;
    }
    const id = window.setInterval(() => {
      if (muted || speaking.current || asking.current || cooling.current || locking.current) return;
      // Quem DECIDE se há aviso é `tickAlerts`, puro e testado. Aqui só se lê o
      // que os sensores dizem e se executa o que ele mandar.
      const engine = engineRef.current;
      const route = routeRef.current;
      const p = passageOf(route, engine);
      const marks = waypointMarks(route);
      const step = tickAlerts(alertsRef.current, {
        routeSource: route?.source ?? "",
        xteNm: p?.xteNm ?? null,
        sogKn: p?.sogKn ?? engine?.fix?.sogKn ?? 0,
        alongNm: p?.alongNm ?? 0,
        remainNm: p?.remainNm ?? 0,
        capturing: !!engine?.capturing,
        marks,
        nowMono: performance.now(),
      });
      alertsRef.current = step.state;
      if (!step.action) return;
      if (step.action.kind === "xte") {
        void speakAlert(step.action.alert);
        return;
      }
      const { passed, next } = step.action;
      const ctx = buildVoiceContext({
        engine,
        meteo: meteoRef.current,
        route,
        rpm: rpmRef.current,
        profile: profileRef.current,
        tab: tabRef.current,
        crewNames: crewRef.current,
      });
      const text = waypointReport(passed, {
        name: crewRef.current[0],
        sogKn: ctx.posicao.sogKn,
        hsM: ctx.mar.hsCasco,
        estado: ctx.mar.estado,
        ondasMin: ctx.mar.ondasMin,
        ventoKn: ctx.meteo.ventoKn,
        ventoCard: ctx.meteo.ventoCard ?? undefined,
        remainNm: ctx.viagem.faltaNm,
        eta: ctx.mare.etaDia ?? ctx.mare.eta,
        nextNome: next?.nome ?? ctx.waypoints.find((w) => (w.faltaNm ?? 0) > 0.4)?.nome,
        nextFaltaNm: next ? Math.max(0, next.nm - (p?.alongNm ?? 0)) : null,
        mare: ctx.mare.fase,
        xteNm: ctx.posicao.xteNm,
        xteLado: ctx.posicao.xteLado,
      }, marks[marks.length - 1]?.nm ?? Infinity);
      void speakLine(text);
    }, 1_100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted]);

  const lost = snap?.state === "mic_lost" || snap?.state === "suspended";
  const userTalking =
    snap?.state === "user_speaking" || pttHeld || snap?.vad === "speech";
  const face: AlanaFace = muted
    ? "off"
    : saying
      ? "falando"
      : thinking
        ? "processando"
        : lost
          ? "off"
          : talking && userTalking
            ? "ouvindo"
            : talking
              ? "espera"
              : "espera";
  const faceLabel = muted
    ? "desligada"
    : talking && face === "espera"
      ? "conversa"
      : lost
        ? "toca pra retomar"
        : ALANA_FACE_LABEL[face];
  const hearLevel = face === "ouvindo" ? Math.max(0.12, snap?.level ?? 0.12) : 0;

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
        aria-label={talking ? "Encerrar conversa com a Lara" : "Conversar com a Lara"}
        title={talking ? "Toca de novo pra encerrar" : "Toca pra conversar com a Lara"}
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
          toggleTalk();
        }}
        className={cn(
          "flex size-11 items-center justify-center rounded-md transition-[background-color,color] duration-150 active:scale-[0.96]",
          talking && (face === "falando" || face === "ouvindo")
            ? "voice-pulse bg-accent text-accent-fg"
            : talking
              ? "bg-accent/20 text-accent"
              : muted || face === "off" || face === "espera"
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

      {!open && talking && lastLine ? (
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
                  : "text-subtle",
            )}
          />
          <span className="mr-1 font-display italic text-accent">Lara</span>
          <span className="min-w-0 truncate">{lastLine}</span>
        </button>
      ) : null}

      {open ? (
        <>
          <button
            type="button"
            aria-label="Fechar Lara"
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
                  muted || face === "off" || face === "espera"
                    ? "text-subtle"
                    : face === "falando"
                      ? "text-accent"
                      : face === "processando"
                        ? "text-warn"
                        : "text-ok",
                )}
              />
              <p className="flex-1 font-display text-2xl italic text-fg">Lara</p>
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
              {turns.length === 0 ? (
                <p className="text-sm text-muted">
                  Toca em <span className="text-fg">Conversar</span> pra falar com a Lara.
                  Toca de novo pra encerrar. Só o XTE e o waypoint falam sozinhos.
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
            <div className="px-3 pb-2">
              <button
                type="button"
                onClick={() => toggleTalk()}
                className={cn(
                  "flex h-12 w-full items-center justify-center rounded-md text-sm font-medium tracking-[0.04em] transition-[background-color,color] duration-150 active:scale-[0.99]",
                  talking ? "bg-danger text-white" : "bg-accent text-accent-fg",
                )}
              >
                {talking ? "Encerrar conversa" : "Conversar com a Lara"}
              </button>
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
