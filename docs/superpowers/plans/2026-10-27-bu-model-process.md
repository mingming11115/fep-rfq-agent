# BU 机型与工艺配置 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task in the current checkout.

**Goal:** BU 管理员可配置本 BU 的机型及其工艺，能力明确关联工艺。

**Architecture:** 沿用 BU 存储键，为机型配置和工艺配置增加独立权限及领域校验。能力仍走现有候选审核流程。

**Tech Stack:** React 19 / Vite / node:test / localStorage。

**Spec:** `docs/superpowers/specs/2026-10-27-bu-model-process-design.md`

## Global Constraints

- 不增加依赖；不授予管理者项目业务操作权；能力发布仍须独立资格。
- 旧能力工艺不明确时保留并显示“待关联工艺”。

## Review Focus

- 切换 BU 后不可将前一个 BU 的机型或工艺写入当前 BU。
- 工艺不能关联其他 BU 或其他机型的能力。
- 停用工艺保留已有能力，但阻止新提交和发布。
- 空 BU 可由管理员从零配置，技术和 SR 没有配置权限。
- 项目补充和导入不可绕过工艺归属及 BU 存储隔离。

### Task 1: 领域与权限

**Files:** `src/modelProcessDomain.js`、`src/modelProcessDomain.test.js`、`src/permissions.js`。
**Interfaces:** `saveModelMetadata(models,{context,record})`、`saveModelProcess(processes,{context,models,record})`、`assertCapabilityProcess(item,{models,processes,buId,requireEnabled})`。

- [x] 写失败测试：本 BU 管理员配置生效；SR／技术／跨 BU 拒绝；重复编码拒绝；错误机型、空工艺及停用工艺不能提交能力；修订保留版本。
- [x] 运行 `node --test src/modelProcessDomain.test.js` 确认缺失行为失败。
- [x] 实现领域函数和 `model:configure` 权限，运行领域测试。

### Task 2: 配置与能力页面

**Files:** `src/pages/ReferencePages.jsx`、`src/pages/reference-pages.css`、`src/App.jsx`、`src/pages/ResponsePage.jsx`。

- [x] 加入 BU 选择、工艺列表及配置表单；机型元数据由本 BU 管理员保存生效。
- [x] 能力筛选、详情、编辑及导入关联工艺；不明确的旧记录保留在待关联筛选。
- [x] 项目内补充使用本 BU 资料、工艺选择和存储键；切换 BU 重置页面。
- [x] 运行 `npm test`、`npm run build`，并在浏览器验证管理配置、刷新持久化、只读权限和跨 BU 切换。
- [x] 更新 README 与需求文档，记录验证结果；保留改动供用户查看。

## 验证记录

### 继续完善：项目补充与导入归属

- [x] 重新运行非默认BU项目补充浏览器验收，确认明确选型、工艺归属、独立存储和其他BU数据保留。
- [x] 增加导入模板的BU、机型、硬件版本与工艺绑定回归测试并确认失败。
- [x] 修复模板及演示预检归属，展示当前选择，不固定使用机型A／P1。
- [x] 验证模板下载、机型切换清空工艺及补充后原应答保留，更新验证记录。

- 领域回归8项通过；当前工作区全套183项通过，构建成功，diff格式检查通过。
- 浏览器验证配置、版本、刷新、双BU隔离、只读权限、能力关联、修改工艺后重导入去重、停用发布门禁均通过。
- 审查发现并修复：项目自由文本选错硬件版本、硬件版本改动继承旧能力、变更归属后导入身份重复；额外修复详情抽屉遮挡编辑弹窗。
- 项目内补充已通过独立浏览器验收；切换机型清空工艺、原应答保留、非默认BU存储隔离、所选工艺模板下载及预检归属均通过。
