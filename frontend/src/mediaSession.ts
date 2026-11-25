import {
  cancelTraining,
  EMPTY_TRAINING,
  type TrainingState,
  type TrialIdentity,
} from "./trainingSession";
import type { ImageFrame, SyncMapping } from "./synchronization";

export type MediaAsset =
  | { kind: "video"; file: File; url: string }
  | { kind: "images"; frames: ImageFrame[] };
export type MediaSetup = {
  asset: MediaAsset;
  fps: string;
  frameBase: string;
  pts: number[] | null;
  origin: number;
  subjectX: string;
};
export type TrialMedia = MediaSetup & { mapping: SyncMapping };
export type MediaSession = {
  active: MediaSetup | null;
  trials: Map<string, TrialMedia>;
  assets: Set<MediaAsset>;
  training: TrainingState;
  listeners: Set<() => void>;
  trainingVersion: number;
  trainingTimer?: number;
  trainingController?: AbortController;
};
export function createMediaSession(): MediaSession {
  return {
    active: null,
    trials: new Map(),
    assets: new Set(),
    training: EMPTY_TRAINING,
    listeners: new Set(),
    trainingVersion: 0,
  };
}
export function acquisitionKey(
  meta: Pick<
    TrialIdentity,
    "id" | "revision" | "size" | "firstFrame" | "frameCount" | "pointRate"
  >,
) {
  return JSON.stringify([
    meta.id,
    meta.revision ?? "",
    meta.size,
    meta.firstFrame,
    meta.frameCount,
    meta.pointRate,
  ]);
}
export function disposeMediaSession(session: MediaSession) {
  cancelTraining(session);
  session.listeners.clear();
  for (const asset of session.assets)
    if (asset.kind === "video") URL.revokeObjectURL(asset.url);
  session.assets.clear();
  session.trials.clear();
  session.active = null;
}
