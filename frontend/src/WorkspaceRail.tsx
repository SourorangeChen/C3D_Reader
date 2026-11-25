import { memo } from "react";
import {
  Braces,
  CircleHelp,
  Info,
  Layers,
  List,
  Settings2,
} from "lucide-react";
import { IconButton } from "./IconButton";
import { usePreferences } from "./Preferences";

// Left rail: toggle the file panel or an inspector tab (see toggleSidePanel),
// open settings and help.
export const WorkspaceRail = memo(function WorkspaceRail({
  showLibrary,
  onToggleLibrary,
  showInspector,
  inspector,
  onInspector,
  onSettings,
  onHelp,
}: {
  showLibrary: boolean;
  onToggleLibrary: () => void;
  showInspector: boolean;
  inspector: string;
  onInspector: (tab: string) => void;
  onSettings: () => void;
  onHelp: () => void;
}) {
  const { t } = usePreferences();
  return (
    <nav className="rail" aria-label={t("工作区面板")}>
      <div className="rail-top">
        {/* Left side: the file and channel panel next to the rail. */}
        <div className="rail-side rail-side-left">
          <IconButton
            label={t("文件与通道")}
            onClick={onToggleLibrary}
            active={showLibrary}
          >
            <Layers size={19} />
          </IconButton>
        </div>
        <span className="rail-divider" aria-hidden="true" />
        {/* Right side: one inspector, three tabs. */}
        <div
          className="rail-side rail-side-right"
          role="group"
          aria-label={t("采集检查器")}
        >
          <IconButton
            label={t("采集信息")}
            onClick={() => onInspector("info")}
            active={showInspector && inspector === "info"}
          >
            <Info size={19} />
          </IconButton>
          <IconButton
            label={t("事件列表")}
            onClick={() => onInspector("events")}
            active={showInspector && inspector === "events"}
          >
            <List size={19} />
          </IconButton>
          <IconButton
            label={t("C3D 参数")}
            onClick={() => onInspector("parameters")}
            active={showInspector && inspector === "parameters"}
          >
            <Braces size={19} />
          </IconButton>
        </div>
      </div>
      <div className="rail-bottom">
        <IconButton label={t("设置")} onClick={onSettings}>
          <Settings2 size={18} />
        </IconButton>
        <IconButton label={t("使用帮助")} onClick={onHelp}>
          <CircleHelp size={18} />
        </IconButton>
      </div>
    </nav>
  );
});
