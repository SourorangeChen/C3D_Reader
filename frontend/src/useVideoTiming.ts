import { useEffect, useState, type RefObject } from "react";
import { frameAtTime, readVideoTimes } from "./videoTiming";

export function useVideoTiming(
  file: File | undefined,
  video: RefObject<HTMLVideoElement | null>,
) {
  const [index, setIndex] = useState<{
    file: File;
    times: number[];
    error: boolean;
  } | null>(null);
  const [picture, setPicture] = useState<{ file: File; time: number } | null>(
    null,
  );
  const [seeking, setSeeking] = useState(false);
  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    void readVideoTimes(file, controller.signal).then(
      (times) => {
        if (!controller.signal.aborted) setIndex({ file, times, error: false });
      },
      () => {
        if (!controller.signal.aborted)
          setIndex({ file, times: [], error: true });
      },
    );
    return () => controller.abort();
  }, [file]);
  useEffect(() => {
    const element = video.current;
    if (!file || !element) return;
    let handle = 0,
      disposed = false;
    const schedule = () => {
      if (disposed || !element.requestVideoFrameCallback) return;
      handle = element.requestVideoFrameCallback((_now, metadata) => {
        if (disposed) return;
        setPicture({ file, time: metadata.mediaTime });
        schedule();
      });
    };
    const start = () => setSeeking(true);
    const finish = () => setSeeking(false);
    setSeeking(false);
    element.addEventListener("seeking", start);
    element.addEventListener("seeked", finish);
    schedule();
    return () => {
      disposed = true;
      if (handle) element.cancelVideoFrameCallback(handle);
      element.removeEventListener("seeking", start);
      element.removeEventListener("seeked", finish);
    };
  }, [file, video]);
  const times = file && index?.file === file ? index.times : [];
  const presentedTime = file && picture?.file === file ? picture.time : null;
  return {
    times,
    presentedTime,
    seeking: !!file && seeking,
    loading: !!file && index?.file !== file,
    error: !!file && index?.file === file && index.error,
    frame: presentedTime == null ? -1 : frameAtTime(times, presentedTime),
  };
}
