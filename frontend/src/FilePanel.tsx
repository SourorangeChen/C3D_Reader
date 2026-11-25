import { memo, useState } from "react";
import {
  Activity,
  ChevronDown,
  Download,
  File,
  FolderOpen,
  RefreshCw,
  Search,
} from "lucide-react";
import { IconButton } from "./IconButton";
import { usePreferences } from "./Preferences";
import { trialSharingLabel, type TrainingState } from "./trainingSession";
import { formatBytes, type Library } from "./types";

// Folder files with their shared-lag status, the demo and folder export.
export const FilePanel = memo(function FilePanel({
  library,
  selectedId,
  training,
  onRefresh,
  openFolder,
  openFile,
  onBatch,
}: {
  library: Library | null;
  selectedId: string | undefined;
  training: TrainingState;
  onRefresh: () => void;
  openFolder: () => void;
  openFile: (id: string) => Promise<void>;
  onBatch: () => void;
}) {
  const { t } = usePreferences();
  const [fileSearch, setFileSearch] = useState("");
  return (
    <>
      <div className="panel-heading">
        <h2>{t("采集文件")}</h2>
        <span>{library?.files.length || 0}</span>
        <IconButton label={t("刷新文件夹")} onClick={onRefresh}>
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
              className={`file-row ${selectedId === f.id ? "selected" : ""}`}
              key={f.id}
              onClick={() => void openFile(f.id)}
            >
              <File size={13} />
              <span>{f.name}</span>
              <small title={formatBytes(f.size)}>
                {(() => {
                  const trial = training.result?.trials.find(
                    (trial) => trial.acquisition.id === f.id,
                  );
                  return trial
                    ? t(trialSharingLabel(trial))
                    : training.job?.status === "running" &&
                        training.ids.includes(f.id)
                      ? t(
                          training.referenceId === f.id
                            ? "确定 lag 中"
                            : "等待共享",
                        )
                      : formatBytes(f.size);
                })()}
              </small>
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
        className={`demo-row ${selectedId === "demo" ? "selected" : ""}`}
        onClick={() => void openFile("demo")}
      >
        <Activity size={13} />
        <span>{t("合成步行示例")}</span>
        <span className="tiny-note">Demo</span>
      </button>
      <button
        className="batch-export-button"
        onClick={onBatch}
        disabled={!library?.folder}
      >
        <Download size={13} /> {t("批量导出 CSV")}
      </button>
    </>
  );
});
