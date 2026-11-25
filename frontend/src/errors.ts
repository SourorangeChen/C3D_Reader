// Backend failures arrive as { detail, code, params } (backend/errors.py).
// Codes render here in both languages; `detail` is only an English fallback.
const messages: Record<string, { en: string; zh: string }> = {
  request_failed: {
    en: "Request failed ({status}).",
    zh: "请求失败 ({status})",
  },
  source_unavailable: {
    en: "Source file is unavailable. Check the disk connection.",
    zh: "源文件不可用，请检查磁盘连接。",
  },
  source_changed: {
    en: "The source file changed. Open it again to refresh the acquisition.",
    zh: "源文件已变化，请重新打开。",
  },
  file_not_registered: {
    en: "File is no longer registered. Refresh the library.",
    zh: "文件已失效，请刷新文件夹。",
  },
  c3d_unreadable: {
    en: "Cannot read C3D: {detail}",
    zh: "无法读取 C3D：{detail}",
  },
  c3d_truncated_header: {
    en: "Cannot read C3D: the header is truncated (a complete 512-byte header is required).",
    zh: "无法读取 C3D：文件头不完整，需要完整的 512 字节文件头。",
  },
  c3d_dec_unsupported: {
    en: "Cannot read C3D: DEC/VAX C3D is not supported. Re-export as Intel/IEEE C3D.",
    zh: "无法读取 C3D：不支持 DEC/VAX 格式，请重新导出为 Intel/IEEE C3D。",
  },
  c3d_invalid_timing: {
    en: "Cannot read C3D: invalid frame range or sampling rate.",
    zh: "无法读取 C3D：帧范围或采样率无效。",
  },
  c3d_analog_rate: {
    en: "Cannot read C3D: the analog rate must be an integer multiple of the point rate.",
    zh: "无法读取 C3D：模拟采样率必须是标记点采样率的整数倍。",
  },
  c3d_no_data: {
    en: "Cannot read C3D: the acquisition has no point or analog data.",
    zh: "无法读取 C3D：文件中没有点位或模拟数据。",
  },
  c3d_truncated_data: {
    en: "Cannot read C3D: the file is shorter than its declared frame range.",
    zh: "无法读取 C3D：文件短于声明的帧范围，可能不完整。",
  },
  frame_range_invalid: {
    en: "Frame range must satisfy 0 ≤ start < stop ≤ frameCount (stop is exclusive).",
    zh: "帧范围无效：须满足 0 ≤ 起点 < 终点 ≤ 总帧数（终点不包含）。",
  },
  channel_ids_invalid: {
    en: "Channel IDs must be comma-separated integers.",
    zh: "通道编号须为以逗号分隔的整数。",
  },
  channel_count_invalid: {
    en: "Select between 1 and {maximum} valid channels.",
    zh: "请选择 1 到 {maximum} 个有效通道。",
  },
  desktop_only: {
    en: "This operation is available only to the desktop application.",
    zh: "此操作仅限桌面版使用。",
  },
  c3d_file_required: {
    en: "Select a valid .c3d file.",
    zh: "请选择有效的 .c3d 文件。",
  },
  trial_not_in_group: {
    en: "The current trial is not in the matching list. Refresh the folder.",
    zh: "当前试次不在整组匹配列表中，请刷新文件夹。",
  },
  trial_list_changed: {
    en: "The trial list changed. Refresh the folder and import again.",
    zh: "试次列表已变化，请刷新文件夹后重新导入。",
  },
  folder_list_failed: {
    en: "Cannot list folder: {detail}",
    zh: "无法读取文件夹：{detail}",
  },
  folder_missing: {
    en: "This folder does not exist or is not mounted.",
    zh: "文件夹不存在或未挂载，请重新选择。",
  },
  folder_access_failed: {
    en: "Cannot access folder: {detail}",
    zh: "无法访问文件夹：{detail}",
  },
  signal_direction_invalid: {
    en: "Signal direction must be +1 or -1.",
    zh: "信号方向须为 +1 或 −1。",
  },
  alignment_interval_too_large: {
    en: "The alignment interval is too large. Select a shorter frame range.",
    zh: "对齐区间过大，请缩小帧区间。",
  },
  alignment_failed: {
    en: "Signal alignment failed: {detail}",
    zh: "信号对齐失败：{detail}",
  },
  alignment_settings_invalid: {
    en: "Alignment settings must be finite.",
    zh: "对齐参数必须为有限数值。",
  },
  alignment_bounds_invalid: {
    en: "Use increasing search bounds and positive step/gap limits.",
    zh: "搜索上限须大于下限，步长和插值间隔须大于 0。",
  },
  alignment_thresholds_invalid: {
    en: "Invalid alignment quality thresholds.",
    zh: "对齐质量阈值无效。",
  },
  video_times_invalid: {
    en: "Video times must be finite, strictly increasing, with at least 8 samples.",
    zh: "视频时间须为有限数值、严格递增，并包含至少 8 个采样点。",
  },
  vicon_interval_too_short: {
    en: "The selected Vicon interval needs at least 8 samples.",
    zh: "所选 Vicon 区间至少需要 8 个采样点。",
  },
  alignment_search_too_large: {
    en: "Search is too large. Narrow the frame range/search or increase the step.",
    zh: "搜索计算量过大，请缩小帧区间或搜索范围，或增大步长。",
  },
  com_requires_points: {
    en: "COM export requires point data.",
    zh: "COM 导出需要点位数据。",
  },
  export_no_channels: {
    en: "No matching source channels are available for this export.",
    zh: "文件中没有可用于此导出的源通道。",
  },
  export_in_progress: {
    en: "A folder export or download is already in progress.",
    zh: "已有批量导出或下载正在进行，请稍后重试。",
  },
  folder_has_no_c3d: {
    en: "This folder contains no C3D files.",
    zh: "此文件夹中没有 C3D 文件。",
  },
  disk_full: {
    en: "Not enough temporary disk space. Free space and retry.",
    zh: "本机临时磁盘空间不足，请释放空间后重试。",
  },
  temp_folder_failed: {
    en: "Cannot create the temporary export folder. Check disk permissions.",
    zh: "无法创建临时导出目录，请检查磁盘权限。",
  },
  export_not_found: {
    en: "Export not found. Start a new export.",
    zh: "找不到导出任务，请重新开始。",
  },
  export_not_ready: {
    en: "Export is not ready. Start a new export if it has expired.",
    zh: "导出尚未完成；如已过期，请重新开始导出。",
  },
  auto_job_missing: {
    en: "The automatic alignment job expired. Try again.",
    zh: "自动对齐任务已失效，请重试。",
  },
  auto_alignment_failed: {
    en: "Automatic alignment failed. Check the source files or import again.",
    zh: "自动对齐失败，请检查源文件或重新导入。",
  },
  auto_unavailable: {
    en: "Automatic alignment is unavailable. Use the macOS desktop app with motion recognition.",
    zh: "自动对齐组件不可用，请使用包含动作识别组件的 macOS 桌面版。",
  },
  auto_media_unreadable: {
    en: "Cannot read the alignment media. Import the local files again.",
    zh: "无法读取自动对齐素材，请重新导入本机文件。",
  },
  auto_params_invalid: {
    en: "Invalid automatic alignment settings.",
    zh: "无效的自动对齐参数。",
  },
  auto_images_insufficient: {
    en: "Automatic alignment needs at least 8 consecutive images with a valid FPS or PTS.",
    zh: "自动对齐需要至少 8 张带有效 FPS 或 PTS 的连续动作图片。",
  },
  auto_media_too_long: {
    en: "Automatic alignment supports media up to one hour. Trim it to the relevant part.",
    zh: "自动对齐目前支持一小时以内的素材，请先选取相关片段。",
  },
  auto_pose_failed: {
    en: "Cannot recognize motion in this media. Check the format, subject visibility or camera view.",
    zh: "无法识别此素材中的动作，请检查格式、人物可见性或选择另一视角。",
  },
  auto_samples_too_many: {
    en: "Too many motion samples. Shorten the media range.",
    zh: "动作采样过多，请缩短素材范围。",
  },
  auto_worker_failed: {
    en: "Motion recognition did not finish. Check the media and retry.",
    zh: "动作识别组件未正常完成，请检查素材并重试。",
  },
  auto_media_too_short: {
    en: "The media is shorter than the selected Vicon range. Narrow the observation range.",
    zh: "素材短于所选 Vicon 动作区间，请缩小观察区间。",
  },
  auto_source_changed: {
    en: "A source file changed during alignment. Open the media again.",
    zh: "对齐过程中源文件发生变化，请重新打开素材。",
  },
  auto_roi_duration: {
    en: "Automatic alignment needs a 2–60 second observation range. Adjust the range first.",
    zh: "自动对齐需要 2–60 秒的观察区间，请先调整区间。",
  },
  auto_ambiguous_subject: {
    en: "Several subjects share joint labels, so automatic alignment cannot choose the person.",
    zh: "存在多个受试者的同名关节，自动对齐无法确定目标人物。",
  },
  auto_missing_joints: {
    en: "Shoulder, hip, knee or ankle channels are missing, so motion cannot be matched.",
    zh: "缺少肩、髋、膝或踝的对应通道，无法自动匹配动作。",
  },
  auto_units_unsupported: {
    en: "Automatic alignment needs spatial channels in mm, cm or m.",
    zh: "自动对齐需要以 mm、cm 或 m 表示的空间通道。",
  },
  auto_vicon_coverage: {
    en: "Too few valid Vicon joint samples. Select a complete movement range.",
    zh: "Vicon 有效关节覆盖不足，请选择完整的动作区间。",
  },
  auto_media_no_samples: {
    en: "The media has no usable motion samples or timestamps.",
    zh: "素材缺少可用的动作采样或时间戳。",
  },
  auto_search_too_large: {
    en: "The automatic search range is too large. Shorten the media range.",
    zh: "自动搜索范围过大，请缩小素材范围。",
  },
};

