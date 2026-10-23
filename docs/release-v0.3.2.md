# C3D Reader v0.3.2

## 简体中文

修复批量导出大文件时进度长时间不变，以及任务响应丢失后无法恢复的问题。

- 显示点位 / 模拟通道转换的帧进度、ZIP 压缩进度和已用时间，无需等待整个文件结束。
- 优化 CSV 转换；按通道数及采样数控制分块大小，提高高采样率文件的响应性和取消速度。
- 关闭窗口或刷新界面后可重新连接后台任务；开始请求响应丢失时自动寻找已创建的任务。请求设置超时，任务失效后允许重新开始。
- 重新连接不同任务时恢复取消按钮；临时磁盘满时明确提示，创建新任务目录失败时保留上一次可下载的结果。
- 全部点位、模型输出、源文件已有 COM / 地面投影，以及模拟通道仍保留完整采样和原始单位。

使用合成数据验证：48 项 Python/API/打包测试、16 项浏览器测试、8 项桌面集成测试（源码和安装包）。桌面 ZIP 下载完成后校验 CRC 和完整 CSV 行列；另检查安装包隐私、签名与 DMG 完整性。

适用于 Apple Silicon、macOS 14+。ad-hoc 签名，尚未经过 Apple 公证；首次启动可在系统设置「隐私与安全性」中选择「仍要打开」。

## English

Fixes folder exports appearing stuck during large files and tasks becoming inaccessible after a lost response.

- Frame progress for point / analog conversion, ZIP compression progress, and elapsed time update within each recording.
- Faster CSV serialization with chunks sized for channel and sample counts, improving responsiveness and cancellation.
- Reconnect to the backend task after closing or reloading the interface. A lost start response triggers task recovery; requests have timeouts, and missing tasks allow a fresh start.
- Reset cancellation controls when reconnecting to a different task. Report full temporary disks explicitly; workspace allocation failure preserves the previous completed download.
- All point channels, model outputs, source COM / floor projections and analog channels retain full samples and original units.

Synthetic validation: 48 Python/API/packaging tests, 16 browser tests and 8 desktop integration tests against source and packaged app. Native ZIP downloads are checked after completion for CRC and full CSV dimensions, alongside package privacy, signature and disk-image checks.

Requires Apple Silicon and macOS 14+. Ad-hoc signed, not Apple notarized; use **Open Anyway** in macOS **Privacy & Security** on first launch if prompted.
