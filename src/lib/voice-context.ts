import { passageOf, speedHint } from "./passage";
import { planFloodArrival, phaseLabel } from "./tide";
import { fuelHint, recommendRpm } from "./rpm";
import { nearestPlaceAny, withCity } from "./places";
import { coastFix } from "./coastline";
import { weatherLabel } from "./meteo";
import { seaStateFromHs } from "./waves";
import { cardinal, formatDurationMin, formatEtaClock, formatLatLon } from "./utils";
import { xteSideLabel } from "./geo";
import type { EngineSnapshot } from "./sensor-engine";
import type { MeteoBundle } from "./meteo";
import type { ParsedRoute } from "./gpx";
import type { EngineProfile } from "./rpm";

export type VoiceTurn = { role: "user" | "assistant"; content: string };

export type VoiceContext = {
  telaAberta?: string;
  aviso: string;
  viagem: {
    nome: string | null;
    origem: string | null;
    destino: string | null;
    totalNm: number | null;
    feitoNm: number | null;
    faltaNm: number | null;
    progressoPct: number | null;
  };
  posicao: {
    lat: number | null;
    lon: number | null;
    latLon: string | null;
    costa: string | null;
    costaNome: string | null;
    costaNm: number | null;
    portoNm: number | null;
    rumoDeg: number | null;
    rumo: string | null;
    sogKn: number | null;
    sogValidacao: string | null;
    xteNm: number | null;
    xteLado: string | null;
  };
  waypoints: { nome: string; nm: number; hsPrev: number | null }[];
  mar: {
    hsCasco: number;
    ampM: number;
    tzS: number;
    ondasMin: number;
    estado: string;
    confiavel: boolean;
    hsPrev: number | null;
    tzPrev: number | null;
    swellPrev: number | null;
    balancoDeg: number | null;
  };
  meteo: {
    tempo: string;
    ventoKn: number | null;
    ventoDir: number | null;
    ventoCard: string | null;
    rajadaKn: number | null;
    correnteKn: number | null;
    correnteDir: number | null;
    correnteCard: string | null;
  };
  mare: {
    fase: string | null;
    m: number | null;
    eta: string | null;
    etaFalta: string | null;
    enchenteIdeal: string | null;
    sogAlvoKn: number | null;
    conselho: string | null;
  };
  rpm: {
    atual: number;
    faixa: string;
    min: number;
    max: number;
    centro: number;
    situacao: string;
    motivo: string;
    mar: string;
  };
  combustivel: {
    rpmSugerido: number;
    aFavor: string[];
    contra: string[];
    conselho: string;
  };
  captura: boolean;
  modo: string;
};

function clock(ms: number | null | undefined) {
  return ms != null ? formatEtaClock(ms) : null;
}

