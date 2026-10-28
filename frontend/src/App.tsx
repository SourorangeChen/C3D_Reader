import { version } from "../../package.json";
import { usePreferences } from "./Preferences";
import { defaultLayout } from "./Preferences";
import { PanelDivider } from "./PanelDivider";
import { BatchExportDialog } from "./BatchExportDialog";
import { ExportOptions } from "./ExportOptions";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { EMPTY_CLOCK, isImage, isVideo } from "./synchronization";
import type { MediaClock } from "./synchronization";
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
  Film,
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
import { desktop } from "./desktop";
import type {
  Acquisition,
  Library,
  ParameterGroup,
  Selection,
  SeriesData,
} from "./types";

const countFormat = new Intl.NumberFormat("en");
const MediaPanel = lazy(() =>
  import("./MediaPanel").then((module) => ({ default: module.MediaPanel })),
);
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
      onClick={(e) => {
        e.currentTarget.focus();
        onClick();
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function App() {
  const {
    preferences,
    resolvedTheme,
    update: updatePreferences,
    t,
  } = usePreferences();
  const [library, setLibrary] = useState<Library | null>(null);
  const [meta, setMeta] = useState<Acquisition | null>(null);
  const [selection, setSelection] = useState<Selection>({
    kind: "point",
    id: 0,
  });
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [incomingMedia, setIncomingMedia] = useState<File[] | null>(null);
  const [mediaClock, setMediaClock] = useState<MediaClock>(EMPTY_CLOCK);
  const consumeMedia = useCallback(() => setIncomingMedia(null), []);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [roi, setRoi] = useState<[number, number]>([0, 0]);
  const playbackRange = mediaClock.mode ? mediaClock.range : roi;
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
  const [modal, setModal] = useState<
    "folder" | "help" | "export" | "settings" | "batch" | null
  >(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [folder, setFolder] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [showLibrary, setShowLibrary] = useState(true);
  const [showInspector, setShowInspector] = useState(
    () => window.innerWidth >= 1000,
  );
  const loadVersion = useRef(0);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [desktopReady, setDesktopReady] = useState(false);
  const layout = preferences.layout;
  const resizePanel = (key: keyof typeof layout, value: number) =>
    updatePreferences({ layout: { ...layout, [key]: value } });
  useEffect(() => desktop?.onSettings(() => setModal("settings")), []);
  const {
    points,
    error: frameError,
    retry: retryFrames,
  } = useFrames(meta, frame);
  const sourceChanged = frameError?.action === "reopen";
  useEffect(() => {
    if (frameError) setPlaying(false);
    if (frameError?.action === "reopen") {
      setSeries(null);
      setParams(null);
      setModal((current) => (current === "export" ? null : current));
    }
  }, [frameError]);
  const currentPoint =
    selection.kind === "point" ? meta?.points[selection.id] : null;
  const currentAnalog =
    selection.kind === "analog" ? meta?.analogs[selection.id] : null;
  const selectedLabel = currentPoint?.label || currentAnalog?.label || "";
  const selectedUnit = currentPoint?.unit || currentAnalog?.unit || "";
  const clock = meta ? frame / meta.pointRate : 0;
  const lastTime = meta ? (meta.frameCount - 1) / meta.pointRate : 0;
  const applyAcquisition = useCallback((data: Acquisition) => {
    setPlaying(false);
    setMediaClock(EMPTY_CLOCK);
    setIncomingMedia(null);
    setError("");
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
  }, []);
  const openFile = useCallback(
    async (id: string) => {
      const version = ++loadVersion.current;
      setPlaying(false);
      setLoading("正在读取 C3D…");
      setError("");
      try {
        const data = await api<Acquisition>(`/api/files/${id}`);
        if (version !== loadVersion.current) return;
        applyAcquisition(data);
      } catch (e) {
        if (version === loadVersion.current) setError((e as Error).message);
      } finally {
        if (version === loadVersion.current) setLoading("");
      }
    },
    [applyAcquisition],
  );
  useEffect(() => {
    let disposed = false;
    void api<Library>("/api/library")
      .then((data) => {
        if (disposed) return;
        setLibrary(data);
        setFolder(data.folder);
        const initial =
          data.files.find((f) => /^WT0/i.test(f.name)) ||
          data.files[0] ||
          data.demo;
        void openFile(initial.id);
        setDesktopReady(true);
      })
      .catch((e) => setError(e.message));
    return () => {
      disposed = true;
    };
  }, [openFile]);
  useEffect(() => {
    if (!desktop || !desktopReady) return;
    const unsubscribe = desktop.onOpen((payload) => {
      if (payload.error) {
        setError(payload.error);
        setLoading("");
        return;
      }
      if (payload.library) {
        setLibrary(payload.library);
        setFolder(payload.library.folder);
      }
      if (payload.acquisition) {
        ++loadVersion.current;
        setLoading("");
        setModal(null);
        applyAcquisition(payload.acquisition);
      } else if (payload.library?.files.length)
        void openFile(payload.library.files[0].id);
    });
    void desktop.ready().catch((e) => setError(e.message));
    return unsubscribe;
  }, [desktopReady, applyAcquisition, openFile]);
  const openNativeFile = () => {
    void desktop?.openFile().catch((e) => setError(e.message));
  };
  const openFolder = () => {
    setError("");
    if (desktop) void desktop.openFolder().catch((e) => setError(e.message));
    else setModal("folder");
  };
  const dropFiles = async (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    if ((files.length === 1 && isVideo(files[0])) || files.every(isImage)) {
      setPlaying(false);
      setIncomingMedia(files);
      setShowMedia(true);
      return;
    }
    if (files.length !== 1 || !/\.c3d$/i.test(files[0].name)) {
      setError(t("请一次拖入一个 .c3d 文件。"));
      return;
    }
    if (!desktop) {
      setError(
        t("直接拖入文件请使用 macOS 桌面版；浏览器版可通过“打开文件夹”读取。"),
      );
      return;
    }
    setLoading("正在打开拖入的 C3D…");
    try {
      await desktop.openDroppedFile(files[0]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading("");
    }
  };
  useEffect(() => {
    if (!meta || sourceChanged) return;
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
  }, [meta, selection, roi, sourceChanged]);
  useEffect(() => {
    if (inspector !== "parameters" || !meta || params || sourceChanged) return;
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
  }, [inspector, meta, params, sourceChanged]);
  useEffect(() => {
    if (
      !playing ||
      !meta ||
      !points ||
      !playbackRange ||
      mediaClock.mode === "video"
    )
      return;
    let handle = 0;
    const start = performance.now(),
      initial = frame;
    const tick = (now: number) => {
      // The first rAF timestamp can precede `start`; never step before `initial`.
      const elapsed = Math.max(0, now - start);
      const next =
        initial + Math.floor((elapsed / 1000) * meta.pointRate * speed);
      if (next > playbackRange[1]) {
        if (loop)
          setFrame(
            playbackRange[0] +
              ((next - playbackRange[0]) %
                (playbackRange[1] - playbackRange[0] + 1)),
          );
        else {
          setFrame(playbackRange[1]);
          setPlaying(false);
          return;
        }
      } else setFrame(next);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
    // Restart the clock only on a chunk boundary or playback change.
  }, [
    playing,
    meta,
    speed,
    loop,
    playbackRange,
    mediaClock.mode,
    Math.floor(frame / 500),
    !!points,
  ]);
  const advanceMediaFrame = useCallback(
    (index: number) => {
      if (meta && Number.isFinite(index))
        setFrame(Math.max(0, Math.min(meta.frameCount - 1, index)));
    },
    [meta],
  );
  const seek = useCallback(
    (index: number) => {
      if (!meta) return;
      setPlaying(false);
      setFrame(Math.max(roi[0], Math.min(roi[1], index)));
    },
    [meta, roi],
  );
  const togglePlay = useCallback(() => {
    if (!meta || !playbackRange || frameError?.action === "reopen") return;
    if (frameError) retryFrames();
    if (frame < playbackRange[0] || frame >= playbackRange[1])
      setFrame(playbackRange[0]);
    setPlaying((p) => !p);
  }, [meta, frame, playbackRange, frameError, retryFrames]);
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
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    (
      dialog?.querySelector<HTMLElement>("button, select, input, a[href]") ||
      dialog
    )?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab" && dialog) {
        const focusable = [
          ...dialog.querySelectorAll<HTMLElement>(
            "button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], [tabindex='0']",
          ),
        ];
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      previous?.focus();
    };
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
    <div
      className="app"
      data-theme={resolvedTheme}
      style={
        {
          "--library-width": `${layout.library}px`,
          "--inspector-width": `${layout.inspector}px`,
          "--scene-share": `${layout.scene}fr`,
          "--signal-share": `${1 - layout.scene}fr`,
        } as React.CSSProperties
      }
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (--dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={dropFiles}
    >
      {dragging && (
        <div className="file-drop-overlay" role="status">
          <div>
            <File size={34} />
            <h2>{t("松开以导入文件")}</h2>
            <p>
              {desktop
                ? t("直接读取本机文件，支持大型采集")
                : t("支持视频或编号图片序列；C3D 拖放请使用桌面版")}
            </p>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="brand">
          <Mark />
          <span>
            C3D <strong>Reader</strong>
          </span>
          <span className="version">{version}</span>
        </div>
        <div className="workspace-name">
          Motion workspace <span className="header-slash">/</span>{" "}
          <span>{t("动作数据工作台")}</span>
        </div>
        <div className="header-actions">
          <span className="local-status">
            <span />
            {desktop ? t("macOS 桌面版") : t("本地运行")}
          </span>
          {desktop && (
            <button className="button primary" onClick={openNativeFile}>
              <File size={15} />
              {t("打开 C3D")}
            </button>
          )}
          <button
            className={`button${desktop ? "" : " primary"}`}
            onClick={openFolder}
          >
            <FolderOpen size={15} />
            {t("打开文件夹")}
          </button>
          <IconButton label={t("使用帮助")} onClick={() => setModal("help")}>
            <CircleHelp size={17} />
          </IconButton>
        </div>
      </header>
      <div
        className={`app-body ${showLibrary ? "" : "hide-library"} ${showInspector ? "" : "hide-inspector"}`}
      >
        <nav className="rail" aria-label={t("工作区面板")}>
          <div className="rail-top">
            <IconButton
              label={t("文件与通道")}
              onClick={() => setShowLibrary((v) => !v)}
              active={showLibrary}
            >
              <Layers size={19} />
            </IconButton>
            <IconButton
              label={t("采集信息")}
              onClick={() => {
                setShowInspector(true);
                setInspector("info");
              }}
              active={showInspector && inspector === "info"}
            >
              <Info size={19} />
            </IconButton>
            <IconButton
              label={t("事件列表")}
              onClick={() => {
                setShowInspector(true);
                setInspector("events");
              }}
              active={showInspector && inspector === "events"}
            >
              <List size={19} />
            </IconButton>
            <IconButton
              label={t("C3D 参数")}
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
            <IconButton label={t("设置")} onClick={() => setModal("settings")}>
              <Settings2 size={18} />
            </IconButton>
            <IconButton label={t("使用帮助")} onClick={() => setModal("help")}>
              <CircleHelp size={18} />
            </IconButton>
          </div>
        </nav>
        <aside className="explorer" aria-label={t("文件与通道")}>
          <PanelDivider
            label={t("调整文件面板宽度")}
            orientation="vertical"
            value={layout.library}
            min={190}
            max={420}
            onChange={(value) => resizePanel("library", value)}
            onReset={() => resizePanel("library", defaultLayout.library)}
            className="library-divider"
          />
          <div className="panel-heading">
            <h2>{t("采集文件")}</h2>
            <span>{library?.files.length || 0}</span>
            <IconButton
              label={t("刷新文件夹")}
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
            title={library?.folder || t("未选择文件夹")}
            onClick={openFolder}
          >
            <FolderOpen size={14} />
            <span>
              {library?.folder.split("/").filter(Boolean).at(-1) ||
                t("选择数据文件夹")}
            </span>
            <ChevronDown size={12} />
          </button>
          <div className="file-search">
            <Search size={12} />
            <input
              aria-label={t("搜索文件")}
              placeholder={t("搜索采集文件")}
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
                  ? t("数据硬盘未连接，请重新挂载或选择文件夹。")
                  : t("打开包含 .c3d 文件的本地文件夹。")}
              </p>
            )}
          </div>
          <button
            className={`demo-row ${meta?.id === "demo" ? "selected" : ""}`}
            onClick={() => void openFile("demo")}
          >
            <Activity size={13} />
            <span>{t("合成步行示例")}</span>
            <span className="tiny-note">Demo</span>
          </button>
          <button
            className="batch-export-button"
            onClick={() => setModal("batch")}
            disabled={!library?.folder}
          >
            <Download size={13} /> {t("批量导出 CSV")}
          </button>
          <div className="panel-heading channel-heading">
            <h2>{t("采集通道")}</h2>
            <span>{meta ? meta.points.length + meta.analogs.length : "—"}</span>
          </div>
          <div
            className="tabs channel-tabs"
            role="tablist"
            aria-label={t("通道类型")}
          >
            {[
              ["marker", t("标记点"), markerCount],
              ["model", t("模型"), modelCount],
              ["analog", t("模拟"), meta?.analogs.length || 0],
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
              aria-label={t("搜索通道")}
              placeholder={
                tab === "analog"
                  ? t("搜索力、EMG、IMU…")
                  : t("搜索标记点或模型输出…")
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="clear-search"
                aria-label={t("清除搜索")}
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
              {t("显示 Vicon 模型坐标点")}
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
                        title={
                          hidden.has(p.id) ? t("显示标记点") : t("隐藏标记点")
                        }
                        aria-label={`${hidden.has(p.id) ? t("显示") : t("隐藏")} ${p.label}`}
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
                <p className="empty-copy">{t("没有匹配的通道。")}</p>
              )}
          </div>
          <div className="explorer-footer">
            <span className="live-dot" />
            {t("只读访问 · 原始文件保持完整")}
          </div>
        </aside>
        <main className="workspace">
          <div className="trial-header">
            <div className="trial-title">
              <div className="breadcrumb">
                <span>{t("采集")}</span>
                <ChevronRight size={12} />
                <span>
                  {meta?.id === "demo"
                    ? t("合成示例")
                    : meta?.manufacturer || "C3D"}
                </span>
              </div>
              <h1>
                {meta?.id === "demo"
                  ? "Synthetic walking"
                  : meta?.name || "C3D Reader"}
              </h1>
            </div>
            <div className="trial-actions">
              <button
                className={`button ${showMedia ? "active" : ""}`}
                disabled={!meta}
                aria-pressed={showMedia}
                onClick={() => {
                  setPlaying(false);
                  setShowMedia((value) => !value);
                  setMediaClock(EMPTY_CLOCK);
                }}
              >
                <Film size={14} />
                {t("视频同步")}
              </button>
              <button
                className="button primary export-button"
                disabled={!meta || sourceChanged}
                onClick={() => setModal("export")}
              >
                <Download size={14} />
                <span>{t("导出 CSV")}</span>
              </button>
            </div>
          </div>
          <div className="trial-stats">
            <span>
              <strong>
                {meta ? countFormat.format(meta.frameCount) : "—"}
              </strong>
              {t("帧")}
            </span>
            <span>
              <strong>{meta?.pointRate ?? "—"}</strong>
              {t("Hz 标记点")}
            </span>
            <span>
              <strong>
                {meta ? countFormat.format(meta.analogRate) : "—"}
              </strong>
              {t("Hz 模拟信号")}
            </span>
            <span>
              <strong>{meta?.duration.toFixed(2) ?? "—"}</strong>
              {t("s 时长")}
            </span>
            <span className="storage-note">
              {meta?.id === "demo"
                ? t("合成数据")
                : meta
                  ? t("{0} · 分块读取", [formatBytes(meta.size)])
                  : ""}
            </span>
          </div>
          {(error || frameError) && !modal && (
            <div className="error-banner" role="alert">
              <span>{t(error || frameError?.message || "")}</span>
              {error ? (
                <button
                  className="icon-button"
                  aria-label={t("关闭错误提示")}
                  onClick={() => setError("")}
                >
                  <X size={14} />
                </button>
              ) : frameError ? (
                <button
                  className="button"
                  disabled={!!loading}
                  onClick={() => {
                    setPlaying(false);
                    if (frameError.action === "reopen" && meta)
                      void openFile(meta.id);
                    else retryFrames();
                  }}
                >
                  <RefreshCw size={13} />
                  {t(
                    frameError.action === "reopen"
                      ? "重新打开文件"
                      : "重试读取",
                  )}
                </button>
              ) : null}
            </div>
          )}
          <div className="visual-panels">
            <section
              className={`scene-panel ${showMedia ? "with-media" : ""}`}
              aria-label={t("三维视图")}
            >
              <div className="scene-toolbar">
                <div className="toolbar-group">
                  <Box size={14} />
                  <select
                    aria-label={t("视角")}
                    value={view}
                    onChange={(e) => setView(e.target.value)}
                  >
                    <option value="perspective">{t("透视视图")}</option>
                    <option value="front">{t("正面视图")}</option>
                    <option value="side">{t("侧面视图")}</option>
                    <option value="top">{t("俯视视图")}</option>
                  </select>
                </div>
                <div className="toolbar-toggles">
                  <button
                    className={segments ? "active" : ""}
                    aria-pressed={segments}
                    onClick={() => setSegments((v) => !v)}
                  >
                    {t("连线")}
                  </button>
                  <button
                    className={trails ? "active" : ""}
                    aria-pressed={trails}
                    onClick={() => setTrails((v) => !v)}
                  >
                    {t("轨迹")}
                  </button>
                  <button
                    className={labels ? "active" : ""}
                    aria-pressed={labels}
                    onClick={() => setLabels((v) => !v)}
                  >
                    {t("标签")}
                  </button>
                  <select
                    aria-label={t("地面向上轴")}
                    value={up}
                    onChange={(e) => setUp(e.target.value as "Z" | "Y")}
                  >
                    <option value="Z">Z ↑</option>
                    <option value="Y">Y ↑</option>
                  </select>
                  <IconButton
                    label={t("切换信息面板")}
                    onClick={() => setShowInspector((v) => !v)}
                  >
                    <Maximize2 size={13} />
                  </IconButton>
                </div>
              </div>
              <div
                className={`scene-content ${showMedia && meta ? "has-media" : ""}`}
              >
                {meta ? (
                  <Viewer
                    meta={meta}
                    frame={frame}
                    points={points}
                    selected={
                      currentPoint?.kind === "marker" ? selection.id : null
                    }
                    hidden={hidden}
                    segments={segments}
                    trails={trails && !sourceChanged}
                    labels={labels}
                    view={view}
                    up={up}
                    onSelect={pickPoint}
                  />
                ) : (
                  <div className="viewer-placeholder">
                    {t("选择一个 C3D 文件开始查看")}
                  </div>
                )}
                {showMedia && meta && (
                  <Suspense
                    fallback={
                      <div className="media-loading">
                        {t("正在打开同步面板…")}
                      </div>
                    }
                  >
                    <MediaPanel
                      key={`${meta.id}:${meta.firstFrame}:${meta.frameCount}:${meta.pointRate}`}
                      meta={meta}
                      frame={frame}
                      playing={playing}
                      speed={speed}
                      loop={loop}
                      roi={roi}
                      selection={selection}
                      framesReady={!!points}
                      blocked={sourceChanged}
                      incoming={incomingMedia}
                      onConsumed={consumeMedia}
                      onClock={setMediaClock}
                      onFrame={advanceMediaFrame}
                      onPlaying={setPlaying}
                      onClose={() => {
                        setShowMedia(false);
                        setMediaClock(EMPTY_CLOCK);
                      }}
                    />
                  </Suspense>
                )}
              </div>
              <div className="scene-legend">
                <span>
                  <i className="dot left" />
                  {t("左侧标记点")}
                </span>
                <span>
                  <i className="dot right" />
                  {t("右侧 / 其他")}
                </span>
                <span className="scene-footnote">
                  {meta?.plates.length
                    ? t("{0} 块力台轮廓 · ", [meta.plates.length])
                    : ""}
                  {t("连线为标签推断")}
                </span>
              </div>
            </section>
            <PanelDivider
              label={t("调整三维与曲线区域")}
              orientation="horizontal"
              value={layout.scene}
              min={0.3}
              max={0.82}
              onChange={(value) => resizePanel("scene", value)}
              onReset={() => resizePanel("scene", defaultLayout.scene)}
            />
            <section className="signal-panel">
              <div className="signal-heading">
                <div>
                  <Activity size={14} />
                  <h2>{selectedLabel || t("信号曲线")}</h2>
                  <span>{selectedUnit || t("无单位")}</span>
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
                            "--axis-color": [
                              "var(--signal-x)",
                              "var(--signal-y)",
                              "var(--signal-z)",
                            ][i],
                          } as React.CSSProperties
                        }
                        onClick={() =>
                          setAxes((old) =>
                            old.map((v, j) => (j === i ? !v : v)),
                          )
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
                  {t(seriesError)}
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
                <span>{t("点击曲线定位帧")}</span>
                <span>
                  {series?.method === "min-max envelope"
                    ? t("保留极值的显示抽样 · CSV 保留全部采样点")
                    : ""}
                </span>
              </div>
            </section>
          </div>
          <section className="timeline-panel" aria-label={t("播放时间轴")}>
            <div className="playback-controls">
              <div className="transport">
                <IconButton
                  label={t("跳至区间开头")}
                  onClick={() => {
                    setPlaying(false);
                    seek(roi[0]);
                  }}
                  disabled={!meta}
                >
                  <ChevronsLeft size={16} />
                </IconButton>
                <IconButton
                  label={t("上一帧")}
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
                  aria-label={playing ? t("暂停") : t("播放")}
                  disabled={!meta || sourceChanged || !playbackRange}
                  onClick={togglePlay}
                >
                  {playing ? (
                    <Pause size={15} fill="currentColor" />
                  ) : (
                    <Play size={15} fill="currentColor" />
                  )}
                </button>
                <IconButton
                  label={t("下一帧")}
                  onClick={() => {
                    setPlaying(false);
                    seek(frame + 1);
                  }}
                  disabled={!meta}
                >
                  <SkipForward size={15} />
                </IconButton>
                <IconButton
                  label={t("跳至区间末尾")}
                  onClick={() => {
                    setPlaying(false);
                    seek(roi[1]);
                  }}
                  disabled={!meta}
                >
                  <ChevronsRight size={16} />
                </IconButton>
                <select
                  aria-label={t("播放速度")}
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
                  {t("循环")}
                </button>
              </div>
              <div className="time-readout">
                <strong>
                  {clock.toFixed(3)} <small>s</small>
                </strong>
                <span>/ {lastTime.toFixed(3)} s</span>
              </div>
              <div className="frame-readout">
                <span>{t("帧")}</span>
                <input
                  aria-label={t("当前帧")}
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
                      aria-label={t("{0} {1}，帧 {2}", [
                        e.context,
                        e.label,
                        e.frame,
                      ])}
                      title={t("{0} {1} · 帧 {2}", [
                        e.context,
                        e.label,
                        e.frame,
                      ])}
                      onClick={() => {
                        setPlaying(false);
                        seek(e.frame - meta.firstFrame);
                      }}
                    />
                  ))}
              </div>
              <input
                aria-label={t("时间轴")}
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
                <span>{t("相对时间 · 事件标记可点击")}</span>
                <span>{meta?.lastFrame || 0}</span>
              </div>
            </div>
          </section>
        </main>
        <aside className="inspector" aria-label={t("采集检查器")}>
          <PanelDivider
            label={t("调整信息面板宽度")}
            orientation="vertical"
            value={layout.inspector}
            min={200}
            max={400}
            reverse
            onChange={(value) => resizePanel("inspector", value)}
            onReset={() => resizePanel("inspector", defaultLayout.inspector)}
            className="inspector-divider"
          />
          <div
            className="tabs inspector-tabs"
            role="tablist"
            aria-label={t("检查器")}
          >
            {[
              ["info", t("信息")],
              ["events", t("事件")],
              ["parameters", t("参数")],
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
              aria-label={t("隐藏信息面板")}
              onClick={() => setShowInspector(false)}
            >
              <X size={13} />
            </button>
          </div>
          {inspector === "info" && (
            <div className="inspector-content">
              <div className="section-label">{t("选中通道")}</div>
              <div className="selected-channel">
                <span className="point-symbol">
                  {selection.kind === "point" ? "●" : "∿"}
                </span>
                <h2>{selectedLabel || "—"}</h2>
              </div>
              <dl className="key-values">
                <div>
                  <dt>{t("类型")}</dt>
                  <dd>
                    {selection.kind === "analog"
                      ? t("模拟信号")
                      : t(kindName[currentPoint?.kind || ""] || "—")}
                  </dd>
                </div>
                <div>
                  <dt>{t("单位")}</dt>
                  <dd>{selectedUnit || "—"}</dd>
                </div>
                <div>
                  <dt>{t("采样率")}</dt>
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
                      ? t("当前帧有效")
                      : t("当前帧缺失")}{" "}
                    {t("· 帧")}
                    {meta ? frame + meta.firstFrame : "—"}
                  </p>
                </div>
              )}
              <div className="inspector-section">
                <div className="section-label">
                  <Settings2 size={13} />
                  {t("观察区间")}
                </div>
                <div className="roi-inputs">
                  <label>
                    {t("起始帧")}
                    <input
                      type="number"
                      aria-label={t("区间起始帧")}
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
                    {t("结束帧")}
                    <input
                      type="number"
                      aria-label={t("区间结束帧")}
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
                    {t("此帧设为起点")}
                  </button>
                  <button onClick={() => updateRoi(roi[0], frame)}>
                    {t("设为终点")}
                  </button>
                </div>
                <button
                  className="text-button reset-roi"
                  onClick={() => meta && updateRoi(0, meta.frameCount - 1)}
                >
                  {t("重置为完整采集")}
                </button>
              </div>
              <div className="inspector-section">
                <div className="section-label">{t("采集摘要")}</div>
                <dl className="key-values">
                  <div>
                    <dt>{t("标记点 / 模型")}</dt>
                    <dd>{meta?.points.length ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("模拟通道")}</dt>
                    <dd>{meta?.analogs.length ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("事件")}</dt>
                    <dd>{meta?.events.length ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("力台")}</dt>
                    <dd>{meta?.plates.length ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("坐标单位")}</dt>
                    <dd>{meta?.pointUnit || "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("存储格式")}</dt>
                    <dd>{meta?.storage || "—"}</dd>
                  </div>
                </dl>
              </div>
              <p className="info-note">
                {t(
                  "时间以首帧为 0 秒。帧号保留原始 C3D 编号。模型输出按文件声明的物理单位显示。",
                )}
              </p>
            </div>
          )}
          {inspector === "events" && (
            <div className="inspector-content">
              <div className="section-label">
                {t("采集事件")}
                <span>{meta?.events.length || 0}</span>
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
                        {e.context || t("通用")}
                        {t("· 帧")}
                        {e.frame}
                      </span>
                    </div>
                    <small>{e.time.toFixed(3)} s</small>
                  </button>
                ))}
              </div>
              {!meta?.events.length && (
                <p className="empty-copy">{t("这个文件没有记录事件。")}</p>
              )}
            </div>
          )}
          {inspector === "parameters" && (
            <div className="inspector-content parameters">
              <div className="section-label">{t("原始 C3D 参数")}</div>
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
                <p className="empty-copy">{t("正在读取参数…")}</p>
              )}
            </div>
          )}
          <div className="inspector-bottom">
            <Info size={13} />
            <span>{t("数据在此设备上处理")}</span>
          </div>
        </aside>
      </div>
      <footer className="statusbar">
        <span>
          {loading ? (
            <>
              <span className="loading-dot" />
              {t(loading)}
            </>
          ) : (
            <>
              <Check size={12} />
              {meta ? t("采集已就绪") : t("等待打开文件")}
            </>
          )}
        </span>
        <span>
          {meta?.id === "demo"
            ? t("合成演示数据，不含受试者信息")
            : meta?.name || t("本地 C3D 工作台")}
        </span>
        <span>
          {t("Space 播放 / 暂停")}
          <span className="status-separator">·</span>
          {t("← → 逐帧")}
        </span>
      </footer>
      <BatchExportDialog
        visible={modal === "batch"}
        fileCount={library?.files.length || 0}
        onClose={() => setModal(null)}
        dialogRef={dialogRef}
      />
      {modal && modal !== "batch" && (
        <div
          className="modal-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className="modal"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <div className="modal-title">
              <h2 id="dialog-title">
                {modal === "folder"
                  ? t("打开本地数据文件夹")
                  : modal === "settings"
                    ? t("设置")
                    : modal === "export"
                      ? t("导出信号数据")
                      : t("C3D Reader 使用帮助")}
              </h2>
              <button
                className="icon-button"
                aria-label={t("关闭窗口")}
                onClick={() => setModal(null)}
              >
                <X size={17} />
              </button>
            </div>
            {modal === "settings" && (
              <>
                <div className="settings-row">
                  <label htmlFor="theme-select">{t("主题")}</label>
                  <select
                    id="theme-select"
                    value={preferences.theme}
                    onChange={(e) =>
                      updatePreferences({
                        theme: e.target.value as typeof preferences.theme,
                      })
                    }
                  >
                    <option value="dark">{t("深色")}</option>
                    <option value="light">{t("浅色")}</option>
                    <option value="system">{t("跟随系统")}</option>
                  </select>
                </div>
                <div className="settings-row">
                  <label htmlFor="language-select">{t("界面语言")}</label>
                  <select
                    id="language-select"
                    value={preferences.language}
                    onChange={(e) =>
                      updatePreferences({
                        language: e.target.value as typeof preferences.language,
                      })
                    }
                  >
                    <option value="zh-CN">简体中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="settings-layout">
                  <h3>{t("工作区布局")}</h3>
                  <p>
                    {t("拖动面板之间的分隔条调整大小；双击分隔条恢复默认。")}
                  </p>
                  <button
                    className="button"
                    onClick={() => updatePreferences({ layout: defaultLayout })}
                  >
                    <RefreshCw size={14} />
                    {t("恢复默认布局")}
                  </button>
                </div>
                <p className="form-note">
                  {t("设置自动保存在本机，即时生效。")}
                </p>
                <div className="modal-actions">
                  <button
                    className="button primary"
                    onClick={() => setModal(null)}
                  >
                    {t("完成")}
                  </button>
                </div>
              </>
            )}
            {modal === "folder" && (
              <form onSubmit={saveFolder}>
                <p>
                  {t(
                    "填写包含 C3D 文件的文件夹路径。支持外置硬盘，数据在本机直接读取。",
                  )}
                </p>
                <label className="field-label" htmlFor="folder-path">
                  {t("文件夹路径")}
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
                  {t("可在 Finder 中选中文件夹，按 ⌥⌘C 复制路径后粘贴。")}
                </p>
                {error && (
                  <p className="error-text" role="alert">
                    {t(error)}
                  </p>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => setModal(null)}
                  >
                    {t("取消")}
                  </button>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={!!loading}
                  >
                    <FolderOpen size={14} />
                    {t("打开文件夹")}
                  </button>
                </div>
              </form>
            )}
            {modal === "export" && meta && (
              <ExportOptions
                meta={meta}
                selection={selection}
                roi={roi}
                onClose={() => setModal(null)}
              />
            )}
            {modal === "help" && (
              <div className="help-content">
                <p>
                  {t(
                    "用于运动捕捉数据的本地读取与检查。选择文件后，3D 场景、信号曲线与事件时间轴同步显示。",
                  )}
                </p>
                <div className="help-row">
                  <strong>{t("三维观察")}</strong>
                  <span>
                    {t(
                      "左键拖动旋转，右键平移，滚轮缩放；点击标记点查看 XYZ 曲线。",
                    )}
                  </span>
                </div>
                <div className="help-row">
                  <strong>{t("信号与事件")}</strong>
                  <span>
                    {t(
                      "左侧切换标记点、模型输出或模拟信号。点击曲线或事件定位帧。",
                    )}
                  </span>
                </div>
                <div className="help-row">
                  <strong>{t("播放快捷键")}</strong>
                  <span>
                    {t(
                      "Space 播放 / 暂停；← → 逐帧；Shift + ← → 跳 10 帧；Home / End 跳到区间两端。",
                    )}
                  </span>
                </div>
                <div className="help-row">
                  <strong>{t("观察与导出")}</strong>
                  <span>
                    {t(
                      "导出 CSV 默认包含全部点位和完整采集；也可选择 COM、当前通道或观察区间。CSV 保留完整采样率。",
                    )}
                  </span>
                </div>
                <div className="help-row">
                  <strong>{t("数据约定")}</strong>
                  <span>
                    {t(
                      "默认 Z 轴向上，可切换 Y 轴。连线根据常用 Plug-in Gait 标签推断；力台只展示轮廓，力与力矩可在模拟通道查看。",
                    )}
                  </span>
                </div>
                <p className="form-note">
                  {t(
                    "支持 Intel / MIPS 的浮点及整数 C3D，以及视频和编号图片序列同步。当前版本不包含 C3D 编辑写回和力台 COP / GRF 解算。",
                  )}
                </p>
                <div className="modal-actions">
                  <button
                    className="button primary"
                    onClick={() => setModal(null)}
                  >
                    {t("开始查看")}
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
