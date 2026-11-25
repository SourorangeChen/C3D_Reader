import { FolderOpen } from "lucide-react";
import { usePreferences } from "./Preferences";

// Browser version: type the path of a local folder of C3D files.
export function FolderForm({
  folder,
  setFolder,
  onSubmit,
  error,
  loading,
  onClose,
}: {
  folder: string;
  setFolder: (folder: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  error: string;
  loading: string;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  return (
    <form onSubmit={onSubmit}>
      <p>
        {t("填写包含 C3D 文件的文件夹路径。支持外置硬盘，数据在本机直接读取。")}
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
        <button type="button" className="button" onClick={onClose}>
          {t("取消")}
        </button>
        <button className="button primary" type="submit" disabled={!!loading}>
          <FolderOpen size={14} />
          {t("打开文件夹")}
        </button>
      </div>
    </form>
  );
}
