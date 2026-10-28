import { usePreferences } from "./Preferences";
import type { useAutomaticAlignment } from "./useAutomaticAlignment";

export function AutomaticAlignmentStatus({
  automatic,
  ready,
  subjectX,
  onSubjectX,
  onCandidate,
}: {
  automatic: ReturnType<typeof useAutomaticAlignment>;
  ready: boolean;
  subjectX: string;
  onSubjectX: (value: string) => void;
  onCandidate: (offset: number) => void;
}) {
  const { t } = usePreferences();
  const { job, error } = automatic;
  if (!automatic.available)
    return (
      <p className="sync-help">
        {t("自动识别动作需要 macOS 桌面版；此处可手动定点或导入对齐结果。")}
      </p>
    );
  const running = job?.status === "running";
  const result = job?.result;
  const reasons: Record<string, string> = {
    no_motion_coverage:
      "未找到足够完整的人体动作，请检查人物可见性、关节通道或选择另一视角。",
    motion_search_boundary:
      "候选位于素材边界，无法可靠判断；请扩大素材范围或手动核查。",
    motion_match_weak:
      "动作匹配不够可靠，未自动应用偏移。请选择明显动作或另一视角。",
    motion_match_ambiguous:
      "存在相似的重复动作，未自动应用偏移。请预览候选或选择更有区分度的动作区间。",
  };
  return (
    <div className="automatic-alignment" aria-label={t("自动动作对齐")}>
      <div className="automatic-heading">
        <strong>{t("自动动作对齐")}</strong>
        <button
          className="button"
          disabled={!running && !ready}
          onClick={() =>
            running ? automatic.cancel() : void automatic.start()
          }
        >
          {t(running ? "取消识别" : "重新识别")}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {running ? (
          <>
            <p>
              {t(
                job.phase === "extracting"
                  ? "正在识别素材中的人体动作…"
                  : job.phase === "refining"
                    ? "正在精化候选动作…"
                    : "正在匹配 Vicon 动作…",
              )}{" "}
              {Math.round(job.progress)}%
            </p>
            <progress
              aria-label={t("自动对齐进度")}
              max="100"
              value={job.progress}
            />
          </>
        ) : result?.status === "accepted" ? (
          <p>
            {t(
              "已自动应用：C3D 首帧对应素材 {0} 秒。相关系数 {1}，请播放核查。",
              [
                result.offset!.toFixed(3),
                result.correlation?.toFixed(3) || "—",
              ],
            )}
          </p>
        ) : result?.status === "rejected" ? (
          <p>
            {t(
              reasons[result.reason] ||
                "动作匹配不够可靠，未自动应用偏移。请选择明显动作或另一视角。",
            )}
          </p>
        ) : !error ? (
          <p>
            {t(
              job?.status === "cancelled"
                ? "自动识别已取消。"
                : ready
                  ? "导入后将自动识别并匹配动作。"
                  : "填写图片 FPS 或导入 PTS 表后，将自动识别动作。",
            )}
          </p>
        ) : null}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {t(
            error.replace(/^Error invoking remote method '[^']+': Error: /, ""),
          )}
        </p>
      )}
      {result?.status === "rejected" && result.candidates.length > 0 && (
        <div className="sync-actions">
          {result.candidates.slice(0, 3).map((candidate, i) => (
            <button
              className="button"
              key={i}
              onClick={() => onCandidate(candidate.offset)}
            >
              {t("预览候选 {0}：{1} 秒", [i + 1, candidate.offset.toFixed(3)])}
            </button>
          ))}
        </div>
      )}
      {!running && (error || result?.status === "rejected") && (
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
