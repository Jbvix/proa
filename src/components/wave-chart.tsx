import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyWave } from "@/lib/waves";
import { formatHour } from "@/lib/utils";

export function WaveChart({ rows }: { rows: HourlyWave[] }) {
  const data = rows.map((r) => ({
    t: r.t,
    label: formatHour(r.t),
    obs: r.hsObs,
    prev: r.hsForecast,
    amp: r.ampObs ?? r.ampForecast,
  }));

  if (data.length < 2) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-muted">
        Aguardando a primeira hora de registro.
      </div>
    );
  }

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="hsPrev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3d6d7a" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#3d6d7a" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="hsObs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7aa3b0" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#7aa3b0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(232,238,242,0.06)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#8b9aa6", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#8b9aa6", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            unit=" m"
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "#101c26",
              border: "1px solid #1e2e3a",
              borderRadius: 8,
              color: "#e8eef2",
              fontSize: 12,
            }}
            formatter={(value, name) => [
              value == null ? "—" : `${Number(value).toFixed(2)} m`,
              name === "obs" ? "Observado" : name === "prev" ? "Open-Meteo" : "Amplitude",
            ]}
          />
          <Area
            type="monotone"
            dataKey="prev"
            stroke="#3d6d7a"
            fill="url(#hsPrev)"
            strokeWidth={1.5}
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="obs"
            stroke="#7aa3b0"
            fill="url(#hsObs)"
            strokeWidth={2}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