export function buildVoiceContext(opts: {
  engine: EngineSnapshot | null;
  meteo: MeteoBundle | null;
  route: ParsedRoute | null;
  rpm: number;
  profile: EngineProfile;
  tab?: string;
}): VoiceContext {
  const { engine, meteo, route, rpm, profile, tab } = opts;
  const passage = passageOf(route, engine);
  const plan = planFloodArrival(
    meteo?.tideHours ?? [],
    passage?.etaMs ?? null,
    passage?.remainNm ?? 0,
    passage?.sogKn ?? 0,
    9.2,
  );
  const heading = engine?.fix?.cogDeg ?? engine?.attitude?.heading ?? null;
  const stations = meteo?.alongRoute ?? [];
  const along =
    engine?.mode === "sim"
      ? engine.simNm
      : passage?.alongNm ?? 0;
  const nextWp =
    stations.find((s) => s.distNm >= along - 0.05) ?? stations[stations.length - 1] ?? null;
  const advice = recommendRpm({
    profile,
    currentRpm: rpm,
    hsM: engine?.wave.hsM ?? 0,
    periodS: engine?.wave.periodS ?? 0,
    windKn: meteo?.now.windKn ?? 0,
    headingDeg: heading,
    waveDirDeg: nextWp?.waveDir ?? meteo?.now.waveDir ?? null,
  });
  const fuel = fuelHint({
    advice,
    currentRpm: rpm,
    headingDeg: heading,
    windKn: meteo?.now.windKn ?? 0,
    windDir: meteo?.now.windDir ?? null,
    currentKn: meteo?.now.currentKn ?? null,
    currentDir: meteo?.now.currentDir ?? null,
    floodAdvice: plan.advice,
  });

  const fix = engine?.fix ?? null;
  const near = fix ? nearestPlaceAny(fix.lat, fix.lon) : null;
  const shore = fix ? coastFix(fix.lat, fix.lon) : null;
  const costa = shore?.phrase ?? null;

  const origin = route?.points[0] ?? null;
  const dest = route?.points.length ? route.points[route.points.length - 1]! : null;

  const wpts: VoiceContext["waypoints"] = [];
  if (origin) {
    wpts.push({
      nome: withCity(origin.lat, origin.lon, origin.name || "Origem"),
      nm: 0,
      hsPrev: stations[0]?.waveHs ?? null,
    });
  }
  for (const w of route?.waypoints ?? []) {
    if (wpts.length >= 8) break;
    const st = stations.find((s) => Math.abs(s.lat - w.lat) < 0.02 && Math.abs(s.lon - w.lon) < 0.02);
    wpts.push({
      nome: withCity(w.lat, w.lon, w.name),
      nm: Number((st?.distNm ?? 0).toFixed(1)),
      hsPrev: st?.waveHs ?? null,
    });
  }
  if (dest && nextWp) {
    const last = wpts[wpts.length - 1];
    const destName = withCity(dest.lat, dest.lon, dest.name || "Destino");
    if (!last || last.nome !== destName) {
      wpts.push({
        nome: destName,
        nm: Number((passage?.totalNm ?? stations[stations.length - 1]?.distNm ?? 0).toFixed(1)),
        hsPrev: stations[stations.length - 1]?.waveHs ?? null,
      });
    }
  }

  const hs = engine?.wave.hsM ?? 0;
  const sea = seaStateFromHs(hs);

  return {
    telaAberta: tab,
    aviso:
      "Contexto da VIAGEM INTEIRA (Painel, Ondas, Rota e RPM). A tela aberta não limita o que você sabe. Sempre use lat/lon + costa. Combustível = combustivel.conselho.",
    viagem: {
      nome: route?.name ?? null,
      origem: origin ? withCity(origin.lat, origin.lon, origin.name || "Origem") : null,
      destino: dest ? withCity(dest.lat, dest.lon, dest.name || "Destino") : null,
      totalNm: passage ? Number(passage.totalNm.toFixed(1)) : route?.distanceNm ?? null,
      feitoNm: passage ? Number(passage.alongNm.toFixed(1)) : null,
      faltaNm: passage ? Number(passage.remainNm.toFixed(1)) : null,
      progressoPct: passage ? Math.round(passage.progress * 100) : null,
    },
    posicao: {
      lat: fix ? Number(fix.lat.toFixed(5)) : null,
      lon: fix ? Number(fix.lon.toFixed(5)) : null,
      latLon: fix ? formatLatLon(fix.lat, fix.lon) : null,
      costa,
      costaNome: near?.name ?? null,
      costaNm: shore ? Number(shore.coastNm.toFixed(1)) : null,
      portoNm: near ? Number(near.nm.toFixed(1)) : null,
      rumoDeg: heading != null ? Math.round(heading) : null,
      rumo: heading != null ? `${String(Math.round(heading)).padStart(3, "0")}° ${cardinal(heading)}` : null,
      sogKn: passage?.sogKn ?? fix?.sogKn ?? null,
      sogValidacao: passage ? speedHint(passage) : null,
      xteNm: passage ? Number(passage.xteNm.toFixed(2)) : null,
      xteLado: passage ? xteSideLabel(passage.xteSide) : null,
    },
    waypoints: wpts.slice(0, 8),
    mar: {
      hsCasco: Number(hs.toFixed(2)),
      ampM: Number((engine?.wave.amplitudeM ?? 0).toFixed(2)),
      tzS: Number((engine?.wave.periodS ?? 0).toFixed(1)),
      ondasMin: Number((engine?.wave.perMin ?? 0).toFixed(1)),
      estado: sea.label,
      confiavel: !!engine?.wave.trusted,
      hsPrev: meteo?.now.waveHs ?? nextWp?.waveHs ?? null,
      tzPrev: meteo?.now.wavePeriod ?? nextWp?.wavePeriod ?? null,
      swellPrev: meteo?.now.swellHs ?? nextWp?.swellHs ?? null,
      balancoDeg: engine ? Number(engine.rollP2P.toFixed(1)) : null,
    },
    meteo: {
      tempo: weatherLabel(meteo?.now.weatherCode ?? null),
      ventoKn: meteo?.now.windKn ?? null,
      ventoDir: meteo?.now.windDir ?? null,
      ventoCard:
        meteo?.now.windDir != null
          ? `${Math.round(meteo.now.windDir)}° ${cardinal(meteo.now.windDir)}`
          : null,
      rajadaKn: meteo?.now.gustKn ?? null,
      correnteKn: meteo?.now.currentKn ?? null,
      correnteDir: meteo?.now.currentDir ?? null,
      correnteCard:
        meteo?.now.currentDir != null
          ? `${Math.round(meteo.now.currentDir)}° ${cardinal(meteo.now.currentDir)}`
          : null,
    },
    mare: {
      fase: plan.atEta ? phaseLabel(plan.atEta.phase) : null,
      m: plan.atEta ? Number(plan.atEta.seaM.toFixed(2)) : null,
      eta: clock(passage?.etaMs),
      etaFalta: passage?.etaMin != null ? formatDurationMin(passage.etaMin) : null,
      enchenteIdeal: clock(plan.idealEtaMs),
      sogAlvoKn: plan.targetKn != null ? Number(plan.targetKn.toFixed(1)) : null,
      conselho: plan.advice,
    },
    rpm: {
      atual: rpm,
      faixa: `${advice.min}–${advice.max} rpm`,
      min: advice.min,
      max: advice.max,
      centro: advice.center,
      situacao: advice.label,
      motivo: advice.reason,
      mar: advice.sea,
    },
    combustivel: {
      rpmSugerido: fuel.rpmSugerido,
      aFavor: fuel.aFavor,
      contra: fuel.contra,
      conselho: fuel.conselho,
    },
    captura: !!engine?.capturing,
    modo: engine?.mode ?? "idle",
  };
}
