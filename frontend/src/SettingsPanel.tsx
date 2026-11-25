import { RefreshCw } from "lucide-react";
import { defaultLayout, usePreferences } from "./Preferences";

// Theme, interface language and layout reset. Changes save immediately.
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { t } = usePreferences();
  const { preferences, update: updatePreferences } = usePreferences();
  return (
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
        <p>{t("拖动面板之间的分隔条调整大小；双击分隔条恢复默认。")}</p>
        <button
          className="button"
          onClick={() => updatePreferences({ layout: defaultLayout })}
        >
          <RefreshCw size={14} />
          {t("恢复默认布局")}
        </button>
      </div>
      <p className="form-note">{t("设置自动保存在本机，即时生效。")}</p>
      <div className="modal-actions">
        <button className="button primary" onClick={onClose}>
          {t("完成")}
        </button>
      </div>
    </>
  );
}
