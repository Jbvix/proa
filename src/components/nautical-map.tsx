import { useEffect, useMemo, useRef, useState } from "react";
import type { CircleMarker, Map as LeafletMap, Marker, Polyline } from "leaflet";
import type { ParsedRoute } from "@/lib/gpx";
import type { RouteStation } from "@/lib/meteo";
import { routeMapMarks, shouldLabelMark } from "@/lib/places";
import { formatLatLon, pad3 } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  route: ParsedRoute | null;
  lat?: number | null;
  lon?: number | null;
  cog?: number | null;
  sogKn?: number | null;
  speedValid?: boolean;
  perMin?: number | null;
  etaLabel?: string | null;
  tideLabel?: string | null;
  coastLabel?: string | null;
  stations?: RouteStation[];
  className?: string;
};

function cssColor(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function NauticalMap({
  route,
  lat,
  lon,
  cog,
  sogKn,
  speedValid,
  perMin,
  etaLabel,
  tideLabel,
  coastLabel,
  stations,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const trackRef = useRef<Polyline | null>(null);
  const tugRef = useRef<Marker | null>(null);
  const destRef = useRef<CircleMarker | null>(null);
  const markRef = useRef<CircleMarker[]>([]);
  const fitted = useRef("");
  const [ready, setReady] = useState(false);
  const marks = useMemo(() => routeMapMarks(route, stations), [route, stations]);

  useEffect(() => {
    let dead = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (dead || !hostRef.current || mapRef.current) return;

      const map = L.map(hostRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([-3.72, -38.52], 10);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Tiles &copy; Esri — GEBCO, NOAA, National Geographic",
          maxZoom: 16,
        },
      ).addTo(map);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16 },
      ).addTo(map);
      L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);
      mapRef.current = map;
      requestAnimationFrame(() => map.invalidateSize());
      window.setTimeout(() => map.invalidateSize(), 300);
      if (!dead) setReady(true);
    })();
    return () => {
      dead = true;
      setReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
      trackRef.current = null;
      tugRef.current = null;
      destRef.current = null;
      markRef.current = [];
      fitted.current = "";
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    void import("leaflet").then(({ default: L }) => {
      const pts = route?.points ?? [];
      if (trackRef.current) {
        trackRef.current.remove();
        trackRef.current = null;
      }
      if (destRef.current) {
        destRef.current.remove();
        destRef.current = null;
      }
      if (pts.length >= 2) {
        const latlngs = pts.map((p) => [p.lat, p.lon] as [number, number]);
        const accent = cssColor("--color-accent", "#7aa3b0");
        trackRef.current = L.polyline(latlngs, {
          color: accent,
          weight: 5,
          opacity: 0.95,
        }).addTo(map);
        const dest = pts[pts.length - 1]!;
        destRef.current = L.circleMarker([dest.lat, dest.lon], {
          radius: 8,
          color: cssColor("--color-fg", "#e8eef2"),
          weight: 2,
          fillColor: accent,
          fillOpacity: 1,
        }).addTo(map);
        const key = route?.source ?? `${pts.length}`;
        if (fitted.current !== key) {
          map.fitBounds(trackRef.current.getBounds(), {
            padding: [36, 36],
            maxZoom: 13,
          });
          fitted.current = key;
        }
      }
      map.invalidateSize();
    });
  }, [route, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    void import("leaflet").then(({ default: L }) => {
      for (const m of markRef.current) m.remove();
      markRef.current = [];
      const fg = cssColor("--color-fg", "#e8eef2");
      const accent = cssColor("--color-accent", "#7aa3b0");
      const warn = cssColor("--color-warn", "#c4a36a");
      for (const s of marks) {
        const fill =
          s.kind === "origin" || s.kind === "dest"
            ? accent
            : s.kind === "wpt"
              ? fg
              : warn;
        const named = shouldLabelMark(s, marks, lat, lon);
        const mark = L.circleMarker([s.lat, s.lon], {
          radius: named ? 7 : 5,
          color: fg,
          weight: 1.5,
          fillColor: fill,
          fillOpacity: 0.95,
        }).addTo(map);
        mark.bindPopup(s.title, { closeButton: false, className: "wp-label" });
        if (named) {
          mark.bindTooltip(s.title, {
            permanent: true,
            direction: "right",
            offset: [12, 0],
            opacity: 1,
            className: "wp-label",
          });
        }
        markRef.current.push(mark);
      }
    });
  }, [marks, ready, lat, lon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || lat == null || lon == null) return;
    void import("leaflet").then(({ default: L }) => {
      const rot = cog ?? 0;
      const html = `<div class="tug-wrap"><span class="tug-halo"></span><span class="tug-marker-inner" style="transform:rotate(${rot}deg)"></span></div>`;
      const icon = L.divIcon({
        className: "tug-marker",
        html,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      if (!tugRef.current) {
        tugRef.current = L.marker([lat, lon], { icon, zIndexOffset: 800 })
          .bindTooltip("Rebocador", { direction: "right", offset: [12, 0] })
          .addTo(map);
        if (!route?.points.length) map.setView([lat, lon], 11);
      } else {
        tugRef.current.setLatLng([lat, lon]);
        tugRef.current.setIcon(icon);
      }
      const padded = map.getBounds().pad(-0.18);
      if (!padded.contains([lat, lon])) {
        map.panTo([lat, lon], { animate: true, duration: 0.4 });
      }
    });
  }, [lat, lon, cog, ready, route]);

  const hasFix = lat != null && lon != null;

  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-bg", className)}>
      <div ref={hostRef} className="absolute inset-0 z-0" />
      <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[min(100%-1.5rem,20rem)] rounded-md bg-bg/80 px-3 py-2 text-fg shadow-[var(--shadow-border)] backdrop-blur-sm">
        <p className="font-mono text-lg tabular leading-none">
          {sogKn != null ? sogKn.toFixed(1) : "—"}
          <span className="ml-1 text-xs text-muted">nós</span>
          {speedValid ? (
            <span className="ml-2 text-[11px] uppercase tracking-[0.12em] text-ok">
              validada
            </span>
          ) : null}
        </p>
        <p className="mt-1 font-mono text-xs tabular text-muted">
          {hasFix ? formatLatLon(lat, lon) : "Sem fixo"}
          {cog != null ? ` · ${pad3(cog)}°` : ""}
        </p>
        {coastLabel ? (
          <p className="mt-1 text-xs text-subtle">{coastLabel}</p>
        ) : null}
        <p className="mt-1 text-xs text-subtle">
          ETA {etaLabel ?? "—"}
          {tideLabel ? ` · ${tideLabel}` : ""}
        </p>
        <p className="mt-1 text-xs text-subtle">
          {perMin != null && perMin > 0
            ? `${perMin.toFixed(1)} ondas/min`
            : "ondas/min —"}
        </p>
      </div>
    </div>
  );
}
