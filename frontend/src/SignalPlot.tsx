import { usePreferences } from "./Preferences";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { GaitEvent, SeriesData } from "./types";

const COLORS = ["var(--signal-x)", "var(--signal-y)", "var(--signal-z)"];
export const SignalPlot = memo(function SignalPlot({
  data,
  time,
  onSeek,
  events,
  axes,
}: {
  data: SeriesData | null;
  time: number;
  onSeek: (time: number) => void;
  events: GaitEvent[];
  axes: boolean[];
}) {
  const { resolvedTheme, t } = usePreferences();
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(185);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const o = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
      setHeight(entries[0].contentRect.height);
    });
    if (host.current) o.observe(host.current);
    return () => o.disconnect();
  }, []);
  const left = 60,
    right = 16,
    top = 12,
    bottom = 30;
  const plot = useMemo(() => {
    if (!data || !data.series.length) return null;
    const shown = data.series.filter((_, i) => axes[i % 3]);
    const values = shown.flatMap((s) =>
      s.values.filter((v): v is number => v != null && Number.isFinite(v)),
    );
    if (!values.length) return null;
    let min = Math.min(...values),
      max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const stepRaw = (max - min) / 3,
      mag = 10 ** Math.floor(Math.log10(stepRaw)),
      step = ([1, 2, 2.5, 5, 10].find((x) => x * mag >= stepRaw) || 10) * mag;
    const lo = Math.floor(min / step) * step,
      hi = Math.ceil(max / step) * step;
    const x = (t: number) =>
      left +
      ((t - data.start) / Math.max(0.001, data.stop - data.start)) *
        (width - left - right);
    // The tick range is already nonzero, including for constant signals.
    // A fixed lower bound here flattens small signals in source units (e.g. V)
    // and makes the curve disagree with its own tick labels.
    const y = (v: number) =>
      top + ((hi - v) / (hi - lo)) * (height - top - bottom);
    const ticks = [];
    for (let v = lo; v <= hi + step / 10; v += step) ticks.push(v);
    const paths = data.series.map((s) => {
      let gap = true;
      return s.values
        .map((v, i) => {
          if (v == null) {
            gap = true;
            return "";
          }
          const command = gap ? "M" : "L";
          gap = false;
          return `${command}${x(s.times[i]).toFixed(2)},${y(v).toFixed(2)}`;
        })
        .join("");
    });
    return { x, y, ticks, paths };
  }, [data, width, height, axes]);
  const seek = (e: React.PointerEvent) => {
    if (!data) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t =
      data.start +
      Math.max(
        0,
        Math.min(1, (e.clientX - r.left - left) / (width - left - right)),
      ) *
        (data.stop - data.start);
    onSeek(t);
  };
  return (
    <div className="signal-plot" ref={host}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t("同步信号曲线，横轴为相对时间（秒）")}
        onPointerDown={seek}
        onPointerMove={(e) => {
          if (!data) return;
          const r = e.currentTarget.getBoundingClientRect();
          setHover(
            data.start +
              Math.max(
                0,
                Math.min(
                  1,
                  (e.clientX - r.left - left) / (width - left - right),
                ),
              ) *
                (data.stop - data.start),
          );
          if (e.buttons === 1) seek(e);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {plot && data ? (
          <>
            {plot.ticks.map((v) => (
              <g key={v}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={plot.y(v)}
                  y2={plot.y(v)}
                  stroke="var(--chart-grid)"
                />
                <text
                  x={left - 10}
                  y={plot.y(v) + 4}
                  textAnchor="end"
                  fill="var(--muted)"
                  fontSize="11"
                >
                  {Math.abs(v) >= 10000 || (v !== 0 && Math.abs(v) < 0.001)
                    ? v.toExponential(1)
                    : Number(v.toPrecision(4))}
                </text>
              </g>
            ))}
            {[0, 1, 2, 3, 4].map((v) => {
              const t = data.start + ((data.stop - data.start) * v) / 4;
              return (
                <text
                  key={v}
                  x={plot.x(t)}
                  y={height - 8}
                  textAnchor={v === 0 ? "start" : v === 4 ? "end" : "middle"}
                  fill="var(--muted)"
                  fontSize="11"
                >
                  {t.toFixed(2)} s
                </text>
              );
            })}
            {events
              .filter((e) => e.time >= data.start && e.time <= data.stop)
              .map((event, i) => (
                <line
                  key={i}
                  x1={plot.x(event.time)}
                  x2={plot.x(event.time)}
                  y1={top}
                  y2={height - bottom}
                  stroke="#777780"
                  opacity=".32"
                  strokeDasharray="2 4"
                >
                  <title>
                    {event.context} {event.label} · {event.time.toFixed(3)} s
                  </title>
                </line>
              ))}
            {plot.paths.map(
              (d, i) =>
                axes[i % 3] && (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke={COLORS[i % 3]}
                    strokeWidth="1.6"
                  />
                ),
            )}
            <line
              x1={plot.x(Math.max(data.start, Math.min(data.stop, time)))}
              x2={plot.x(Math.max(data.start, Math.min(data.stop, time)))}
              y1="2"
              y2={height - bottom}
              stroke="var(--text)"
              strokeWidth="1"
            />
            <path
              d={`M${plot.x(time) - 3},1 L${plot.x(time) + 3},1 L${plot.x(time)},6 Z`}
              fill="var(--text)"
            />
            {hover != null && (
              <line
                x1={plot.x(hover)}
                x2={plot.x(hover)}
                y1={top}
                y2={height - bottom}
                stroke="#aaa"
                strokeDasharray="3 3"
              />
            )}
          </>
        ) : (
          <text x={width / 2} y="85" textAnchor="middle" fill="var(--muted)">
            {data ? t("当前区间没有有效信号") : t("正在读取信号…")}
          </text>
        )}
      </svg>
      {hover != null && data && (
        <div className="chart-tooltip">
          <span>{hover.toFixed(3)} s</span>
          {data.series.map((s, i) => {
            let lo = 0,
              hi = s.times.length - 1;
            while (lo < hi) {
              const mid = Math.floor((lo + hi) / 2);
              if (s.times[mid] < hover) lo = mid + 1;
              else hi = mid;
            }
            return (
              axes[i % 3] && (
                <span key={i} style={{ color: COLORS[i % 3] }}>
                  {s.name}{" "}
                  {s.values[lo] == null
                    ? "—"
                    : s.values[lo] !== 0 && Math.abs(s.values[lo]!) < 0.01
                      ? s.values[lo]!.toExponential(2)
                      : s.values[lo]!.toFixed(2)}{" "}
                  {s.unit}
                </span>
              )
            );
          })}
        </div>
      )}
    </div>
  );
});
