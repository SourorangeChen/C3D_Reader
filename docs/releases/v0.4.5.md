# C3D Reader v0.4.5

## 简体中文

新增本地视频与图片序列同步：在 Vicon 标记点旁对照查看原始录像，并自动或手动对齐时间。这是 0.3.4 之后的首个公开版本，包含 0.4.0 起的全部视频同步功能。

- **视频与图片同步**：导入一个视频（MP4 / MOV / WebM）或一组编号图片（JPG / PNG / WebP / BMP），与 3D 场景并排显示，共用同一时间轴播放、慢放、循环和逐帧。工具栏同时显示视频时间、视频帧号和 Vicon 帧号。
- **自动对齐（macOS）**：导入后用本机 Apple Vision 识别人体动作，与当前 Vicon 观察区间的肩、髋、膝、踝通道匹配，结果可靠时才应用时间偏移；不可靠或有重复动作时提示复核，不会默认从零对齐。
- **整个文件夹共享 lag**：每次导入视频只用当前 trial 和观察区间确定一次 lag，文件夹内其他 trial 直接共享，无需逐个识别。切换 trial 时保留视频和 lag；可在另一个 trial 上点击「以当前 trial 重新确定 lag」重新计算。
- **手动对齐**：在时间轴定位 C3D 帧、在素材中找到相同动作，点击「应用手动对齐」；对齐后可「调整对齐」，或按 Vicon 采样间隔微调画面提前 / 延后。
- **更多对齐方式**：填写时间偏移、带时区的拍摄时间基线，导入 COM 对齐结果，或从已有视频信号 CSV 估计 lag。「保存当前对齐」可导出 JSON。
- **按真实呈现时间编号视频帧**：视频帧号来自文件中的实际显示时间，不按标称 FPS 推算，变帧率视频同样适用。
- **正面 / 侧面视图对准受试者**：根据骨盆等标记点判断受试者朝向，而不是固定的世界坐标轴。
- **窗口较矮时布局不再重叠**：打开视频对照后，3D 和信号区会按比例缩小，不再遮挡播放栏。

自动对齐仅用于辅助同步查看，不能替代正式验证；遮挡、重复动作和多人可能导致无法可靠对齐，结果需目视复核，且不校正时钟漂移。浏览器版支持手动、COM JSON 和 CSV 对齐，不含自动对齐。素材只在本机读取。

本地通过 84 项 Python 测试、65 项浏览器用例和 11 项桌面集成用例；GitHub Actions 在 macOS 上构建并测试了开发版与打包后的应用。两项依赖真实录制的自动对齐验收测试未在 CI 中运行。

适用于 Apple Silicon、macOS 14+。ad-hoc 签名，尚未经过 Apple 公证；首次启动如被拦截，可在系统设置「隐私与安全性」中选择「仍要打开」。

## English

Adds local video and image-sequence synchronization: review source footage beside the Vicon markers and align time automatically or manually. This is the first public release after 0.3.4 and includes every video synchronization feature since 0.4.0.

- **Video and image synchronization**: import one video (MP4 / MOV / WebM) or numbered images (JPG / PNG / WebP / BMP) and view them beside the 3D scene on the shared timeline with playback, slow motion, looping and frame stepping. The toolbar shows video time, video frame number and Vicon frame number together.
- **Automatic alignment (macOS)**: after import, local Apple Vision pose recognition is matched against the shoulder, hip, knee and ankle channels in the current Vicon observation range. An offset is applied only when the match is reliable; weak or repetitive matches ask for review instead of defaulting to zero.
- **One lag for the whole folder**: each video import determines the lag once from the selected trial and observation range; other trials in the folder share it without individual recognition. Switching trials keeps the video and lag, and **Recalculate lag using this trial** replaces it from another trial.
- **Manual alignment**: seek the C3D frame on the timeline, find the same moment in the media and click **Apply manual alignment**. Afterwards use **Adjust alignment**, or nudge the picture earlier or later by one Vicon sample.
- **More alignment options**: enter time offsets or timezone-aware recording timestamps, import COM alignment results, or estimate lag from computed video-signal CSVs. **Save current alignment** exports JSON.
- **Video frames numbered by presentation time**: frame numbers come from the file's actual presentation timestamps rather than a nominal FPS, including variable-frame-rate video.
- **Front and side views face the subject**: the subject's orientation is derived from pelvis and other landmarks instead of fixed world axes.
- **No overlap in short windows**: with media comparison open, the 3D and signal areas shrink proportionally and no longer cover the playback bar.

Automatic alignment supports synchronized viewing only and is not formal validation. Occlusion, repetitive actions and multiple people can prevent a reliable match; review results visually. Clock drift is not corrected. The browser version supports manual, COM JSON and CSV alignment but not automatic alignment. Media is read locally only.

Local validation passed 84 Python tests, 65 browser cases and 11 desktop integration cases; GitHub Actions built and tested both the development and packaged app on macOS. Two automatic-alignment acceptance tests that need real recordings were not run in CI.

Requires Apple Silicon and macOS 14+. Ad-hoc signed, not Apple notarized; use **Open Anyway** in macOS **Privacy & Security** on first launch if prompted.
