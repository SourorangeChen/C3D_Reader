import { X } from "lucide-react";
import { usePreferences } from "./Preferences";
import { SettingsPanel } from "./SettingsPanel";
import { FolderForm } from "./FolderForm";
import { HelpContent } from "./HelpContent";
import { BatchExportDialog } from "./BatchExportDialog";
import { ExportOptions } from "./ExportOptions";
import type { Acquisition, Selection } from "./types";

export type AppModal = "folder" | "help" | "export" | "settings" | "batch";

const TITLES: Record<Exclude<AppModal, "batch">, string> = {
  folder: "打开本地数据文件夹",
  settings: "设置",
  export: "导出信号数据",
  help: "C3D Reader 使用帮助",
};

/** The batch export dialog and the shared modal for the other dialogs. */
export function AppDialogs({
  modal,
  onClose,
  dialogRef,
  fileCount,
  folder,
  setFolder,
  onSaveFolder,
  error,
  loading,
  meta,
  selection,
  roi,
}: {
  modal: AppModal | null;
  onClose: () => void;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  fileCount: number;
  folder: string;
  setFolder: (folder: string) => void;
  onSaveFolder: (event: React.FormEvent) => void;
  error: string;
  loading: string;
  meta: Acquisition | null;
  selection: Selection;
  roi: [number, number];
}) {
  const { t } = usePreferences();
  return (
    <>
      <BatchExportDialog
        visible={modal === "batch"}
        fileCount={fileCount}
        onClose={onClose}
        dialogRef={dialogRef}
      />
      {modal && modal !== "batch" && (
        <div
          className="modal-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose();
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
              <h2 id="dialog-title">{t(TITLES[modal])}</h2>
              <button
                className="icon-button"
                aria-label={t("关闭窗口")}
                onClick={onClose}
              >
                <X size={17} />
              </button>
            </div>
            {modal === "settings" && <SettingsPanel onClose={onClose} />}
            {modal === "folder" && (
              <FolderForm
                folder={folder}
                setFolder={setFolder}
                onSubmit={onSaveFolder}
                error={error}
                loading={loading}
                onClose={onClose}
              />
            )}
            {modal === "export" && meta && (
              <ExportOptions
                meta={meta}
                selection={selection}
                roi={roi}
                onClose={onClose}
              />
            )}
            {modal === "help" && <HelpContent onClose={onClose} />}
          </div>
        </div>
      )}
    </>
  );
}
