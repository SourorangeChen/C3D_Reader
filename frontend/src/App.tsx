import { usePreferences } from "./Preferences";
import { defaultLayout } from "./Preferences";
import { PanelDivider } from "./PanelDivider";
import { AppHeader } from "./AppHeader";
import { WorkspaceRail } from "./WorkspaceRail";
import { FilePanel } from "./FilePanel";
import { ChannelPanel } from "./ChannelPanel";
import { TimelinePanel } from "./TimelinePanel";
import { InspectorPanel } from "./InspectorPanel";
import { StatusBar } from "./StatusBar";
import { SettingsPanel } from "./SettingsPanel";
import { FolderForm } from "./FolderForm";
import { HelpContent } from "./HelpContent";
import { BatchExportDialog } from "./BatchExportDialog";
import { ExportOptions } from "./ExportOptions";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { subscribeTraining } from "./trainingSession";
import { EMPTY_CLOCK, isImage, isVideo } from "./synchronization";
import type { MediaClock } from "./synchronization";
import {
  acquisitionKey,
  createMediaSession,
  disposeMediaSession,
} from "./mediaSession";
import {
  ChevronRight,
  Download,
  File,
  Film,
  Info,
  RefreshCw,
  X,
} from "lucide-react";
import { ScenePanel } from "./ScenePanel";
import { SignalPanel } from "./SignalPanel";
import { useFrames } from "./useFrames";
import { api, formatBytes } from "./types";
import { desktop } from "./desktop";
import type { Acquisition, Library, Selection } from "./types";
import { errorMessage } from "./errors";
import { defaultSelection, selectedChannel } from "./workbench";
import { usePlayback, usePlaybackClock } from "./usePlayback";
import { useSceneOptions } from "./useSceneOptions";
import { useParameters, useSeries } from "./useAcquisitionData";
import { useDialogFocus, usePlaybackShortcuts } from "./useShortcuts";

