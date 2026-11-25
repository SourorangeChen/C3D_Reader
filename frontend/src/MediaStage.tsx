import { useEffect, useState } from "react";
import { Images } from "lucide-react";
import { usePreferences } from "./Preferences";
import type { MediaSync } from "./useMediaSync";

function useImageURL(file?: File) {
  const [loaded, setLoaded] = useState<{ file: File; url: string } | null>(
    null,
  );
  useEffect(() => {
    if (!file) {
      setLoaded(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLoaded({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return loaded?.file === file ? loaded?.url : null;
}

/** The video or the image for the current frame, with gap and range notices. */
export function MediaStage({
  media,
  expanded,
  onExpanded,
}: {
  media: MediaSync;
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
}) {
  const { t } = usePreferences();
  const { asset, outOfRange, missingImage } = media;
  const imageURL = useImageURL(media.imageFile);
  return (
    <div
      className={`media-stage ${outOfRange || missingImage ? "media-unavailable" : ""}`}
    >
      {asset?.kind === "video" && (
        <video
          key={asset.url}
          ref={media.video}
          src={asset.url}
          muted
          playsInline
          preload="auto"
          controls={!media.synced && !media.recognizing}
          aria-label={t("参考视频")}
          onKeyDown={(e) => {
            if (e.key === "Escape" && expanded) {
              onExpanded(false);
              e.preventDefault();
            }
            e.stopPropagation();
          }}
          onPlay={() => onExpanded(true)}
          onLoadedMetadata={(e) => media.videoLoaded(e.currentTarget.duration)}
          onTimeUpdate={(e) =>
            media.setPreviewTime(e.currentTarget.currentTime)
          }
          onError={media.videoFailed}
        />
      )}
      {asset?.kind === "images" && imageURL && (
        <img
          src={imageURL}
          alt={t("原视频帧 {0}", [asset.frames[media.imageIndex].frame])}
          onError={() => media.setError("图片无法读取，请检查格式或重新导入。")}
        />
      )}
      {!asset && (
        <div className="media-empty">
          <Images size={28} />
          <p>{t("将视频或图片序列与 Vicon 并排核查")}</p>
          <span>{t("素材仅在本机读取。桌面版导入后自动识别动作并对齐。")}</span>
        </div>
      )}
      {outOfRange && (
        <div className="media-message">{t("当前 C3D 帧超出素材时间范围")}</div>
      )}
      {missingImage && !outOfRange && (
        <div className="media-message">
          {t("该时刻没有对应图片，保留采样缺口")}
        </div>
      )}
      {asset?.kind === "images" && !media.ready && (
        <div className="media-message">
          {t("填写此录制的 FPS，或导入帧号–PTS 时间表")}
        </div>
      )}
    </div>
  );
}
