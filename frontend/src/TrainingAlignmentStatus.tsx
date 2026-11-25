import { usePreferences } from "./Preferences";
import { acquisitionKey } from "./mediaSession";
import { trialSharingLabel, type TrainingState } from "./trainingSession";
import { localizedError } from "./errors";

export function TrainingAlignmentStatus({
  state,
  currentId,
  currentKey,
  ready,
  available,
  subjectX,
  onSubjectX,
  onStart,
  onCancel,
  onTrial,
}: {
  state: TrainingState | null;
  currentId: string;
  currentKey: string;
  ready: boolean;
  available: boolean;
  subjectX: string;
  onSubjectX: (value: string) => void;
  onStart: () => void;
  onCancel: () => void;
  onTrial: (id: string) => void;
}) {
  const { t } = usePreferences();
  if (!available)
    return (
      <p className="sync-help">
        {t("自动识别动作需要 macOS 桌面版；此处可手动定点或导入对齐结果。")}
      </p>
    );
  const running = state?.job?.status === "running";
  const result = state?.result;
  const current = result?.trials.find(
    (trial) =>
      trial.acquisition.id === currentId &&
      (trial.status === "rejected" ||
        acquisitionKey(trial.acquisition) === currentKey),
  );
  const shared =
    result?.trials.filter((trial) => trial.status === "shared").length || 0;
  return (
    <div className="automatic-alignment" aria-label={t("单 trial 确定 lag")}>
      <div className="automatic-heading">
        <strong>{t("单 trial 确定 lag")}</strong>
        <button
          className="button"
          disabled={!running && !ready}
          onClick={running ? onCancel : onStart}
        >
          {t(running ? "取消对齐" : "以当前 trial 重新确定 lag")}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {running ? (
          <>
            <p>{t("参考 trial：{0}", [state.referenceName])}</p>
            <p>
              {t(
                state.job!.phase === "extracting"
                  ? "正在识别参考 trial 对应的视频动作…"
                  : state.job!.phase === "refining"
                    ? "正在精化参考 trial 的 lag…"
                    : "正在匹配参考 trial 的动作…",
              )}{" "}
              {Math.round(state.job!.progress)}%
            </p>
            <progress
              aria-label={t("参考 trial 对齐进度")}
              max={100}
              value={state.job!.progress}
            />
          </>
        ) : result ? (
          <>
            <p>{t("参考 trial：{0}", [result.referenceTrial.name])}</p>
            <p>
              {result.lag != null
                ? t("共同 lag {0} 秒；已供其他 {1} 个 trial 共享。", [
                    result.lag.toFixed(4),
                    shared,
                  ])
                : t("参考 trial 未能可靠确定 lag，请更换 trial 重试。")}
            </p>
            {result.lag != null && (
              <p>{t("其他 trial 直接使用该 lag，不再单独识别或匹配动作。")}</p>
            )}
            {current?.reason === "metadata_unavailable" && (
              <p className="error-text">
                {t("无法读取当前 trial 的时间信息，未应用共享 lag。")}
              </p>
            )}
            {!current && (
              <p>
                {t("当前 trial 未应用共享 lag，请以当前 trial 重新确定 lag。")}
              </p>
            )}
          </>
        ) : (
          <p>
            {t(
              state?.job?.status === "cancelled"
                ? "参考 trial 对齐已取消，尚未共享 lag。"
                : "导入视频时只匹配当前 trial，确定 lag 后供同文件夹其他 trial 共享。",
            )}
          </p>
        )}
      </div>
      {state?.error && (
        <p className="error-text" role="alert">
          {t(
            state.error.replace(
              /^Error invoking remote method '[^']+': Error: /,
              "",
            ),
          )}
        </p>
      )}
      {result && (
        <details className="training-results">
          <summary>{t("lag 共享范围")}</summary>
          <ul>
            {result.trials.map((trial) => (
              <li key={trial.acquisition.id}>
                <button
                  className="text-button"
                  onClick={() => onTrial(trial.acquisition.id)}
                >
                  {trial.acquisition.name}
                </button>
                <span>{t(trialSharingLabel(trial))}</span>
                {trial.detail && (
                  <small>
                    {t(
                      localizedError(
                        trial.detailCode,
                        trial.detailParams,
                        trial.detail,
                      ),
                    )}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!running && (
        <label className="automatic-subject">
          {t("优先识别画面中的人物")}
          <select
            aria-label={t("优先识别画面中的人物")}
            value={subjectX}
            onChange={(e) => onSubjectX(e.target.value)}
          >
            <option value="0.5">{t("中间")}</option>
            <option value="0.25">{t("左侧")}</option>
            <option value="0.75">{t("右侧")}</option>
          </select>
        </label>
      )}
    </div>
  );
}