const countFormat = new Intl.NumberFormat("en");
const MediaPanel = lazy(() =>
  import("./MediaPanel").then((module) => ({ default: module.MediaPanel })),
);

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
  const [showMedia, setShowMedia] = useState(false);
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const [mediaSession] = useState(createMediaSession);
  const training = useSyncExternalStore(
    (listener) => subscribeTraining(mediaSession, listener),
    () => mediaSession.training,
  );
  useEffect(() => () => disposeMediaSession(mediaSession), [mediaSession]);
  const [comparisonHost, setComparisonHost] = useState<HTMLDivElement | null>(
    null,
  );
  const [incomingMedia, setIncomingMedia] = useState<File[] | null>(null);
  const [mediaClock, setMediaClock] = useState<MediaClock>(EMPTY_CLOCK);
  const consumeMedia = useCallback(() => setIncomingMedia(null), []);
  const playback = usePlayback(meta, mediaClock);
  const {
    frame,
    playing,
    setPlaying,
    speed,
    loop,
    roi,
    seek,
    advanceMediaFrame,
  } = playback;
  const pause = useCallback(() => setPlaying(false), [setPlaying]);
  const scene = useSceneOptions();
  const {
    hidden,
    segments,
    setSegments,
    trails,
    setTrails,
    labels,
    setLabels,
    showVirtual: virtual,
    view,
    setView,
    up,
    setUp,
    toggleHidden,
  } = scene;
  const [tab, setTab] = useState("marker");
  const [search, setSearch] = useState("");
  const [inspector, setInspector] = useState("info");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<
    "folder" | "help" | "export" | "settings" | "batch" | null
  >(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [folder, setFolder] = useState("");
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
  usePlaybackClock(playback, meta, !!points, mediaClock.mode);
  const sourceChanged = frameError?.action === "reopen";
  useEffect(() => {
    if (frameError) setPlaying(false);
    if (frameError?.action === "reopen")
      setModal((current) => (current === "export" ? null : current));
  }, [frameError, setPlaying]);
  const { series, error: seriesError } = useSeries(
    meta,
    selection,
    roi,
    sourceChanged,
  );
  const params = useParameters(
    meta,
    inspector === "parameters",
    sourceChanged,
    setError,
  );
  const {
    point: currentPoint,
    label: selectedLabel,
    unit: selectedUnit,
  } = selectedChannel(meta, selection);
  const clock = meta ? frame / meta.pointRate : 0;
  const hideInspector = useCallback(() => setShowInspector(false), []);
  const toggleInspector = useCallback(() => setShowInspector((v) => !v), []);
  const seekSignal = (time: number) => {
    if (meta) {
      setPlaying(false);
      seek(Math.round(time * meta.pointRate));
    }
  };
  const { reset: resetPlayback } = playback;
  const { reset: resetScene } = scene;
  const applyAcquisition = useCallback(
    (data: Acquisition) => {
      resetPlayback(data.frameCount);
      setMediaClock(EMPTY_CLOCK);
      setIncomingMedia(null);
      setError("");
      setMeta(data);
      setSearch("");
      setTab("marker");
      resetScene(data.points);
      setSelection(defaultSelection(data.points));
      if (window.innerWidth < 1000) setShowLibrary(false);
    },
    [resetPlayback, resetScene],
  );
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
        if (version === loadVersion.current) setError(errorMessage(e));
      } finally {
        if (version === loadVersion.current) setLoading("");
      }
    },
    [applyAcquisition, setPlaying],
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
      .catch((e) => setError(errorMessage(e)));
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
    void desktop.ready().catch((e) => setError(errorMessage(e)));
    return unsubscribe;
  }, [desktopReady, applyAcquisition, openFile]);
  const openNativeFile = useCallback(() => {
    void desktop?.openFile().catch((e) => setError(errorMessage(e)));
  }, []);
  const openFolder = useCallback(() => {
    setError("");
    if (desktop)
      void desktop.openFolder().catch((e) => setError(errorMessage(e)));
    else setModal("folder");
  }, []);
  const showHelp = useCallback(() => setModal("help"), []);
  const showBatch = useCallback(() => setModal("batch"), []);
  const refreshLibrary = useCallback(() => {
    void api<Library>("/api/library")
      .then(setLibrary)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const showSettings = useCallback(() => setModal("settings"), []);
  const toggleLibrary = useCallback(() => setShowLibrary((v) => !v), []);
  const openInspector = useCallback((tab: string) => {
    setShowInspector(true);
    setInspector(tab);
  }, []);
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
      setError(errorMessage(e));
    } finally {
      setLoading("");
    }
  };
  const togglePlay = useCallback(() => {
    if (frameError?.action === "reopen") return;
    if (frameError) retryFrames();
    playback.toggle();
  }, [frameError, retryFrames, playback.toggle]);
  usePlaybackShortcuts({
    enabled: !modal && !!meta,
    frame,
    roi,
    seek,
    togglePlay,
    pause,
  });
  const closeModal = useCallback(() => setModal(null), []);
  useDialogFocus(modal, dialogRef, closeModal);
  const pickPoint = useCallback(
    (id: number) => {
      setSelection({ kind: "point", id });
      if (meta?.points[id].kind === "marker") setTab("marker");
      else setTab("model");
    },
    [meta],
  );
  const { toggleVirtual: toggleSceneVirtual } = scene;
  const toggleVirtual = useCallback(
    () => toggleSceneVirtual(meta?.points || []),
    [toggleSceneVirtual, meta],
  );
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
      setError(errorMessage(e));
    } finally {
      setLoading("");
    }
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
      <AppHeader
        openNativeFile={openNativeFile}
        openFolder={openFolder}
        onHelp={showHelp}
      />
      <div
        className={`app-body ${showLibrary ? "" : "hide-library"} ${showInspector ? "" : "hide-inspector"}`}
      >
        <WorkspaceRail
          showLibrary={showLibrary}
          onToggleLibrary={toggleLibrary}
          showInspector={showInspector}
          inspector={inspector}
          onInspector={openInspector}
          onSettings={showSettings}
          onHelp={showHelp}
        />
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
          <FilePanel
            library={library}
            selectedId={meta?.id}
            training={training}
            onRefresh={refreshLibrary}
            openFolder={openFolder}
            openFile={openFile}
            onBatch={showBatch}
          />
          <ChannelPanel
            meta={meta}
            tab={tab}
            setTab={setTab}
            search={search}
            setSearch={setSearch}
            virtual={virtual}
            toggleVirtual={toggleVirtual}
            selection={selection}
            setSelection={setSelection}
            hidden={hidden}
            toggleHidden={toggleHidden}
            pickPoint={pickPoint}
          />
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
          <div className="comparison-toolbar-host" ref={setComparisonHost} />
          <div
            className={`visual-panels ${showMedia && mediaExpanded ? "media-expanded" : ""}`}
          >
            <ScenePanel
              meta={meta}
              frame={frame}
              points={points}
              selected={currentPoint?.kind === "marker" ? selection.id : null}
              scene={scene}
              sourceChanged={sourceChanged}
              showMedia={showMedia}
              onPick={pickPoint}
              onToggleInspector={toggleInspector}
              media={
                showMedia &&
                meta && (
                  <Suspense
                    fallback={
                      <div className="media-loading">
                        {t("正在打开同步面板…")}
                      </div>
                    }
                  >
                    <MediaPanel
                      key={acquisitionKey(meta)}
                      session={mediaSession}
                      onTrial={(id) => void openFile(id)}
                      trialIds={
                        meta.id === "demo"
                          ? ["demo"]
                          : [
                              ...new Set([
                                ...(library?.files.map((f) => f.id) || []),
                                meta.id,
                              ]),
                            ]
                      }
                      meta={meta}
                      frame={frame}
                      playing={playing}
                      expanded={mediaExpanded}
                      comparisonHost={comparisonHost}
                      onExpanded={setMediaExpanded}
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
                )
              }
            />
            <PanelDivider
              label={t("调整三维与曲线区域")}
              orientation="horizontal"
              value={layout.scene}
              min={0.3}
              max={0.82}
              onChange={(value) => resizePanel("scene", value)}
              onReset={() => resizePanel("scene", defaultLayout.scene)}
            />
            <SignalPanel
              meta={meta}
              selection={selection}
              label={selectedLabel}
              unit={selectedUnit}
              series={series}
              error={seriesError}
              time={clock}
              onSeek={seekSignal}
            />
          </div>
          <TimelinePanel
            meta={meta}
            playback={playback}
            sourceChanged={sourceChanged}
            togglePlay={togglePlay}
          />
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
          <InspectorPanel
            meta={meta}
            playback={playback}
            points={points}
            selection={selection}
            inspector={inspector}
            setInspector={setInspector}
            onClose={hideInspector}
            params={params}
          />
          <div className="inspector-bottom">
            <Info size={13} />
            <span>{t("数据在此设备上处理")}</span>
          </div>
        </aside>
      </div>
      <StatusBar
        loading={loading}
        ready={!!meta}
        demo={meta?.id === "demo"}
        name={meta?.name}
      />
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
                <SettingsPanel onClose={closeModal} />
              </>
            )}
            {modal === "folder" && (
              <FolderForm
                folder={folder}
                setFolder={setFolder}
                onSubmit={saveFolder}
                error={error}
                loading={loading}
                onClose={closeModal}
              />
            )}
            {modal === "export" && meta && (
              <ExportOptions
                meta={meta}
                selection={selection}
                roi={roi}
                onClose={() => setModal(null)}
              />
            )}
            {modal === "help" && <HelpContent onClose={closeModal} />}
          </div>
        </div>
      )}
    </div>
  );
}
