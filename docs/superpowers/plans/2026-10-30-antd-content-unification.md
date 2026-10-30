# RFQ 内页 Ant Design 统一实施计划

> 执行：在当前会话按 writing-plans / executing-plans 技能直接实施并验证。

**Goal:** 按用户给出的六项差异，将内页统一到外壳所用的 antd / ProComponents。

**Architecture:** 保留现有业务状态和回调。主题回归 antd 默认值；页头、查询、表格、状态和基础交互使用真实组件；复杂业务布局保留。

**Tech Stack:** React 19、Ant Design 5.29、ProComponents 2.8。

**Spec:** 本次用户消息的主色、页头、筛选、表格、状态、图标六项对比。

## Global Constraints

- 主色 `#1677ff`；使用原生控件的尺寸、边框、hover 和语义色。
- 保留卡片/列表切换、查询/重置、项目操作及权限校验。
- 保留工作区已有未提交修改；复用当前 checkout，变更保持可审阅，不提交或发布。

## Review Focus

- 查询和重置后项目结果恢复，已有筛选可正常读取。
- 行点击、单元格操作、选择及禁用状态在表格迁移后仍有效。
- 管理页动态列及空状态正常。
- RFQ 详情标题、原文和应答布局正常。
- 390px 下页头、查询和表格不撑开整页。

## Tasks

- [x] 1. 统一主题与基础组件，移除 lucide 和旧组件样式的影响。
- [x] 2. 使用 PageContainer 页头、原生 Tabs 和 Pro 查询表单；迁移残留表格为 Ant Table。
- [x] 3. 运行原有业务测试、构建和浏览器交互验收，保存验证记录与截图。

## Verification

- 基线：`npm test`，319 通过。
- 浏览器回归脚本：`/private/tmp/rfq-antd-unify-qa.cjs`；迁移前 PageContainer 检查应失败，迁移后通过。
- 最终：`npm test`、`npm run build`、`git diff --check`；检查主要业务角色和窄屏。

## 执行记录

- 复用当前 checkout；不创建新工作树，不提交或发布，保留并存的未提交工作。
- 27 处表格交由 Ant Table 渲染。兼容层保留行 key、单元格 JSX、行事件、合并空行和禁用状态。
- 项目、任务、分析、知识、审计、BU 人员、BU 看板使用纵向 QueryFilter。
- 独立代码复核发现 Select 缺省 value 和 TextArea DOM ref 两项兼容问题，均已用先失败后通过的测试修复。
- 保存过的项目查询重置同步清空输入框；手机断点切换默认关闭侧栏。
- 最终 324 项测试通过，构建及浏览器三角色回归通过；构建保留既有的大依赖块提示。
