import { desktop } from "./desktop";
import type { Acquisition } from "./types";
import type { AutomaticJob, AutomaticOptions } from "./useAutomaticAlignment";
import {
  acquisitionKey,
  type MediaAsset,
  type MediaSession,
  type MediaSetup,
} from "./mediaSession";

export type TrialIdentity = Pick<
  Acquisition,
  | "id"
  | "revision"
  | "size"
  | "firstFrame"
  | "frameCount"
  | "pointRate"
  | "name"
>;
export type TrainingTrial = {
  acquisition: TrialIdentity;
  status: "accepted" | "shared" | "rejected";
  reason: string;
  detail?: string;
  baseline?: number;
  lag?: number | null;
  offset?: number | null;
  correlation?: number | null;
};
export type TrainingResult = {
  status: "accepted" | "rejected";
  reason: string;
  lag: number | null;
  referenceTrial: TrialIdentity;
  referenceResult?: Record<string, unknown>;
  trials: TrainingTrial[];
  candidates: [];
};
export type TrainingState = {
  asset: MediaAsset | null;
  job: AutomaticJob | null;
  result: TrainingResult | null;
  ids: string[];
  referenceId: string | null;
  referenceName: string;
  error: string;
};
export const EMPTY_TRAINING: TrainingState = {
  asset: null,
  job: null,
  result: null,
  ids: [],
  referenceId: null,
  referenceName: "",
  error: "",
};
export const subscribeTraining = (
  session: MediaSession,
  listener: () => void,
) => {
  session.listeners.add(listener);
  return () => {
    session.listeners.delete(listener);
  };
};
function update(session: MediaSession, value: Partial<TrainingState>) {
  session.training = { ...session.training, ...value };
  for (const listener of session.listeners) listener();
}
export function cancelTraining(session: MediaSession) {
  session.trainingVersion++;
  window.clearTimeout(session.trainingTimer);
  session.trainingController?.abort();
  const id = session.training.job?.id;
  if (id && session.training.job?.status === "running")
    void fetch(`/api/auto-alignment/${id}`, { method: "DELETE" }).catch(
      () => {},
    );
  if (session.training.job?.status === "running")
    update(session, { job: { ...session.training.job, status: "cancelled" } });
}
export async function startTraining(
  session: MediaSession,
  setup: MediaSetup,
  options: AutomaticOptions & { acquisitionIds: string[] },
  referenceName = options.acquisitionId,
) {
  if (!desktop?.startAutoAlignment) return;
  cancelTraining(session);
  const version = session.trainingVersion;
  session.trials.clear();
  update(session, {
    asset: setup.asset,
    ids: options.acquisitionIds,
    referenceId: options.acquisitionId,
    referenceName,
    result: null,
    error: "",
    job: {
      id: "",
      status: "running",
      phase: "extracting",
      progress: 0,
      result: null,
      error: null,
    },
  });
  try {
    const files =
      setup.asset.kind === "video"
        ? [setup.asset.file]
        : setup.asset.frames.map((f) => f.file);
    const created = await desktop.startAutoAlignment(files, options);
    if (version !== session.trainingVersion) {
      void fetch(`/api/auto-alignment/${created.id}`, {
        method: "DELETE",
      }).catch(() => {});
      return;
    }
    update(session, { job: created });
    const poll = async () => {
      if (version !== session.trainingVersion) return;
      try {
        const controller = new AbortController();
        session.trainingController = controller;
        const response = await fetch(`/api/auto-alignment/${created.id}`, {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("无法读取参考 trial 对齐进度，请重试。");
        const job: AutomaticJob = await response.json();
        if (version !== session.trainingVersion) return;
        if (job.status === "complete") {
          const result = job.result as unknown as TrainingResult | null;
          if (
            !result ||
            !result.referenceTrial ||
            !Array.isArray(result.trials)
          )
            throw new Error("共享对齐结果无效，请更新桌面版后重试。");
          // Publish all mappings before notifying the currently mounted trial.
          for (const trial of result.trials) {
            if (
              (trial.status !== "accepted" && trial.status !== "shared") ||
              !Number.isFinite(trial.baseline) ||
              !Number.isFinite(trial.lag) ||
              trial.lag !== result.lag
            )
              continue;
            session.trials.set(acquisitionKey(trial.acquisition), {
              ...setup,
              mapping: {
                baseline: trial.baseline!,
                lag: result.lag!,
                source: "auto",
                evidence: {
                  ...trial,
                  sharedLag: result.lag,
                  motionChecked: trial.status === "accepted",
                  referenceTrial: result.referenceTrial,
                  referenceResult: result.referenceResult,
                  convention:
                    "video_pts_s = (vicon_original_frame - 1) / point_rate + shared_lag_s",
                  visualReview: "pending",
                },
              },
            });
          }
          update(session, { job, result });
        } else {
          update(session, {
            job,
            error:
              job.status === "failed"
                ? job.error || "参考 trial 对齐失败，请更换 trial 后重试。"
                : "",
          });
          if (job.status === "running")
            session.trainingTimer = window.setTimeout(poll, 500);
        }
      } catch (error) {
        if (version === session.trainingVersion) {
          cancelTraining(session);
          update(session, { error: (error as Error).message });
        }
      }
    };
    await poll();
  } catch (error) {
    if (version === session.trainingVersion)
      update(session, { job: null, error: (error as Error).message });
  }
}

export function trialSharingLabel(trial: TrainingTrial) {
  return trial.status === "accepted"
    ? "参考匹配"
    : trial.status === "shared"
      ? "已共享"
      : trial.reason === "metadata_unavailable"
        ? "无法读取"
        : "未共享";
}
