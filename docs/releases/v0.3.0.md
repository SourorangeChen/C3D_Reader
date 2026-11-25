# C3D Reader v0.3.0

## 简体中文

- 增加设置窗口（左下角设置按钮或 ⌘,）：深色、浅色、跟随系统主题，以及简体中文 / English 界面切换；偏好自动保存在本机，重启后保留。
- 默认增大三维区域，增加文件面板、信息面板和三维 / 曲线之间的可拖动分隔条；支持键盘调整、双击重置和恢复默认布局。
- 增加整个目录的 CSV 批量导出：包含全部点位 / 模型和模拟通道、完整采样及整个采集区间。后台显示进度，可取消；损坏文件列入 manifest.json，其他文件继续导出。下载 ZIP，不递归子目录。
- 更新中英文 README、简介图和合成数据演示。

安装：下载 DMG，打开后把 C3D Reader.app 拖至 Applications。适用于 Apple Silicon、macOS 14+。仍为 ad-hoc 签名，未通过 Developer ID 签名和公证。

验证范围：30 项 Python/API/打包测试、12 项浏览器测试、7 项桌面集成测试（源码与安装包均执行），以及安装包隐私检查、签名一致性和 DMG 完整性检查。所有测试与演示使用合成数据。

## English

- Settings (bottom-left toolbar or ⌘,) with dark, light and system themes, Chinese / English interface language, and local preferences that survive restarts.
- A larger default 3D view and draggable dividers for the file panel, inspector, and 3D / signal split, with keyboard resizing, double-click reset and layout reset.
- Folder-wide CSV export of all point / model and analog channels, all frames and full sampling rates. Background progress and cancellation; invalid files are reported in manifest.json while other recordings continue. Download one ZIP; subfolders are excluded.
- Updated bilingual READMEs, overview graphics and synthetic-data demo.

Install from the DMG by dragging C3D Reader.app to Applications. Requires Apple Silicon and macOS 14+. Ad-hoc signed; not Developer ID signed or notarized.

Validation: 30 Python/API/packaging tests, 12 browser tests, 7 desktop integration tests against both source and packaged app, plus package privacy checks, signature consistency and DMG verification. Tests and demo media use synthetic data only.
