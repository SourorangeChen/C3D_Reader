import { Film, Images } from "lucide-react";
import { usePreferences } from "./Preferences";
import type { MediaSync } from "./useMediaSync";

/** Import buttons, and FPS / frame base / PTS table for image sequences. */
export function MediaSourceControls({ media }: { media: MediaSync }) {
  const { t } = usePreferences();
  const { asset, pts } = media;
  return (
    <>
      <div className="media-imports">
        <label className="button file-choice">
          <Film size={14} />
          {t("导入视频")}
          <input
            type="file"
            accept=".mp4,.m4v,.mov,.webm,.ogv"
            aria-label={t("导入视频")}
            onChange={(e) => {
              media.importFiles([...(e.target.files || [])]);
              e.target.value = "";
            }}
          />
        </label>
        <label className="button file-choice">
          <Images size={14} />
          {t("导入图片序列")}
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.bmp"
            multiple
            aria-label={t("导入图片序列")}
            onChange={(e) => {
              media.importFiles([...(e.target.files || [])]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {asset?.kind === "images" && (
        <div className="media-timing">
          <label>
            {t("源视频 FPS")}
            <input
              type="number"
              min="0.001"
              max="10000"
              step="any"
              placeholder={t("按此录制填写")}
              value={media.fps}
              disabled={!!pts}
              onChange={(e) => media.changeFPS(e.target.value)}
            />
          </label>
          <label>
            {t("文件帧号起点")}
            <select
              aria-label={t("文件帧号起点")}
              value={media.frameBase}
              disabled={!!pts}
              onChange={(e) => media.changeFrameBase(e.target.value)}
            >
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </label>
          <label className="button file-choice">
            {t(pts ? "替换 PTS 表" : "导入 PTS 表")}
            <input
              type="file"
              accept=".csv"
              aria-label={t("导入 PTS 表")}
              onChange={(e) => {
                void media.importPTS(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {pts && (
            <button className="button" onClick={media.clearPTS}>
              {t("改用 FPS")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