type Params = Record<string, unknown>;
// Error state is stored as text across the UI. The English rendering is that
// text; translate() looks up its Chinese rendering here, so switching language
// after an error still shows it in the selected language.
const chineseByEnglish = new Map<string, string>();

function fill(template: string, params: Params) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] == null ? match : String(params[name]),
  );
}

export function localizedError(
  code: string | null | undefined,
  params: Params | null | undefined,
  fallback: string,
) {
  const copy = code ? messages[code] : undefined;
  if (!copy) return fallback;
  const english = fill(copy.en, params || {});
  chineseByEnglish.set(english, fill(copy.zh, params || {}));
  return english;
}

export function chineseError(text: string) {
  return chineseByEnglish.get(text);
}

// Electron IPC keeps only an Error's message, so the desktop main process
// encodes the backend body after this marker (desktop/main.cjs).
export const DESKTOP_ERROR_MARKER = "C3D_ERROR:";

export function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const { code, params, message } = error as {
      code?: string;
      params?: Params;
      message?: string;
    };
    if (code) return localizedError(code, params, message || "");
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  const marker = message.indexOf(DESKTOP_ERROR_MARKER);
  if (marker >= 0) {
    try {
      const body = JSON.parse(
        message.slice(marker + DESKTOP_ERROR_MARKER.length),
      );
      return localizedError(body.code, body.params, String(body.detail ?? ""));
    } catch {
      /* Fall through to the plain message. */
    }
  }
  return message.replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );
}
