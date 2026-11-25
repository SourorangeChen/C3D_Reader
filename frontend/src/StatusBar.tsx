import { memo } from "react";
import { Check } from "lucide-react";
import { usePreferences } from "./Preferences";

// Loading state, current acquisition name and playback key hints.
export const StatusBar = memo(function StatusBar({
  loading,
  ready,
  demo,
  name,
}: {
  loading: string;
  ready: boolean;
  demo: boolean;
  name: string | undefined;
}) {
  const { t } = usePreferences();
  return (
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
            {ready ? t("采集已就绪") : t("等待打开文件")}
          </>
        )}
      </span>
      <span>
        {demo
          ? t("合成演示数据，不含受试者信息")
          : name || t("本地 C3D 工作台")}
      </span>
      <span>
        {t("Space 播放 / 暂停")}
        <span className="status-separator">·</span>
        {t("← → 逐帧")}
      </span>
    </footer>
  );
});
