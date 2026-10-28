import { useEffect, useRef, useState } from "react";
import { desktop } from "./desktop";

export type AutomaticOptions = {
  acquisitionId: string;
  start: number;
  stop: number;
  times?: number[];
  origin: number;
  subjectX: number;
};
export type AutomaticResult = {
  status: "accepted" | "rejected";
  reason: string;
  offset?: number;
  correlation?: number | null;
  candidates: { offset: number; error: number }[];
  [key: string]: unknown;
};
export type AutomaticJob = {
  id: string;
  status: "running" | "complete" | "failed" | "cancelled";
  phase: string;
  progress: number;
  result: AutomaticResult | null;
  error: string | null;
};
type Props = AutomaticOptions & {
  files: File[];
  ready: boolean;
  enabled: boolean;
  blocked: boolean;
  onStart: () => void;
  onResult: (result: AutomaticResult) => void;
};

export function useAutomaticAlignment(props: Props) {
  const [job, setJob] = useState<AutomaticJob | null>(null);
  const [error, setError] = useState("");
  const active = useRef<{
    version: number;
    id?: string;
    timer?: number;
    controller?: AbortController;
  }>({ version: 0 });
  const latest = useRef(props);
  latest.current = props;
  const available = !!desktop?.startAutoAlignment;
  const stop = () => {
    const state = active.current;
    state.version++;
    window.clearTimeout(state.timer);
    state.controller?.abort();
    if (state.id)
      void fetch(`/api/auto-alignment/${state.id}`, { method: "DELETE" }).catch(
        () => {},
      );
    state.id = undefined;
  };
  const cancel = () => {
    stop();
    setError("");
    setJob((value) =>
      value?.status === "running" ? { ...value, status: "cancelled" } : null,
    );
  };
  const start = async () => {
    const p = latest.current;
    if (
      !desktop?.startAutoAlignment ||
      !p.ready ||
      p.blocked ||
      !p.files.length
    )
      return;
    stop();
    const version = active.current.version;
    setError("");
    setJob({
      id: "",
      status: "running",
      phase: "extracting",
      progress: 0,
      result: null,
      error: null,
    });
    p.onStart();
    try {
      const created = await desktop.startAutoAlignment(p.files, {
        acquisitionId: p.acquisitionId,
        start: p.start,
        stop: p.stop,
        times: p.times,
        origin: p.origin,
        subjectX: p.subjectX,
      });
      if (version !== active.current.version) {
        void fetch(`/api/auto-alignment/${created.id}`, {
          method: "DELETE",
        }).catch(() => {});
        return;
      }
      active.current.id = created.id;
      const poll = async () => {
        if (version !== active.current.version) return;
        try {
          const controller = new AbortController();
          active.current.controller = controller;
          const response = await fetch(`/api/auto-alignment/${created.id}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("无法读取自动对齐进度，请重试。");
          const value: AutomaticJob = await response.json();
          if (version !== active.current.version) return;
          setJob(value);
          if (value.status === "running")
            active.current.timer = window.setTimeout(poll, 500);
          else {
            active.current.id = undefined;
            if (value.status === "failed")
              setError(value.error || "自动对齐失败，请重试。");
            if (
              value.status === "complete" &&
              value.result?.status === "accepted" &&
              Number.isFinite(value.result.offset)
            )
              latest.current.onResult(value.result);
          }
        } catch (e) {
          if (version === active.current.version) {
            stop();
            setJob(null);
            setError((e as Error).message);
          }
        }
      };
      await poll();
    } catch (e) {
      if (version === active.current.version) {
        setJob(null);
        setError((e as Error).message);
      }
    }
  };
  useEffect(() => {
    setJob(null);
    setError("");
    if (props.enabled && props.ready && !props.blocked && props.files.length)
      void start();
    return stop;
    // ROI changes do not interrupt playback or restart analysis. Retry uses the latest ROI.
  }, [
    props.files,
    props.times,
    props.acquisitionId,
    props.ready,
    props.enabled,
    props.blocked,
    props.origin,
  ]);
  return { job, error, start, cancel, available };
}
