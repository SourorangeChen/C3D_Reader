# C3D Reader v0.3.1

## 简体中文

修复主工作区「导出 CSV」只能导出当前选中通道的问题：现在默认一次导出当前文件**全部点位、完整采集**，包含文件已有的关键点、模型输出和 COM。

- 新增导出内容选择：全部点位、仅 COM 及地面投影、当前通道、全部模拟通道。
- 可选择完整采集或当前观察区间；全部点位导出不受搜索、可见性和原有 32 通道选择限制影响。
- 区分源文件中的 `CentreOfMass` / `CenterOfMass` / `COM` 与对应地面投影；保留原始数值、标签、单位和完整采样，不重新计算或用标记点平均位置代替质心。
- 文件没有可识别 COM 时明确提示；目录批量导出的 manifest 也标注 COM 角色。
- 保持旧的单通道 API 下载链接兼容。

测试使用合成数据：44 项 Python/API/打包测试、14 项浏览器测试、8 项桌面集成测试（源码和安装包），并检查安装包隐私、签名及 DMG 完整性。

适用于 Apple Silicon、macOS 14+。仍为 ad-hoc 签名，尚未经过 Apple 公证；首次启动可在系统设置的「隐私与安全性」中选择「仍要打开」。

## English

Fixes the main **Export CSV** action exporting only the selected channel. It now defaults to **all points and the full recording**, including markers, model outputs and COM channels already present in the source file.

- Choose all points, COM and floor projections only, the selected channel, or all analog channels.
- Export a full recording or the current frame range. All-point exports ignore search / visibility and bypass the selected-channel limit.
- Recognize source `CentreOfMass` / `CenterOfMass` / `COM` labels and their floor projections as distinct roles. Original samples, labels and units are preserved; COM is never recalculated or replaced by a marker average.
- Explicit missing-COM messaging; COM roles in folder-export manifests.
- Existing single-channel API download links remain compatible.

Synthetic validation: 44 Python/API/packaging tests, 14 browser tests, 8 desktop integration tests against source and packaged app, plus package privacy, signature and disk-image checks.

Requires Apple Silicon and macOS 14+. Ad-hoc signed, not Apple notarized. On first launch, use **Open Anyway** in macOS **Privacy & Security** if blocked.
