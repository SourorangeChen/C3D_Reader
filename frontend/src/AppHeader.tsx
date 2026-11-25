import { memo } from "react";
import { CircleHelp, File, FolderOpen } from "lucide-react";
import { version } from "../../package.json";
import { desktop } from "./desktop";
import { IconButton, Mark } from "./IconButton";
import { usePreferences } from "./Preferences";

// Brand, version and the open / help actions. Independent of playback.
export const AppHeader = memo(function AppHeader({
  openNativeFile,
  openFolder,
  onHelp,
}: {
  openNativeFile: () => void;
  openFolder: () => void;
  onHelp: () => void;
}) {
  const { t } = usePreferences();
  return (
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
        <IconButton label={t("使用帮助")} onClick={onHelp}>
          <CircleHelp size={17} />
        </IconButton>
      </div>
    </header>
  );
});
