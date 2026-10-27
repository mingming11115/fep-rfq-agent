# Model Capability Tree Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Preserve unrelated changes in the shared checkout.

**Goal:** 按已确认草图将机型配置和能力边界合为一页树形目录与节点详情。

**Architecture:** 纯选择器构建本BU机型、工艺、能力树并处理搜索与选中回退；独立 React 目录组件负责展开与选中。现有 CapabilitiesPage 继续负责数据、权限和编辑审核等业务操作，替换双标签布局。

**Tech Stack:** React 19、lucide-react、CSS、node:test、独立 Playwright 浏览器验收。

**Spec:** `docs/superpowers/specs/2026-10-27-model-capability-tree-design.md`

## Global Constraints

- 使用一个“机型与能力边界”页面，移除原“机型元数据 / 能力边界”顶层标签。
- 目录为 `BU → 机型（硬件版本）→ 工艺 → 能力条目`。
- 保留 BU 权限、现有本机存储及所有配置、导入和审核操作，不增加依赖。
- 不修改当前工作区中无关的已有改动；当前分支为 `codex/bu-dashboard-charts`。

## Review Focus

- 同名机型不同硬件版本、多个资料版本：归属不串联，资料版本可查。
- 缺失、外BU或错误机型的工艺关系：能力留在正确机型待关联分支。
- 搜索命中叶子：祖先保留、选中有效、清空恢复完整目录。
- 新建/修订/变更归属/切换BU：选中正确节点，不能写入或显示其他BU资料。
- 停用工艺及SR只读：保留历史、维持原操作权限。

### Task 1: 树选择器

**Files:** Create `rfq-react-prototype/src/capabilityTree.js` and `capabilityTree.test.js`.

**Interfaces:** `buildCapabilityTree({buId,buName,models,processes,capabilities,filters})` returns `{key,kind,label,children,record?,modelId?,processId?}` nodes. `findCapabilityTreeNode(root,key)` finds exact identity; `resolveCapabilityTreeSelection(root,key)` falls back to first capability, first model, then BU.

- [x] 写行为测试：BU隔离/硬件版本/最新配置、待关联能力、停用工艺、搜索祖先与筛选、空BU及失效选中。
- [x] 运行 `node --test src/capabilityTree.test.js`，确认缺少新选择器导致失败。
- [x] 实现上述接口并运行同命令，9项全部通过。

### Task 2: 同页目录与详情

**Files:** Create `rfq-react-prototype/src/components/CapabilityTree.jsx`, `capability-tree.css`; modify `src/pages/ReferencePages.jsx`.

**Interfaces:** Tree consumes Task 1 root, selectedKey and `onSelect(node)`. CapabilitiesPage reuses existing dialogs, save and review handlers; selection key is the sole active node identity.

- [x] 独立浏览器脚本先断言同页目录与能力叶子可选、无旧顶层标签，观察原页面不满足。
- [x] 实现目录、节点详情、上下文操作，配置/新建/修订后选择正确节点并展开祖先。
- [x] 浏览器验证配置机型、工艺、能力编辑及关联、资料版本、导入去重、空BU、角色权限、筛选和窄屏。
- [x] 运行 `npm test`、`npm run build`、`git diff --check`，207项通过，构建成功，无空白错误；记录浏览器结果及截图。
- [x] 独立审核识别无工艺机型的手动草稿入口遗漏；浏览器先复现失败，再恢复机型及待关联视图入口并通过完整回归。无其他审核问题。
