export const mediaEnglish: Record<string, string> = {
  松开以导入文件: "Drop to import files",
  "支持视频或编号图片序列；C3D 拖放请使用桌面版":
    "Drop a video or numbered images; C3D drop requires the desktop app",
  视频同步: "Video sync",
  "正在打开同步面板…": "Opening synchronization panel…",
  "C3D 帧": "C3D frame",
  "COM 试次": "COM trial",
  "CSV 中没有可用的数值信号列。":
    "No usable numeric signal columns in the CSV.",
  "CSV 列名重复或行宽不一致。":
    "Duplicate CSV columns or inconsistent row widths.",
  "CSV 引号不完整。": "Unterminated CSV quote.",
  "Vicon 反向": "Invert Vicon",
  "Vicon 对齐通道": "Vicon alignment channel",
  "Vicon 时钟领先（秒）": "Vicon clock advance (s)",
  "XCP Capture 开始时间": "XCP Capture start",
  "video_pts_s 必须严格递增，不能用行号代替时间。":
    "video_pts_s must be strictly increasing; row numbers cannot replace timestamps.",
  "{0} 张图片 · {1}–{2}": "{0} images · {1}–{2}",
  上一张图片: "Previous image",
  下一张图片: "Next image",
  从已有视频信号估计偏移: "Estimate lag from existing video signals",
  从拍摄时间计算基线: "Calculate baseline from recording times",
  估计时间偏移: "Estimate time offset",
  "使用 overall_lag_s；未提供时，只取 accepted 试次修正的中位数。每个试次保留自己的时间戳基线。":
    "Use overall_lag_s, or the median correction of accepted trials when absent. Each trial keeps its own timestamp baseline.",
  "使用当前观察区间：原始帧 {0}–{1}。":
    "Using current range: original frames {0}–{1}.",
  保存当前对齐: "Save current alignment",
  "信号 CSV 过大，请先截取需要对齐的区间。":
    "Signal CSV is too large. Trim it to the alignment interval first.",
  "信号 CSV 需要 video_pts_s 列和 8–200000 行数据。":
    "Signal CSV requires a video_pts_s column and 8–200000 data rows.",
  信号方向: "Signal direction",
  "信号相关性不足，请检查通道、方向与动作区间。":
    "Correlation is too low. Check the channel, direction and motion interval.",
  候选偏移: "Candidate offset",
  "候选通过质量检查，应用后仍需目视复核。":
    "Candidate passes the quality checks. Visually review it after applying.",
  偏移搜索的带符号相关曲线: "Signed correlation across candidate offsets",
  "先定位 C3D 帧，再在上方预览相同动作，点击对齐。也可导入 COM 结果或填写偏移。":
    "Locate a C3D frame, preview the same movement above, then align. You can also import COM results or enter an offset.",
  关闭视频面板: "Close media panel",
  "原视频帧 {0}": "Source video frame {0}",
  参考视频: "Reference video",
  同向: "Same direction",
  "同步区间：C3D 原始帧 {0}–{1}。使用下方时间轴播放、慢放和逐帧。":
    "Synchronized range: C3D frames {0}–{1}. Use the timeline below to play, slow down or step through frames.",
  "图片帧号无效。": "Invalid image frame number.",
  "图片序列中存在重复帧号。": "Duplicate frame numbers in the image sequence.",
  "图片文件名需包含原始帧号，例如 frame_000123.jpg。":
    "Image filenames must contain original frame numbers, such as frame_000123.jpg.",
  "图片无法读取，请检查格式或重新导入。":
    "Cannot read the image. Check its format or import it again.",
  图片预览帧: "Image preview frame",
  坐标分量: "Coordinate axis",
  "填写此录制的 FPS，或导入帧号–PTS 时间表":
    "Enter this recording's FPS or import a frame–PTS table",
  "存在相近的竞争峰，重复步态可能产生歧义，请缩小范围或更换同步动作。":
    "Similar competing peaks make the result ambiguous. Narrow the range or use a different synchronization movement.",
  "对齐 JSON 过大，请导入同步结果文件。":
    "Alignment JSON is too large. Choose a synchronization result file.",
  "对齐文件与当前 C3D 不匹配。":
    "The alignment file does not match this C3D recording.",
  "对齐文件与当前素材不匹配。": "The alignment file does not match this media.",
  "对齐文件包含无效时间值。":
    "The alignment file contains invalid timing values.",
  "导入 COM 对齐结果": "Import COM alignment",
  "导入 PTS 表": "Import PTS table",
  导入图片序列: "Import image sequence",
  "导入已计算的视频信号 CSV，时间列为 video_pts_s。两端须表示同一运动量，方向事先确定；本功能不从视频提取姿态。":
    "Import computed video signals with a video_pts_s time column. Both signals must represent the same motion quantity with a predetermined direction. This feature does not extract poses from video.",
  导入视频: "Import video",
  "导入视频信号 CSV": "Import video signal CSV",
  "将当前画面对齐到此 C3D 帧": "Align this image to the C3D frame",
  "将视频或图片序列与 Vicon 并排核查":
    "Compare video or images alongside Vicon",
  已同步: "Synchronized",
  "已计入原始首帧裁剪偏移 ({0} − 1) / {1} 秒。读取 Capture 时间，不使用 Calibration 时间。":
    "Includes the original-frame crop offset ({0} − 1) / {1} s. Use Capture time, not Calibration time.",
  应用候选偏移: "Apply candidate offset",
  应用所选试次: "Apply selected trial",
  应用时间偏移: "Apply time offset",
  "当前 C3D 帧超出素材时间范围": "Current C3D frame is outside media coverage",
  "当前观察区间与素材没有时间交集，请调整基线或偏移。":
    "The selected range does not overlap the media. Adjust the baseline or offset.",
  "拍摄时间和 Capture 时间必须包含时区，例如 +08:00。":
    "Recording and Capture times must include a timezone, such as +08:00.",
  "拍摄时间格式无效。": "Invalid recording timestamp.",
  按此录制填写: "This recording's FPS",
  "搜索上限（秒）": "Search maximum (s)",
  "搜索下限（秒）": "Search minimum (s)",
  "搜索步长（秒）": "Search step (s)",
  文件帧号起点: "Filename frame origin",
  时间对齐: "Time alignment",
  "时间戳基线（秒）": "Timestamp baseline (s)",
  "时间表包含无效或重复帧号。":
    "The timestamp table contains invalid or duplicate frame numbers.",
  "时间表未覆盖全部图片，或 PTS 顺序无效。":
    "The table does not cover every image or its PTS order is invalid.",
  "时间表过大，请只保留当前录制。":
    "The timestamp table is too large. Keep only the current recording.",
  "时间表需要 frame 和 video_pts_s 列，frame 为原视频零基帧号。":
    "The table needs frame and video_pts_s columns; frame is the zero-based original video frame.",
  "替换 PTS 表": "Replace PTS table",
  "改用 FPS": "Use FPS instead",
  "最优值位于搜索或覆盖边界，请检查基线并扩大搜索范围。":
    "The best candidate is at a search or coverage boundary. Check the baseline and expand the search.",
  "最大插值间隔（秒）": "Maximum interpolation gap (s)",
  "本机视频 / 图片序列": "Local video / image sequence",
  "正偏移选择更晚的视频画面。不会自动拉伸时间或跨缺失段补动作。":
    "Positive offsets select later video frames. Time is not stretched and motion is not interpolated across missing intervals.",
  "正在估计…": "Estimating…",
  "没有已接受的试次，不能推断共享偏移。":
    "No accepted trials are available to infer a shared offset.",
  "没有足够的有效信号覆盖，请检查时间基线和区间。":
    "Insufficient valid signal coverage. Check the time baseline and interval.",
  "源视频 FPS": "Source video FPS",
  "点位 / 模型": "Points / models",
  独立预览: "Independent preview",
  "相关性不代表绝对同步精度。":
    "Correlation does not establish absolute synchronization accuracy.",
  "素材仅在本机读取。先选择同一动作，再建立时间对应。":
    "Media is read locally. Match the same movement to establish timing.",
  "统一偏移（秒）": "Shared offset (s)",
  覆盖: "Coverage",
  "视频 PTS 原点（秒）": "Video PTS origin (s)",
  视频与图片同步: "Video and image synchronization",
  视频信号列: "Video signal column",
  视频拍摄开始时间: "Video recording start",
  "视频无法播放，请检查格式或重新导入。":
    "Cannot play the video. Check its format or import it again.",
  "视频无法解码，请选择浏览器支持的视频格式。":
    "Cannot decode the video. Choose a browser-supported format.",
  "视频时长不可用，请重新导入。":
    "Video duration is unavailable. Import a video with a finite duration.",
  视频时间: "Video time",
  "视频时间 = 时间戳基线 + 统一偏移 + C3D 相对时间":
    "Video time = timestamp baseline + shared offset + relative C3D time",
  计算基线: "Calculate baseline",
  "设备时差未知时，请使用手动定点或已确认的时间基线。":
    "If the device clock difference is unknown, use a manual anchor or a verified baseline.",
  "该时刻没有对应图片，保留采样缺口":
    "No image at this time; sample gap preserved",
  "请输入有效的时间数值。": "Enter valid numeric timing values.",
  "请选择一个视频，或同一录制的按帧编号图片序列。":
    "Choose one video or numbered images from a single recording.",
  "请选择包含 trials 和 overall_lag_s 的 COM 对齐结果。":
    "Choose COM alignment results containing trials and overall_lag_s.",
  "请选择对应当前 C3D 的试次": "Select the trial matching this C3D",
  调整对齐: "Adjust alignment",
  "选择对齐 JSON": "Choose alignment JSON",
  "通常 PTS 原点为 0；若外部 PTS 表与播放器时间原点不同，请填写其差值。不要用文件修改时间推断拍摄时间。":
    "PTS origin is usually 0. Enter the difference if external PTS uses a different origin from the player. File modification time is not recording time.",
  "预览视频时间（秒）": "Preview video time (s)",
  "素材仅在本机读取。桌面版导入后自动识别动作并对齐。":
    "Media stays on this computer. The desktop app automatically matches actions after import.",
  "自动对齐 · 待复核": "Automatically aligned \u00b7 review pending",
  "已建立时间对应 · 待复核": "Time mapping applied \u00b7 review pending",
  "自动识别动作需要 macOS 桌面版；此处可手动定点或导入对齐结果。":
    "Automatic motion recognition requires the macOS desktop app. Manual anchors and imported mappings are available here.",
  自动动作对齐: "Automatic motion alignment",
  取消识别: "Cancel recognition",
  重新识别: "Run recognition again",
  "正在识别素材中的人体动作…": "Recognizing body motion in the media\u2026",
  "正在精化候选动作…": "Refining candidate matches\u2026",
  "正在匹配 Vicon 动作…": "Matching Vicon motion\u2026",
  自动对齐进度: "Automatic alignment progress",
  "已自动应用：C3D 首帧对应素材 {0} 秒。相关系数 {1}，请播放核查。":
    "Applied automatically: the first C3D frame matches media time {0} s. Correlation {1}; play to review.",
  "未找到足够完整的人体动作，请检查人物可见性、关节通道或选择另一视角。":
    "Insufficient body motion coverage. Check visibility and joint channels, or choose another view.",
  "候选位于素材边界，无法可靠判断；请扩大素材范围或手动核查。":
    "The match is at the media boundary. Include more source material or review manually.",
  "动作匹配不够可靠，未自动应用偏移。请选择明显动作或另一视角。":
    "The match is not reliable enough to apply. Select a distinctive movement or another view.",
  "存在相似的重复动作，未自动应用偏移。请预览候选或选择更有区分度的动作区间。":
    "Repeated actions give similar matches; no offset was applied. Preview candidates or select a more distinctive motion range.",
  "自动识别已取消。": "Automatic recognition cancelled.",
  "导入后将自动识别并匹配动作。":
    "Motion will be recognized and matched automatically after import.",
  "填写图片 FPS 或导入 PTS 表后，将自动识别动作。":
    "Enter image FPS or import a PTS table to start automatic recognition.",
  "预览候选 {0}：{1} 秒": "Preview candidate {0}: {1} s",
  优先识别画面中的人物: "Prefer the person at",
  中间: "Center",
  左侧: "Left",
  右侧: "Right",
  "无法读取自动对齐进度，请重试。":
    "Could not read alignment progress. Please retry.",
  "自动对齐失败，请重试。": "Automatic alignment failed. Please retry.",
  "此选项使用已有视频信号 CSV，时间列为 video_pts_s。两端须表示同一运动量，方向事先确定。直接导入素材的自动识别位于视频面板。":
    "This option uses existing video signal CSVs with video_pts_s timestamps. Both signals must describe the same quantity with a predefined direction. Automatic recognition of imported media is in the video panel.",
};
