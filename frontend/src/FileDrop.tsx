import { useRef, useState } from "react";
import { File } from "lucide-react";
import { usePreferences } from "./Preferences";
import { desktop } from "./desktop";

/**
 * Window-wide file drop. Nested elements fire enter/leave in pairs, so a depth
 * count keeps the overlay up until the pointer leaves the window.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const handlers = {
    onDragEnter: (event: React.DragEvent) => {
      if (event.dataTransfer.types.includes("Files")) {
        event.preventDefault();
        depth.current++;
        setDragging(true);
      }
    },
    onDragOver: (event: React.DragEvent) => {
      if (event.dataTransfer.types.includes("Files")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    },
    onDragLeave: (event: React.DragEvent) => {
      event.preventDefault();
      if (--depth.current <= 0) {
        depth.current = 0;
        setDragging(false);
      }
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      onFiles([...event.dataTransfer.files]);
    },
  };
  return { dragging, handlers };
}

export function FileDropOverlay() {
  const { t } = usePreferences();
  return (
    <div className="file-drop-overlay" role="status">
      <div>
        <File size={34} />
        <h2>{t("松开以导入文件")}</h2>
        <p>
          {desktop
            ? t("直接读取本机文件，支持大型采集")
            : t("支持视频或编号图片序列；C3D 拖放请使用桌面版")}
        </p>
      </div>
    </div>
  );
}
