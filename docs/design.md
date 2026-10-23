# Workbench design / 工作台设计

## Direction / 方向

**Operate · Scientific workbench.** The style direction is **Data terminal**, seed `622546448`. The interface supports repeated inspection of motion data: finding a channel, comparing coordinates and signals, seeking a frame, and exporting samples. The visual subject is the working interface itself, populated with synthetic data for documentation and demonstrations.

**操作型科研工作台。** 采用 **Data terminal** 方向，种子为 `622546448`。设计服务于查找通道、核对坐标与曲线、定位帧和导出数据等连续操作。文档与演示直接展示使用合成数据的真实界面。

## Layout and type / 布局与字体

- Preserve the three working regions, navigation rail, timeline and draggable pane geometry. Refine surfaces and controls within those regions.
- Keep the existing Public Sans interface font and IBM Plex Mono for numeric values, frame/time readouts and technical identifiers. Most working labels use 12–13 px; titles use weight and size to establish hierarchy.
- Keep blue as the data and selection accent. Neutral surfaces carry structure; plots retain distinct X/Y/Z colors, reused in coordinate readouts. 3D markers, trails and legends use the same theme tokens as the plots.

- 保留三块工作区域、导航栏、时间轴及可拖动尺寸，在现有区域内优化表面与控件。
- 延续 Public Sans 界面字体和 IBM Plex Mono 数值字体。常用文字为 12–13 px；数值、帧号、时间和技术标识保持等宽，标题通过字号及字重建立层次。
- 延续蓝色数据与选中强调色，用中性色区分区域；XYZ 曲线及坐标读数使用对应颜色，3D 标记点、轨迹与图例读取相同的主题变量。

## Deliberate exceptions / 有意保留的细节

- **Dense scientific labels:** 11 px remains appropriate for compact units, ticks, metadata and secondary hints. Preserve room for the data view; do not reduce primary controls to that size merely for uniformity.
- **Numeric monospace:** repeated monospace text is functional here. Stable character widths make rapidly changing coordinates and time readouts easier to compare.
- **Overlay-only shadows:** shadows distinguish dialogs and temporary side panels above the workspace. Permanent panels use surface tone and separators rather than elevation.
- **Inspector section labels and missing values:** short labels identify functional groups; em dashes denote unavailable scientific values. Neither is decorative editorial copy.
- **Measured progress:** the timeline's linear gradient encodes playback position; it is a data indicator rather than decorative color treatment.
- These are scoped rationales for design-lint warnings, not blanket exemptions. Focus contrast, readable text, unclipped controls and reduced-motion preferences still apply.

- **科研信息密度：** 单位、刻度、元数据和次要提示保留 11 px，为数据视图留出空间；常用控件不为追求一致而缩小。
- **等宽数值：** 坐标和时间不断变化，稳定字符宽度有助于核对，因此重复使用等宽字体具有功能意义。
- **仅浮层使用阴影：** 弹窗与临时侧面板用阴影表达覆盖关系；常驻面板用底色与分隔线区分。
- **检查器分组与缺失值：** 小标题标识功能分组，破折号表示不可用的科学数据，均有实际含义。
- **进度渐变：** 时间轴渐变用于表达实际播放位置，不作为装饰。
- 上述说明仅解释相应设计检查项；键盘焦点对比、文字可读性、控件完整显示与减少动态效果设置仍需满足。

## Themes and examples / 主题与示例

Apply the resolved theme before the scene reads CSS tokens. Keep light and dark themes consistent across HTML controls, SVG plots and WebGL content. All screenshots, demos and shared fixtures must use synthetic data; never include participant data, identifying filenames or local machine paths.

在场景读取 CSS 变量之前应用已解析的主题，保持 HTML 控件、SVG 曲线与 WebGL 场景的深浅配色一致。截图、演示和共享测试素材均使用合成数据，不包含受试者数据、可识别身份的文件名或本机路径。
