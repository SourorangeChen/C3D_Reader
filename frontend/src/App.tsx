import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Box,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Download,
  Eye,
  EyeOff,
  File,
  FolderOpen,
  Info,
  Layers,
  List,
  Maximize2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings2,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { Viewer } from "./Viewer";
import { SignalPlot } from "./SignalPlot";
import { useFrames } from "./useFrames";
import { api, formatBytes, isVirtual } from "./types";
import type {
  Acquisition,
  Library,
  ParameterGroup,
  Selection,
  SeriesData,
} from "./types";

const countFormat = new Intl.NumberFormat("en");
const kindName: Record<string, string> = {
  marker: "标记点",
  angle: "关节角度",
  force: "力",
  moment: "力矩",
  power: "功率",
  scalar: "标量",
};

function Mark() {
  return (
    <svg
      width="27"
      height="27"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 21L11 12L20 6M11 12L21 17"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="7" cy="21" r="2.3" fill="#4a8ad6" />
      <circle cx="11" cy="12" r="2.3" fill="currentColor" />
      <circle cx="20" cy="6" r="2.3" fill="currentColor" />
      <circle cx="21" cy="17" r="2.3" fill="currentColor" />
    </svg>
  );
}
function IconButton({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [meta, setMeta] = useState<Acquisition | null>(null);
  const [selection, setSelection] = useState<Selection>({
    kind: "point",
    id: 0,
  });
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [roi, setRoi] = useState<[number, number]>([0, 0]);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [segments, setSegments] = useState(true);
  const [trails, setTrails] = useState(false);
  const [labels, setLabels] = useState(false);
  const [virtual, setVirtual] = useState(false);
  const [view, setView] = useState("perspective");
  const [up, setUp] = useState<"Z" | "Y">("Z");
  const [tab, setTab] = useState("marker");
  const [search, setSearch] = useState("");
  const [inspector, setInspector] = useState("info");
  const [params, setParams] = useState<ParameterGroup[] | null>(null);
  const [series, setSeries] = useState<SeriesData | null>(null);
  const [seriesError, setSeriesError] = useState("");
  const [axes, setAxes] = useState([true, true, true]);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"folder" | "help" | "export" | null>(null);
  const [folder, setFolder] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [showLibrary, setShowLibrary] = useState(true);
  const [showInspector, setShowInspector] = useState(
    () => window.innerWidth >= 1000,
  );
  const loadVersion = useRef(0);
  const { points, error: frameError } = useFrames(meta, frame);
  const currentPoint =
    selection.kind === "point" ? meta?.points[selection.id] : null;
  const currentAnalog =
    selection.kind === "analog" ? meta?.analogs[selection.id] : null;
  const selectedLabel = currentPoint?.label || currentAnalog?.label || "";
  const selectedUnit = currentPoint?.unit || currentAnalog?.unit || "";
  const clock = meta ? frame / meta.pointRate : 0;
  const lastTime = meta ? (meta.frameCount - 1) / meta.pointRate : 0;
  const openFile = useCallback(async (id: string) => {
    const version = ++loadVersion.current;
    setPlaying(false);
    setLoading("正在读取 C3D…");
    setError("");
    try {
      const data = await api<Acquisition>(`/api/files/${id}`);
      if (version !== loadVersion.current) return;
      setMeta(data);
      setFrame(0);
      setRoi([0, data.frameCount - 1]);
      setParams(null);
      setSeries(null);
      setSeriesError("");
      setSearch("");
      setTab("marker");
      setVirtual(false);
      setHidden(new Set(data.points.filter(isVirtual).map((p) => p.id)));
      const preferred =
        data.points.find((p) => p.label.endsWith("LANK")) ||
        data.points.find((p) => p.kind === "marker" && !isVirtual(p)) ||
        data.points[0];
      setSelection({
        kind: preferred ? "point" : "analog",
        id: preferred?.id || 0,
      });
      if (window.innerWidth < 1000) setShowLibrary(false);
    } catch (e) {
      if (version === loadVersion.current) setError((e as Error).message);
    } finally {
      if (version === loadVersion.current) setLoading("");
    }
  }, []);
  useEffect(() => {
    void api<Library>("/api/library")
      .then((data) => {
        setLibrary(data);
        setFolder(data.folder);
        const initial =
          data.files.find((f) => /^WT0/i.test(f.name)) ||
          data.files[0] ||
          data.demo;
        void openFile(initial.id);
      })
      .catch((e) => setError(e.message));
  }, [openFile]);
  useEffect(() => {
    if (!meta) return;
    const controller = new AbortController();
    setSeries(null);
    setSeriesError("");
    void api<SeriesData>(
      `/api/files/${meta.id}/series?kind=${selection.kind}&ids=${selection.id}&start=${roi[0]}&stop=${roi[1] + 1}&limit=900`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setSeries(data);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setSeriesError(e.message);
      });
    return () => controller.abort();
  }, [meta, selection, roi]);
  useEffect(() => {
    if (inspector !== "parameters" || !meta || params) return;
    const controller = new AbortController();
    void api<ParameterGroup[]>(`/api/files/${meta.id}/parameters`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setParams(data);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [inspector, meta, params]);
  useEffect(() => {
    if (!playing || !meta || !points) return;
    let handle = 0;
    const start = performance.now(),
      initial = frame;
    const tick = (now: number) => {
      const next =
        initial + Math.floor(((now - start) / 1000) * meta.pointRate * speed);
      if (next > roi[1]) {
        if (loop) setFrame(roi[0] + ((next - roi[0]) % (roi[1] - roi[0] + 1)));
        else {
          setFrame(roi[1]);
          setPlaying(false);
          return;
        }
      } else setFrame(next);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
    // Restart the clock only on a chunk boundary or playback change.
  }, [playing, meta, speed, loop, roi, Math.floor(frame / 500), !!points]);
  const seek = useCallback(
    (index: number) => {
      if (meta) setFrame(Math.max(roi[0], Math.min(roi[1], index)));
    },
    [meta, roi],
  );
  const togglePlay = useCallback(() => {
    if (!meta) return;
    if (frame >= roi[1]) setFrame(roi[0]);
    setPlaying((p) => !p);
  }, [meta, frame, roi]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        modal ||
        !meta ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
      if (e.code === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        seek(frame + (e.shiftKey ? 10 : 1));
      }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        seek(frame - (e.shiftKey ? 10 : 1));
      }
      if (e.code === "Home") {
        e.preventDefault();
        seek(roi[0]);
      }
      if (e.code === "End") {
        e.preventDefault();
        seek(roi[1]);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [meta, frame, roi, seek, togglePlay, modal]);
  useEffect(() => {
    if (!modal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modal]);
  const toggleHidden = (id: number) =>
    setHidden((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pickPoint = (id: number) => {
    setSelection({ kind: "point", id });
    if (meta?.points[id].kind === "marker") setTab("marker");
    else setTab("model");
  };
  const toggleVirtual = () => {
    setVirtual((v) => !v);
    setHidden((old) => {
      const next = new Set(old);
      meta?.points.filter(isVirtual).forEach((p) => {
        if (!virtual) next.delete(p.id);
        else next.add(p.id);
      });
      return next;
    });
  };
  const saveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading("正在扫描文件夹…");
    try {
      const data = await api<Library>("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: folder }),
      });
      setLibrary(data);
      setModal(null);
      if (data.files.length) void openFile(data.files[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading("");
    }
  };
  const visiblePoints =
    meta?.points.filter(
      (p) =>
        (tab === "marker"
          ? p.kind === "marker" && (virtual || !isVirtual(p))
          : p.kind !== "marker") &&
        p.label.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  const visibleAnalogs =
    meta?.analogs.filter((p) =>
      p.label.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  const markerCount =
    meta?.points.filter((p) => p.kind === "marker" && !isVirtual(p)).length ||
    0;
  const modelCount =
    meta?.points.filter((p) => p.kind !== "marker").length || 0;
  const updateRoi = (a: number, b: number) => {
    if (!meta || !Number.isFinite(a + b)) return;
    a = Math.max(0, Math.min(meta.frameCount - 1, Math.round(a)));
    b = Math.max(a, Math.min(meta.frameCount - 1, Math.round(b)));
    setRoi([a, b]);
    setFrame((f) => Math.max(a, Math.min(b, f)));
    setPlaying(false);
  };
  return (
    <div className="app" data-theme="dark">
      <header className="app-header">
        <div className="brand">
          <Mark />
          <span>
            C3D <strong>Reader</strong>
          </span>
          <span className="version">0.1</span>
        </div>
        <div className="workspace-name">
          Motion workspace <span className="header-slash">/</span>{" "}
          <span>动作数据工作台</span>
        </div>
        <div className="header-actions">
          <span className="local-status">
            <span />
            本地运行
          </span>
          <button
            className="button"
            onClick={() => {
              setError("");
              setModal("folder");
            }}
          >
            <FolderOpen size={15} />
            打开文件夹
          </button>
          <IconButton label="使用帮助" onClick={() => setModal("help")}>
            <CircleHelp size={17} />
          </IconButton>
        </div>
      </header>
      <div
        className={`app-body ${showLibrary ? "" : "hide-library"} ${showInspector ? "" : "hide-inspector"}`}
      >
        <nav className="rail" aria-label="工作区面板">
          <div className="rail-top">
            <IconButton
              label="文件与通道"
              onClick={() => setShowLibrary((v) => !v)}
              active={showLibrary}
            >
              <Layers size={19} />
            </IconButton>
            <IconButton
              label="采集信息"
              onClick={() => {
                setShowInspector(true);
                setInspector("info");
              }}
              active={showInspector && inspector === "info"}
            >
              <Info size={19} />
            </IconButton>
            <IconButton
              label="事件列表"
              onClick={() => {
                setShowInspector(true);
                setInspector("events");
              }}
              active={showInspector && inspector === "events"}
            >
              <List size={19} />
            </IconButton>
            <IconButton
              label="C3D 参数"
              onClick={() => {
                setShowInspector(true);
                setInspector("parameters");
              }}
              active={showInspector && inspector === "parameters"}
            >
              <Braces size={19} />
            </IconButton>
          </div>
          <div className="rail-bottom">
            <IconButton label="使用帮助" onClick={() => setModal("help")}>
              <CircleHelp size={18} />
            </IconButton>
          </div>
        </nav>
        <aside className="explorer" aria-label="文件与通道">
          <div className="panel-heading">
            <h2>采集文件</h2>
            <span>{library?.files.length || 0}</span>
            <IconButton
              label="刷新文件夹"
              onClick={() => {
                void api<Library>("/api/library")
                  .then(setLibrary)
                  .catch((e) => setError(e.message));
              }}
            >
              <RefreshCw size={13} />
            </IconButton>
          </div>
          <button
            className="folder-label"
            title={library?.folder || "未选择文件夹"}
            onClick={() => setModal("folder")}
          >
            <FolderOpen size={14} />
            <span>
              {library?.folder.split("/").filter(Boolean).at(-1) ||
                "选择数据文件夹"}
            </span>
            <ChevronDown size={12} />
          </button>
          <div className="file-search">
            <Search size={12} />
            <input
              aria-label="搜索文件"
              placeholder="搜索采集文件"
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
            />
          </div>
          <div className="file-list">
            {library?.files
              .filter((f) =>
                f.name.toLowerCase().includes(fileSearch.toLowerCase()),
              )
              .map((f) => (
                <button
                  className={`file-row ${meta?.id === f.id ? "selected" : ""}`}
                  key={f.id}
                  onClick={() => void openFile(f.id)}
                >
                  <File size={13} />
                  <span>{f.name}</span>
                  <small>{formatBytes(f.size)}</small>
                </button>
              ))}
            {library && !library.files.length && (
              <p className="empty-copy">
                {library.folder && !library.available
                  ? "数据硬盘未连接，请重新挂载或选择文件夹。"
                  : "打开包含 .c3d 文件的本地文件夹。"}
              </p>
            )}
          </div>
          <button
            className={`demo-row ${meta?.id === "demo" ? "selected" : ""}`}
            onClick={() => void openFile("demo")}
          >
            <Activity size={13} />
            <span>合成步行示例</span>
            <span className="tiny-note">Demo</span>
          </button>
          <div className="panel-heading channel-heading">
            <h2>采集通道</h2>
            <span>{meta ? meta.points.length + meta.analogs.length : "—"}</span>
          </div>
          <div
            className="tabs channel-tabs"
            role="tablist"
            aria-label="通道类型"
          >
            {[
              ["marker", "标记点", markerCount],
              ["model", "模型", modelCount],
              ["analog", "模拟", meta?.analogs.length || 0],
            ].map(([id, label, n]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "active" : ""}
                onClick={() => {
                  setTab(String(id));
                  setSearch("");
                }}
              >
                {label}
                <span>{n}</span>
              </button>
            ))}
          </div>
          <div className="channel-search">
            <Search size={14} />
            <input
              aria-label="搜索通道"
              placeholder={
                tab === "analog" ? "搜索力、EMG、IMU…" : "搜索标记点或模型输出…"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="clear-search"
                aria-label="清除搜索"
                onClick={() => setSearch("")}
              >
                <X size={12} />
              </button>
            )}
          </div>
          {tab === "marker" && (
            <label className="virtual-toggle">
              <input
                type="checkbox"
                checked={virtual}
                onChange={toggleVirtual}
              />
              显示 Vicon 模型坐标点
            </label>
          )}
          <div className="channel-list">
            {tab === "analog"
              ? visibleAnalogs.map((p) => (
                  <button
                    key={p.id}
                    className={`channel-row ${selection.kind === "analog" && selection.id === p.id ? "selected" : ""}`}
                    onClick={() => setSelection({ kind: "analog", id: p.id })}
                  >
                    <Activity size={12} />
                    <span>{p.label}</span>
                    <small>{p.unit || "—"}</small>
                  </button>
                ))
              : visiblePoints.map((p) => (
                  <div
                    className={`channel-row ${selection.kind === "point" && selection.id === p.id ? "selected" : ""}`}
                    key={p.id}
                  >
                    {p.kind === "marker" ? (
                      <button
                        className="visibility-button"
                        title={hidden.has(p.id) ? "显示标记点" : "隐藏标记点"}
                        aria-label={`${hidden.has(p.id) ? "显示" : "隐藏"} ${p.label}`}
                        onClick={() => toggleHidden(p.id)}
                      >
                        {hidden.has(p.id) ? (
                          <EyeOff size={12} />
                        ) : (
                          <Eye size={12} />
                        )}
                      </button>
                    ) : (
                      <Activity size={12} />
                    )}
                    <button
                      className="channel-name"
                      onClick={() => pickPoint(p.id)}
                    >
                      {p.label}
                    </button>
                    <small>{p.unit}</small>
                  </div>
                ))}
            {meta &&
              (tab === "analog"
                ? visibleAnalogs.length
                : visiblePoints.length) === 0 && (
                <p className="empty-copy">没有匹配的通道。</p>
              )}
          </div>
          <div className="explorer-footer">
            <span className="live-dot" />
            只读访问 · 原始文件保持完整
          </div>
        </aside>
        <main className="workspace">
          <div className="trial-header">
            <div className="trial-title">
              <div className="breadcrumb">
                <span>采集</span>
                <ChevronRight size={12} />
                <span>
                  {meta?.id === "demo"
                    ? "合成示例"
                    : meta?.manufacturer || "C3D"}
                </span>
              </div>
              <h1>
                {meta?.id === "demo"
                  ? "Synthetic walking"
                  : meta?.name || "C3D Reader"}
              </h1>
            </div>
            <button
              className="button export-button"
              disabled={!meta}
              onClick={() => setModal("export")}
            >
              <Download size={14} />
              <span>导出 CSV</span>
            </button>
          </div>
          <div className="trial-stats">
            <span>
              <strong>
                {meta ? countFormat.format(meta.frameCount) : "—"}
              </strong>
              帧
            </span>
            <span>
              <strong>{meta?.pointRate ?? "—"}</strong>Hz 标记点
            </span>
            <span>
              <strong>
                {meta ? countFormat.format(meta.analogRate) : "—"}
              </strong>
              Hz 模拟信号
            </span>
            <span>
              <strong>{meta?.duration.toFixed(2) ?? "—"}</strong>s 时长
            </span>
            <span className="storage-note">
              {meta?.id === "demo"
                ? "合成数据"
                : meta
                  ? `${formatBytes(meta.size)} · 分块读取`
                  : ""}
            </span>
          </div>
          {(error || frameError) && !modal && (
            <div className="error-banner" role="alert">
              <span>{error || frameError}</span>
              <button
                className="icon-button"
                aria-label="关闭错误提示"
                onClick={() => setError("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <section className="scene-panel" aria-label="三维视图">
            <div className="scene-toolbar">
              <div className="toolbar-group">
                <Box size={14} />
                <select
                  aria-label="视角"
                  value={view}
                  onChange={(e) => setView(e.target.value)}
                >
                  <option value="perspective">透视视图</option>
                  <option value="front">正面视图</option>
                  <option value="side">侧面视图</option>
                  <option value="top">俯视视图</option>
                </select>
              </div>
              <div className="toolbar-toggles">
                <button
                  className={segments ? "active" : ""}
                  aria-pressed={segments}
                  onClick={() => setSegments((v) => !v)}
                >
                  连线
                </button>
                <button
                  className={trails ? "active" : ""}
                  aria-pressed={trails}
                  onClick={() => setTrails((v) => !v)}
                >
                  轨迹
                </button>
                <button
                  className={labels ? "active" : ""}
                  aria-pressed={labels}
                  onClick={() => setLabels((v) => !v)}
                >
                  标签
                </button>
                <select
                  aria-label="地面向上轴"
                  value={up}
                  onChange={(e) => setUp(e.target.value as "Z" | "Y")}
                >
                  <option value="Z">Z ↑</option>
                  <option value="Y">Y ↑</option>
                </select>
                <IconButton
                  label="切换信息面板"
                  onClick={() => setShowInspector((v) => !v)}
                >
                  <Maximize2 size={13} />
                </IconButton>
              </div>
            </div>
            {meta ? (
              <Viewer
                meta={meta}
                frame={frame}
                points={points}
                selected={currentPoint?.kind === "marker" ? selection.id : null}
                hidden={hidden}
                segments={segments}
                trails={trails}
                labels={labels}
                view={view}
                up={up}
                onSelect={pickPoint}
              />
            ) : (
              <div className="viewer-placeholder">
                选择一个 C3D 文件开始查看
              </div>
            )}
            <div className="scene-legend">
              <span>
                <i className="dot left" />
                左侧标记点
              </span>
              <span>
                <i className="dot right" />
                右侧 / 其他
              </span>
              <span className="scene-footnote">
                {meta?.plates.length
                  ? `${meta.plates.length} 块力台轮廓 · `
                  : ""}
                连线为标签推断
              </span>
            </div>
          </section>
          <section className="signal-panel">
            <div className="signal-heading">
              <div>
                <Activity size={14} />
                <h2>{selectedLabel || "信号曲线"}</h2>
                <span>{selectedUnit || "无单位"}</span>
              </div>
              <div className="axis-controls">
                {selection.kind === "point" ? (
                  ["X", "Y", "Z"].map((a, i) => (
                    <button
                      key={a}
                      className={axes[i] ? "active" : ""}
                      aria-pressed={axes[i]}
                      style={
                        {
                          "--axis-color": ["#4a8ad6", "#c2c5cc", "#d9a441"][i],
                        } as React.CSSProperties
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
            {seriesError ? (
              <div className="chart-error" role="alert">
                {seriesError}
              </div>
            ) : (
              <SignalPlot
                data={series}
                time={clock}
                axes={selection.kind === "point" ? axes : [true, true, true]}
                events={meta?.events || []}
                onSeek={(time) => {
                  if (meta) {
                    setPlaying(false);
                    seek(Math.round(time * meta.pointRate));
                  }
                }}
              />
            )}
            <div className="signal-footer">
              <span>点击曲线定位帧</span>
              <span>
                {series?.method === "min-max envelope"
                  ? "保留极值的显示抽样 · CSV 保留全部采样点"
                  : ""}
              </span>
            </div>
          </section>
          <section className="timeline-panel" aria-label="播放时间轴">
            <div className="playback-controls">
              <div className="transport">
                <IconButton
                  label="跳至区间开头"
                  onClick={() => {
                    setPlaying(false);
                    seek(roi[0]);
                  }}
                  disabled={!meta}
                >
                  <ChevronsLeft size={16} />
                </IconButton>
                <IconButton
                  label="上一帧"
                  onClick={() => {
                    setPlaying(false);
                    seek(frame - 1);
                  }}
                  disabled={!meta}
                >
                  <SkipBack size={15} />
                </IconButton>
                <button
                  className="play-button"
                  aria-label={playing ? "暂停" : "播放"}
                  disabled={!meta}
                  onClick={togglePlay}
                >
                  {playing ? (
                    <Pause size={15} fill="currentColor" />
                  ) : (
                    <Play size={15} fill="currentColor" />
                  )}
                </button>
                <IconButton
                  label="下一帧"
                  onClick={() => {
                    setPlaying(false);
                    seek(frame + 1);
                  }}
                  disabled={!meta}
                >
                  <SkipForward size={15} />
                </IconButton>
                <IconButton
                  label="跳至区间末尾"
                  onClick={() => {
                    setPlaying(false);
                    seek(roi[1]);
                  }}
                  disabled={!meta}
                >
                  <ChevronsRight size={16} />
                </IconButton>
                <select
                  aria-label="播放速度"
                  value={speed}
                  onChange={(e) => setSpeed(+e.target.value)}
                >
                  {[0.1, 0.25, 0.5, 1, 2].map((v) => (
                    <option key={v} value={v}>
                      {v}×
                    </option>
                  ))}
                </select>
                <button
                  className={`text-toggle ${loop ? "active" : ""}`}
                  onClick={() => setLoop((v) => !v)}
                  aria-pressed={loop}
                >
                  循环
                </button>
              </div>
              <div className="time-readout">
                <strong>
                  {clock.toFixed(3)} <small>s</small>
                </strong>
                <span>/ {lastTime.toFixed(3)} s</span>
              </div>
              <div className="frame-readout">
                <span>帧</span>
                <input
                  aria-label="当前帧"
                  type="number"
                  min={meta ? roi[0] + meta.firstFrame : 0}
                  max={meta ? roi[1] + meta.firstFrame : 0}
                  value={meta ? meta.firstFrame + frame : 0}
                  onChange={(e) => {
                    if (meta) {
                      setPlaying(false);
                      seek(+e.target.value - meta.firstFrame);
                    }
                  }}
                />
                <span>/ {meta?.lastFrame || "—"}</span>
              </div>
            </div>
            <div className="scrubber">
              <div className="event-ticks">
                {meta?.events
                  .filter((e) => e.time >= 0 && e.time <= lastTime)
                  .map((e, i) => (
                    <button
                      key={i}
                      className={`event-tick ${e.context === "Left" ? "left" : ""}`}
                      style={{
                        left: `${(e.time / Math.max(0.001, lastTime)) * 100}%`,
                      }}
                      aria-label={`${e.context} ${e.label}，帧 ${e.frame}`}
                      title={`${e.context} ${e.label} · 帧 ${e.frame}`}
                      onClick={() => {
                        setPlaying(false);
                        seek(e.frame - meta.firstFrame);
                      }}
                    />
                  ))}
              </div>
              <input
                aria-label="时间轴"
                type="range"
                min={0}
                max={meta?.frameCount ? meta.frameCount - 1 : 1}
                value={frame}
                onChange={(e) => {
                  setPlaying(false);
                  seek(+e.target.value);
                }}
                style={
                  {
                    "--progress": `${(frame / Math.max(1, (meta?.frameCount || 1) - 1)) * 100}%`,
                  } as React.CSSProperties
                }
              />
              <div className="timeline-labels">
                <span>{meta?.firstFrame || 0}</span>
                <span>相对时间 · 事件标记可点击</span>
                <span>{meta?.lastFrame || 0}</span>
              </div>
            </div>
          </section>
        </main>
        <aside className="inspector" aria-label="采集检查器">
          <div
            className="tabs inspector-tabs"
            role="tablist"
            aria-label="检查器"
          >
            {[
              ["info", "信息"],
              ["events", "事件"],
              ["parameters", "参数"],
            ].map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={inspector === id}
                className={inspector === id ? "active" : ""}
                onClick={() => setInspector(id)}
              >
                {label}
              </button>
            ))}
            <button
              className="close-inspector"
              aria-label="隐藏信息面板"
              onClick={() => setShowInspector(false)}
            >
              <X size={13} />
            </button>
          </div>
          {inspector === "info" && (
            <div className="inspector-content">
              <div className="section-label">选中通道</div>
              <div className="selected-channel">
                <span className="point-symbol">
                  {selection.kind === "point" ? "●" : "∿"}
                </span>
                <h2>{selectedLabel || "—"}</h2>
              </div>
              <dl className="key-values">
                <div>
                  <dt>类型</dt>
                  <dd>
                    {selection.kind === "analog"
                      ? "模拟信号"
                      : kindName[currentPoint?.kind || ""] || "—"}
                  </dd>
                </div>
                <div>
                  <dt>单位</dt>
                  <dd>{selectedUnit || "—"}</dd>
                </div>
                <div>
                  <dt>采样率</dt>
                  <dd>
                    {selection.kind === "point"
                      ? meta?.pointRate
                      : meta?.analogRate}{" "}
                    Hz
                  </dd>
                </div>
              </dl>
              {currentPoint && (
                <div className="coordinate-values">
                  {["X", "Y", "Z"].map((a, i) => {
                    const value = points?.[selection.id * 3 + i];
                    return (
                      <div key={a}>
                        <span>{a}</span>
                        <strong>
                          {value != null && Number.isFinite(value)
                            ? value.toFixed(2)
                            : "—"}
                        </strong>
                        <small>{selectedUnit}</small>
                      </div>
                    );
                  })}
                  <p>
                    {points && Number.isFinite(points[selection.id * 3])
                      ? "当前帧有效"
                      : "当前帧缺失"}{" "}
                    · 帧 {meta ? frame + meta.firstFrame : "—"}
                  </p>
                </div>
              )}
              <div className="inspector-section">
                <div className="section-label">
                  <Settings2 size={13} />
                  观察区间
                </div>
                <div className="roi-inputs">
                  <label>
                    起始帧
                    <input
                      type="number"
                      aria-label="区间起始帧"
                      min={meta?.firstFrame}
                      max={meta?.lastFrame}
                      value={meta ? roi[0] + meta.firstFrame : 0}
                      onChange={(e) =>
                        meta &&
                        updateRoi(+e.target.value - meta.firstFrame, roi[1])
                      }
                    />
                  </label>
                  <label>
                    结束帧
                    <input
                      type="number"
                      aria-label="区间结束帧"
                      min={meta?.firstFrame}
                      max={meta?.lastFrame}
                      value={meta ? roi[1] + meta.firstFrame : 0}
                      onChange={(e) =>
                        meta &&
                        updateRoi(roi[0], +e.target.value - meta.firstFrame)
                      }
                    />
                  </label>
                </div>
                <div className="roi-actions">
                  <button onClick={() => updateRoi(frame, roi[1])}>
                    此帧设为起点
                  </button>
                  <button onClick={() => updateRoi(roi[0], frame)}>
                    设为终点
                  </button>
                </div>
                <button
                  className="text-button reset-roi"
                  onClick={() => meta && updateRoi(0, meta.frameCount - 1)}
                >
                  重置为完整采集
                </button>
              </div>
              <div className="inspector-section">
                <div className="section-label">采集摘要</div>
                <dl className="key-values">
                  <div>
                    <dt>标记点 / 模型</dt>
                    <dd>{meta?.points.length ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>模拟通道</dt>
                    <dd>{meta?.analogs.length ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>事件</dt>
                    <dd>{meta?.events.length ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>力台</dt>
                    <dd>{meta?.plates.length ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>坐标单位</dt>
                    <dd>{meta?.pointUnit || "—"}</dd>
                  </div>
                  <div>
                    <dt>存储格式</dt>
                    <dd>{meta?.storage || "—"}</dd>
                  </div>
                </dl>
              </div>
              <p className="info-note">
                时间以首帧为 0 秒。帧号保留原始 C3D
                编号。模型输出按文件声明的物理单位显示。
              </p>
            </div>
          )}
          {inspector === "events" && (
            <div className="inspector-content">
              <div className="section-label">
                采集事件 <span>{meta?.events.length || 0}</span>
              </div>
              <div className="event-list">
                {meta?.events.map((e, i) => (
                  <button
                    key={i}
                    className={`event-row ${Math.abs(e.frame - (meta.firstFrame + frame)) < 2 ? "current" : ""}`}
                    onClick={() => {
                      setPlaying(false);
                      seek(e.frame - meta.firstFrame);
                    }}
                  >
                    <span
                      className={`event-side ${e.context === "Left" ? "left" : ""}`}
                    >
                      {e.context === "Left"
                        ? "L"
                        : e.context === "Right"
                          ? "R"
                          : "·"}
                    </span>
                    <div>
                      <strong>{e.label}</strong>
                      <span>
                        {e.context || "通用"} · 帧 {e.frame}
                      </span>
                    </div>
                    <small>{e.time.toFixed(3)} s</small>
                  </button>
                ))}
              </div>
              {!meta?.events.length && (
                <p className="empty-copy">这个文件没有记录事件。</p>
              )}
            </div>
          )}
          {inspector === "parameters" && (
            <div className="inspector-content parameters">
              <div className="section-label">原始 C3D 参数</div>
              {params ? (
                params.map((g) => (
                  <details key={g.name}>
                    <summary>
                      <ChevronRight size={12} />
                      {g.name}
                      <span>{g.parameters.length}</span>
                    </summary>
                    {g.parameters.map((p) => (
                      <div className="parameter" key={p.name}>
                        <strong>{p.name}</strong>
                        <small>
                          {p.dimensions.length
                            ? `[${p.dimensions.join(" × ")}]`
                            : "scalar"}
                        </small>
                        <pre>
                          {typeof p.value === "string"
                            ? p.value
                            : JSON.stringify(p.value, null, 1)}
                        </pre>
                        {p.description && <p>{p.description}</p>}
                      </div>
                    ))}
                  </details>
                ))
              ) : (
                <p className="empty-copy">正在读取参数…</p>
              )}
            </div>
          )}
          <div className="inspector-bottom">
            <Info size={13} />
            <span>数据在此设备上处理</span>
          </div>
        </aside>
      </div>
      <footer className="statusbar">
        <span>
          {loading ? (
            <>
              <span className="loading-dot" />
              {loading}
            </>
          ) : (
            <>
              <Check size={12} />
              {meta ? "采集已就绪" : "等待打开文件"}
            </>
          )}
        </span>
        <span>
          {meta?.id === "demo"
            ? "合成演示数据，不含受试者信息"
            : meta?.name || "本地 C3D 工作台"}
        </span>
        <span>
          Space 播放 / 暂停 <span className="status-separator">·</span> ← → 逐帧
        </span>
      </footer>
      {modal && (
        <div
          className="modal-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <div className="modal-title">
              <h2 id="dialog-title">
                {modal === "folder"
                  ? "打开本地数据文件夹"
                  : modal === "export"
                    ? "导出信号数据"
                    : "C3D Reader 使用帮助"}
              </h2>
              <button
                className="icon-button"
                aria-label="关闭窗口"
                onClick={() => setModal(null)}
                autoFocus
              >
                <X size={17} />
              </button>
            </div>
            {modal === "folder" && (
              <form onSubmit={saveFolder}>
                <p>
                  填写包含 C3D
                  文件的文件夹路径。支持外置硬盘，数据在本机直接读取。
                </p>
                <label className="field-label" htmlFor="folder-path">
                  文件夹路径
                </label>
                <input
                  className="folder-input"
                  id="folder-path"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  placeholder="/Volumes/YourDrive/MotionCapture"
                  required
                />
                <p className="form-note">
                  可在 Finder 中选中文件夹，按 ⌥⌘C 复制路径后粘贴。
                </p>
                {error && (
                  <p className="error-text" role="alert">
                    {error}
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => setModal(null)}
                  >
                    取消
                  </button>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={!!loading}
                  >
                    <FolderOpen size={14} />
                    打开文件夹
                  </button>
                </div>
              </form>
            )}
            {modal === "export" && meta && (
              <>
                <p>
                  导出 <strong>{selectedLabel}</strong>
                  ，保留观察区间内的全部采样点、原始帧号、相对时间和物理单位。
                </p>
                <dl className="export-details">
                  <div>
                    <dt>帧区间（含两端）</dt>
                    <dd>
                      {roi[0] + meta.firstFrame} – {roi[1] + meta.firstFrame}
                    </dd>
                  </div>
                  <div>
                    <dt>采样点数</dt>
                    <dd>
                      {countFormat.format(
                        (roi[1] - roi[0] + 1) *
                          (selection.kind === "analog"
                            ? meta.samplesPerFrame
                            : 1),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>内容</dt>
                    <dd>
                      {selection.kind === "point"
                        ? "X / Y / Z / residual"
                        : selectedUnit || "模拟信号"}
                    </dd>
                  </div>
                </dl>
                <p className="form-note">
                  缺失坐标留空，residual 为 −1。导出不会修改原文件。
                </p>
                <div className="modal-actions">
                  <button className="button" onClick={() => setModal(null)}>
                    取消
                  </button>
                  <a
                    className="button primary"
                    href={`/api/files/${meta.id}/export?kind=${selection.kind}&ids=${selection.id}&start=${roi[0]}&stop=${roi[1] + 1}`}
                    download
                    onClick={() => setModal(null)}
                  >
                    <Download size={14} />
                    下载 CSV
                  </a>
                </div>
              </>
            )}
            {modal === "help" && (
              <div className="help-content">
                <p>
                  用于运动捕捉数据的本地读取与检查。选择文件后，3D
                  场景、信号曲线与事件时间轴同步显示。
                </p>
                <div className="help-row">
                  <strong>三维观察</strong>
                  <span>
                    左键拖动旋转，右键平移，滚轮缩放；点击标记点查看 XYZ 曲线。
                  </span>
                </div>
                <div className="help-row">
                  <strong>信号与事件</strong>
                  <span>
                    左侧切换标记点、模型输出或模拟信号。点击曲线或事件定位帧。
                  </span>
                </div>
                <div className="help-row">
                  <strong>播放快捷键</strong>
                  <span>
                    Space 播放 / 暂停；← → 逐帧；Shift + ← → 跳 10 帧；Home /
                    End 跳到区间两端。
                  </span>
                </div>
                <div className="help-row">
                  <strong>观察与导出</strong>
                  <span>
                    在信息面板设置帧区间，然后导出当前通道。CSV 保留完整采样率。
                  </span>
                </div>
                <div className="help-row">
                  <strong>数据约定</strong>
                  <span>
                    默认 Z 轴向上，可切换 Y 轴。连线根据常用 Plug-in Gait
                    标签推断；力台只展示轮廓，力与力矩可在模拟通道查看。
                  </span>
                </div>
                <p className="form-note">
                  支持 Intel / MIPS 的浮点及整数
                  C3D。当前版本不包含视频同步、C3D 编辑写回和力台 COP / GRF
                  解算。
                </p>
                <div className="modal-actions">
                  <button
                    className="button primary"
                    onClick={() => setModal(null)}
                  >
                    开始查看
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
