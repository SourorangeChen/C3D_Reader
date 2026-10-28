import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./types";
import type { Acquisition } from "./types";

const BLOCK = 500;
type FrameFailure = {
  acquisition: Acquisition;
  block: number;
  message: string;
  action: "retry" | "reopen";
};
export function useFrames(meta: Acquisition | null, frame: number) {
  const cache = useRef(new Map<number, Float32Array>());
  const [revision, setRevision] = useState(0);
  const [failure, setFailure] = useState<FrameFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((v) => v + 1), []);
  const identity = useRef<Acquisition | null>(null);
  const invalidated = useRef<Acquisition | null>(null);
  if (identity.current !== meta) {
    cache.current = new Map();
    identity.current = meta;
    invalidated.current = null;
  }
  const block = Math.floor(frame / BLOCK) * BLOCK;
  useEffect(() => {
    if (!meta || invalidated.current === meta) return;
    const controller = new AbortController();
    setFailure(null);
    const fetchBlock = async (start: number) => {
      if (start >= meta.frameCount || cache.current.has(start)) return;
      const response = await fetch(
        `/api/files/${meta.id}/frames?start=${start}&count=${BLOCK}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ApiError(
          response.status >= 500 || typeof body?.detail !== "string"
            ? "暂时无法读取帧数据，请重试。"
            : body.detail,
          response.status,
        );
      }
      const bytes = await response.arrayBuffer();
      if (controller.signal.aborted || identity.current !== meta) return;
      cache.current.set(start, new Float32Array(bytes));
      for (const key of cache.current.keys()) {
        if (Math.abs(key - block) > BLOCK * 2) cache.current.delete(key);
      }
      setRevision((v) => v + 1);
    };
    void fetchBlock(block)
      .then(() => fetchBlock(block + BLOCK))
      .catch((e) => {
        if (controller.signal.aborted || identity.current !== meta) return;
        const changed = e instanceof ApiError && e.status === 409;
        if (changed) {
          // The next request could read a new file revision. Require fresh
          // metadata before fetching again, even when seeking to another block.
          invalidated.current = meta;
          cache.current.clear();
        }
        setFailure({
          acquisition: meta,
          block,
          message:
            e instanceof ApiError ? e.message : "暂时无法读取帧数据，请重试。",
          action: changed ? "reopen" : "retry",
        });
      });
    return () => controller.abort();
  }, [meta, block, attempt]);
  void revision;
  const buffer = cache.current.get(block);
  const offset = (frame - block) * (meta?.points.length || 0) * 3;
  return {
    points: buffer?.subarray(offset, offset + (meta?.points.length || 0) * 3),
    error:
      failure?.acquisition === meta &&
      (failure.action === "reopen" || failure.block === block)
        ? failure
        : null,
    retry,
  };
}
