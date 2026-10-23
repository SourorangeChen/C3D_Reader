import { useEffect, useRef, useState } from "react";
import type { Acquisition } from "./types";

const BLOCK = 500;
export function useFrames(meta: Acquisition | null, frame: number) {
  const cache = useRef(new Map<number, Float32Array>());
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const identity = useRef<Acquisition | null>(null);
  if (identity.current !== meta) {
    cache.current = new Map();
    identity.current = meta;
  }
  const block = Math.floor(frame / BLOCK) * BLOCK;
  useEffect(() => {
    if (!meta) return;
    const controller = new AbortController();
    setError("");
    const fetchBlock = async (start: number) => {
      if (start >= meta.frameCount || cache.current.has(start)) return;
      const response = await fetch(
        `/api/files/${meta.id}/frames?start=${start}&count=${BLOCK}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("无法读取帧数据，请检查硬盘连接。");
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
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [meta, block]);
  void revision;
  const buffer = cache.current.get(block);
  const offset = (frame - block) * (meta?.points.length || 0) * 3;
  return {
    points: buffer?.subarray(offset, offset + (meta?.points.length || 0) * 3),
    error,
  };
}
