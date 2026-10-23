import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { api } from "./types";
import { usePreferences } from "./Preferences";

type Job = {
  id: string;
  folderName: string;
  status: "running" | "ready" | "cancelled" | "error" | "expired";
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  current: string;
  errors: string[];
};
export function BatchExportDialog({
  visible,
  fileCount,
  onClose,
  dialogRef,
}: {
  visible: boolean;
  fileCount: number;
  onClose: () => void;
  dialogRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = usePreferences();
  const [job, setJob] = useState<Job | null>(null);
  const [pending, setPending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let id: string | null = null;
    try {
      id = sessionStorage.getItem("c3d-folder-export");
    } catch {}
    if (id)
      void api<Job>(`/api/library/exports/${encodeURIComponent(id)}`)
        .then((data) => {
          if (!disposed) setJob(data);
        })
        .catch(() => {
          try {
            sessionStorage.removeItem("c3d-folder-export");
          } catch {}
        });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (job) {
      try {
        sessionStorage.setItem("c3d-folder-export", job.id);
      } catch {}
    }
  }, [job?.id]);
  useEffect(() => {
    if (!visible || !job || job.status !== "ready") return;
    let disposed = false;
    void api<Job>(`/api/library/exports/${job.id}`)
      .then((data) => {
        if (!disposed) setJob(data);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [visible, job?.id, job?.status]);
  useEffect(() => {
    if (!job || job.status !== "running") return;
    let disposed = false,
      timer = 0;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const data = await api<Job>(`/api/library/exports/${job.id}`, {
          signal: controller.signal,
        });
        if (!disposed) {
          setJob(data);
          setError("");
          timer = window.setTimeout(poll, 600);
        }
      } catch (e) {
        if (!disposed) {
          setError((e as Error).message);
          timer = window.setTimeout(poll, 2000);
        }
      }
    };
    timer = window.setTimeout(poll, 200);
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [job?.id, job?.status]);
  const start = async () => {
    setPending(true);
    setError("");
    setCancelling(false);
    try {
      setJob(await api<Job>("/api/library/exports", { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const cancel = async () => {
    if (!job) return;
    setCancelling(true);
    try {
      setJob(
        await api<Job>(`/api/library/exports/${job.id}`, { method: "DELETE" }),
      );
    } catch (e) {
      setError((e as Error).message);
      setCancelling(false);
    }
  };
  const download = async (event: React.MouseEvent) => {
    event.preventDefault();
    if (!job || pending) return;
    setPending(true);
    setError("");
    try {
      const latest = await api<Job>(`/api/library/exports/${job.id}`);
      setJob(latest);
      if (latest.status === "ready") {
        const link = document.createElement("a");
        link.href = `/api/library/exports/${job.id}/download`;
        link.download = "c3d-folder-csv.zip";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  if (!visible) return null;
  const active = job?.status === "running";
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        ref={dialogRef}
      >
        <div className="modal-title">
          <h2 id="dialog-title">{t("导出整个文件夹")}</h2>
          <button
            className="icon-button"
            aria-label={t("关闭窗口")}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
        {job && (
          <p className="batch-current">
            {t("任务目录")}: <strong>{job.folderName}</strong>
          </p>
        )}
        <p>
          {t(
            job
              ? "此任务包含任务目录中的全部 C3D 文件，不含子目录。"
              : "当前目录的全部 C3D 文件，包括未显示在搜索结果中的文件；不含子目录。",
          )}
        </p>
        <p>
          {t(
            "每个文件分别生成 points.csv 和 analog.csv（有模拟通道时），保留所有通道、完整采样率及整个采集区间。",
          )}
        </p>
        {job ? (
          <div className="batch-progress" role="status" aria-live="polite">
            <strong>
              {active
                ? t("正在导出…")
                : job.status === "ready"
                  ? t("已准备好下载")
                  : job.status === "cancelled"
                    ? t("导出已取消，可以重新开始。")
                    : job.status === "expired"
                      ? t("导出已过期，请重新开始。")
                      : t("导出失败，请检查磁盘空间和文件权限后重试。")}
            </strong>
            <progress
              max={job.total}
              value={job.completed}
              aria-label={t("正在导出…")}
            />
            <div>
              {t("{0} / {1} 个文件", [job.completed, job.total])} ·{" "}
              {t("成功 {0}，失败 {1}", [job.succeeded, job.failed])}
            </div>
            {job.current && (
              <div className="batch-current" title={job.current}>
                {job.current}
              </div>
            )}
            {!!job.errors.length && (
              <details>
                <summary>{t("失败文件（详情见 manifest.json）")}</summary>
                <ul>
                  {job.errors.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <dl className="export-details">
            <div>
              <dt>{t("文件数")}</dt>
              <dd>{fileCount}</dd>
            </div>
          </dl>
        )}
        <p className="form-note">
          {t(
            "ZIP 内含 manifest.json，记录单位、采样率和失败文件。源文件保持完整，处理仅在本机进行。",
          )}
        </p>
        {error && (
          <p className="error-text" role="alert">
            {t(error)}
          </p>
        )}
        {!fileCount && !job && (
          <p className="form-note">
            {t("没有可导出的 C3D 文件，请先打开数据文件夹。")}
          </p>
        )}
        <div className="modal-actions">
          {active ? (
            <button
              className="button"
              disabled={cancelling}
              onClick={() => void cancel()}
            >
              {t(cancelling ? "正在取消…" : "取消导出")}
            </button>
          ) : (
            <button
              className="button"
              onClick={() => void start()}
              disabled={pending || !fileCount}
            >
              {t(pending ? "正在导出…" : job ? "导出当前目录" : "开始导出")}
            </button>
          )}
          {job?.status === "ready" && (
            <a
              className="button primary"
              href={`/api/library/exports/${job.id}/download`}
              download
              onClick={download}
              aria-disabled={pending}
            >
              <Download size={14} />
              {t("下载 ZIP")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
