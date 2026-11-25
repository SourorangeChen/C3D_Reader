import { useState } from "react";
import { Activity } from "lucide-react";
import { usePreferences } from "./Preferences";
import { SignalPlot } from "./SignalPlot";
import type { Acquisition, SeriesData, Selection } from "./types";

const AXIS_COLORS = ["var(--signal-x)", "var(--signal-y)", "var(--signal-z)"];
const ALL_AXES = [true, true, true];

/** Curve of the selected channel; point channels can hide X, Y or Z. */
export function SignalPanel({
  meta,
  selection,
  label,
  unit,
  series,
  error,
  time,
  onSeek,
}: {
  meta: Acquisition | null;
  selection: Selection;
  label: string;
  unit: string;
  series: SeriesData | null;
  error: string;
  time: number;
  onSeek: (time: number) => void;
}) {
  const { t } = usePreferences();
  const [axes, setAxes] = useState(ALL_AXES);
  const point = selection.kind === "point";
  return (
    <section className="signal-panel">
      <div className="signal-heading">
        <div>
          <Activity size={14} />
          <h2>{label || t("信号曲线")}</h2>
          <span>{unit || t("无单位")}</span>
        </div>
        <div className="axis-controls">
          {point ? (
            ["X", "Y", "Z"].map((a, i) => (
              <button
                key={a}
                className={axes[i] ? "active" : ""}
                aria-pressed={axes[i]}
                style={
                  { "--axis-color": AXIS_COLORS[i] } as React.CSSProperties
                }
                onClick={() =>
                  setAxes((old) => old.map((v, j) => (j === i ? !v : v)))
                }
              >
                <i />
                {a}
              </button>
            ))
          ) : (
            <span>{series?.sampleRate} Hz</span>
          )}
        </div>
      </div>
      {error ? (
        <div className="chart-error" role="alert">
          {t(error)}
        </div>
      ) : (
        <SignalPlot
          data={series}
          time={time}
          axes={point ? axes : ALL_AXES}
          events={meta?.events || []}
          onSeek={onSeek}
        />
      )}
      <div className="signal-footer">
        <span>{t("点击曲线定位帧")}</span>
        <span>
          {series?.method === "min-max envelope"
            ? t("保留极值的显示抽样 · CSV 保留全部采样点")
            : ""}
        </span>
      </div>
    </section>
  );
}
