import { useEffect, useRef, useState } from "react";
import type { CircleMarker, Map as LeafletMap, Marker, Polyline } from "leaflet";
import type { ParsedRoute } from "@/lib/gpx";
import type { RouteStation } from "@/lib/meteo";
import { formatLatLon, pad3 } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  route: ParsedRoute | null;
  lat?: number | null;
  lon?: number | null;
  cog?: number | null;
  sogKn?: number | null;
  perMin?: number | null;
  stations?: RouteStation[];
  className?: string;
};

export function NauticalMap({
  route,
  lat,
  lon,
  cog,
  sogKn,
  perMin,
  stations,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const trackRef = useRef<Polyline | null>(null);
  const tugRef = useRef<Marker | null>(null);
  const wpRef = useRef<CircleMarker[]>([]);
  const fitted = useRef("");
  const [ready, setReady] = useState(false);

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
          attribution: "Tiles &copy; Esri &mdash; GEBCO, NOAA, National Geographic",
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
      wpRef.current = [];
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
      if (pts.length >= 2) {
        const latlngs = pts.map((p) => [p.lat, p.lon] as [number, number]);
        trackRef.current = L.polyline(latlngs, {
          color: "#d7e4ea",
          weight: 5,
          opacity: 1,
        }).addTo(map);
        const key = route?.source ?? `${pts.length}`;
        if (fitted.current !== key) {
          map.fitBounds(trackRef.current.getBounds(), {
            padding: [28, 28],
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
      for (const m of wpRef.current) m.remove();
      wpRef.current = [];
      for (const s of stations ?? []) {
        const mark = L.circleMarker([s.lat, s.lon], {
          radius: 5,
          color: "#c4a36a",
          weight: 2,
          fillColor: "#c4a36a",
          fillOpacity: 0.85,
        }).addTo(map);
        mark.bindTooltip(
          `${s.label}${s.waveHs != null ? ` · Hs ${s.waveHs.toFixed(1)} m` : ""}`,
          { direction: "top" },
        );
        wpRef.current.push(mark);
      }
    });
  }, [stations, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || lat == null || lon == null) return;
    void import("leaflet").then(({ default: L }) => {
      const rot = cog ?? 0;
      const html = `<div class="tug-marker-inner" style="transform:rotate(${rot}deg)"></div>`;
      const icon = L.divIcon({
        className: "tug-marker",
        html,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      if (!tugRef.current) {
        tugRef.current = L.marker([lat, lon], { icon, zIndexOffset: 600 }).addTo(map);
      } else {
        tugRef.current.setLatLng([lat, lon]);
        tugRef.current.setIcon(icon);
      }
    });
  }, [lat, lon, cog, ready]);

  const hasFix = lat != null && lon != null;

  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-bg", className)}>
      <div ref={hostRef} className="absolute inset-0 z-0" />
      <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[min(100%-1.5rem,18rem)] rounded-md bg-bg/80 px-3 py-2 text-fg shadow-[var(--shadow-border)] backdrop-blur-sm">
        <p className="font-mono text-lg tabular leading-none">
          {sogKn != null ? sogKn.toFixed(1) : "—"}
          <span className="ml-1 text-xs text-muted">kn</span>
        </p>
        <p className="mt-1 font-mono text-xs tabular text-muted">
          {hasFix ? formatLatLon(lat, lon) : "Sem fixo"}
          {cog != null ? ` · ${pad3(cog)}°` : ""}
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
