# C3D Reader v0.3.3

## 简体中文

更新工作台的视觉设计，保留文件与通道、3D 与曲线、检查器的整体布局和拖动调整尺寸方式。

- 深浅主题采用更明确的背景层级；增加常用文字、数值与标题的辨识度，统一搜索框、按钮、坐标读数及弹窗样式。
- 改善输入边界与键盘焦点对比，扩大通道显隐按钮的点击区域；关闭的曲线轴保留可读标签并用删除线区分。
- 3D 场景、标记点、轨迹、图例和曲线共用主题色；减弱地板网格，保留中心线。主题在绘制前应用，避免切换后场景读取旧配色。
- 顶栏版本号从应用版本读取，避免显示过时版本。

使用合成数据验证：48 项 Python/API/打包测试、16 项浏览器用例、8 项桌面集成用例（源码与安装包）通过。检查深浅主题、中英文及四种窗口宽度；安装包通过隐私扫描、签名与 DMG/ZIP 完整性检查。README 简介图与演示同步更新。

适用于 Apple Silicon、macOS 14+。ad-hoc 签名，尚未经过 Apple 公证；首次启动如被拦截，可在系统设置「隐私与安全性」中选择「仍要打开」。

## English

Refines the workbench appearance while preserving the recording/channel sidebar, 3D and signal area, inspector, and draggable pane sizes.

- Clearer surface hierarchy in light and dark themes, more legible working labels and values, and consistent search fields, buttons, coordinate readouts and dialogs.
- Stronger input boundaries and keyboard focus, larger channel visibility targets, and readable hidden-axis labels distinguished by a strikethrough.
- Shared theme colors across the 3D scene, markers, trails, legends and plots. A quieter floor grid retains its center lines. Themes are applied before painting so the scene reads the current palette when switching.
- The header now reads the application version instead of displaying a fixed version string.

Synthetic validation: 48 Python/API/packaging tests, 16 browser cases, and 8 desktop integration cases against both source and packaged app passed. Reviewed both themes, languages and four viewport sizes, plus package privacy, signature and DMG/ZIP integrity. README overview images and demonstrations are refreshed.

Requires Apple Silicon and macOS 14+. Ad-hoc signed, not Apple notarized; use **Open Anyway** in macOS **Privacy & Security** on first launch if prompted.
