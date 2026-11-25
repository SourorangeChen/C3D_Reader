import { usePreferences } from "./Preferences";

// Usage help: viewing, signals and events, shortcuts, export and data conventions.
export function HelpContent({ onClose }: { onClose: () => void }) {
  const { t } = usePreferences();
  return (
    <div className="help-content">
      <p>
        {t(
          "用于运动捕捉数据的本地读取与检查。选择文件后，3D 场景、信号曲线与事件时间轴同步显示。",
        )}
      </p>
      <div className="help-row">
        <strong>{t("三维观察")}</strong>
        <span>
          {t("左键拖动旋转，右键平移，滚轮缩放；点击标记点查看 XYZ 曲线。")}
        </span>
      </div>
      <div className="help-row">
        <strong>{t("信号与事件")}</strong>
        <span>
          {t("左侧切换标记点、模型输出或模拟信号。点击曲线或事件定位帧。")}
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
        <button className="button primary" onClick={onClose}>
          {t("开始查看")}
        </button>
      </div>
    </div>
  );
}
