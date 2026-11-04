# RFQ V0.3 交互原型改造实施计划

> 历史计划：本文保留实施当时的状态名称。当前项目五态、任务三态及退回规则以 [2026-10-24 状态调整设计](../specs/2026-10-24-rfq-status-workflow-design.md) 为准，勿按下文旧状态重新实现。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于现有 React 原型落地 V0.3 的五入口、项目处理页和任务闭环，保留已有数据及确认、评审、快照规则。

**Architecture:** 沿用 React、Vite、现有页面和浏览器存储。先提取统一任务、项目摘要及导航上下文，再调整页面外壳与文档工作区，最后联通批注、评审、澄清和导出。新增状态采用可重复执行的增量迁移，旧模块通过适配函数接入。

**Tech Stack:** React 19、Vite 7、lucide-react、Node 内置测试；浏览器验收使用当前会话可用的浏览器工具。

**Spec:** [交互设计 V0.3](../../product/FEP销售RFQ提效Agent_交互设计_v0.3.md)，包括第 16 节 WF-00～WF-19 草图和 IX-01～IX-18 验收场景。

## 实施范围

本轮以现有交互原型为基线，完成可操作的页面、任务和版本流程。既有 BHEL PDF 可继续使用真实来源；固定 Word 示例和模拟匹配保持明确标识。

真实 DOC 转换、DOCX 原版式读取、任意客户 Word 填写及 DOCX 正式输出需要独立的文档处理方案。本轮为预览、锚点和导出保留明确接口，不将示例正文或现有 CSV 下载声称为这些能力。若本轮同时要求这些能力，应先补充文档处理子计划，再实施相应接入，不能只用界面替代。

## Global Constraints

- 一级导航固定为“工作台、任务中心、我的 RFQ、AI 分析记录、管理后台”。
- 项目内保留“RFQ解析、RFQ细则比对、导出文档”，资源、版本和设置入口不得因导航合并丢失。
- “成功条款自动导入”，不增加全量确认导入关卡。
- 原文章节来自当前文件；条款编号允许重复或为空，以稳定内部 ID、文件和版本定位。
- 标准回复最高相似度“>80%”时可初始填入，历史 RFQ 匹配不套用此阈值；不自动确认。
- 保存草稿不办结任务；查看不改变任务状态；业务动作按节点完成任务。
- 原文只读、人工应答、内部批注分层；批注保存与应答保存分别显示。
- 重新匹配和获批方案不得静默覆盖人工应答。
- 项目负责人、专业处理人、专业批准人、最终审批人分别处理；同版本自审按身份检查。
- 正式导出只读取当前有效的已批准快照；内部字段不自动对外输出。
- 保留现有用户数据；迁移不重置演示、不覆盖手工编辑、不删除历史快照或批注。
- 本计划文件及 V0.3 文档可以提交；现有 `.DS_Store` 修改不纳入改造提交。

## Review Focus

1. 旧浏览器记录可能缺少成员 ID、任务、来源版本或有效性字段；升级必须幂等并保留内容。由任务 1 测试覆盖。
2. 同项目有重复编号、无编号、多个来源文件；从任务或检查项进入必须精确定位，并在返回时恢复筛选。由任务 3 和任务 5 测试覆盖。
3. 用户打开旧任务时，对象可能已改版、改派或权限失效；保存和办结不能沿用过期上下文。由任务 2 和任务 6 测试覆盖。
4. Word 批注锚点可能因客户新版而失效；不得把旧批注自动贴到相同编号的新段落。由任务 5 测试覆盖。
5. 待审批期间来源、映射、附件或应答变化；旧审批任务需要失效，新快照重新审批，旧文件可回看。由任务 7 测试覆盖。

## 基线和验收方式

2026-10-23 已运行 `npm test`：28 项通过，0 失败。现有测试位于 `apps/web/src/domain.test.js`。后续新增测试分别放入对应 `*.test.js`，测试命令改为 `node --test src/*.test.js`，确保新旧测试同时执行。

纯逻辑使用 Node 测试，页面布局与实际点击使用浏览器验收。每个任务先写最小失败测试，再实施、运行对应测试并检查改动。代码提交只包含本任务文件；不依赖清空 localStorage 验证。

执行前按工作区偏好决定在当前目录还是隔离工作区修改。任何隔离检出必须包含已确认的 V0.3 文档及本计划，不能从不含这些文档的旧提交开始。

## 第一批 入口和任务基础

### Task 1 数据升级和演示身份

**Files:**
- Create: `apps/web/src/stateMigration.js`
- Test: `apps/web/src/stateMigration.test.js`
- Modify: `apps/web/src/App.jsx` 的 `initial`、`update` 及身份切换。
- Modify: `apps/web/src/data.js` 的演示成员数据。
- Modify: `apps/web/package.json` 的测试命令。

**Interfaces:**
- Produces: `upgradePrototypeState(previous, demo)`，返回升级后的应用状态，包含 `schemaVersion: 2`、`actorId`、`tasksById`、`analysisRuns` 和 `navigationContext`，保留全部既有字段。
- Produces: `getActor(state)`，返回 `{ id, role }`；三个演示身份 ID 固定为 `demo-sales`、`demo-technical`、`demo-approver`。
- 专业角色到演示人员的映射只用于交互演示，真实权限仍为后续系统接入范围。

- [ ] 写测试 `upgrade preserves edited rows and historical snapshots`：给旧状态加入自定义答复、快照和独立批注存储引用，升级后逐项相等。
- [ ] 写测试 `upgrade is idempotent`：`assert.deepEqual(upgradePrototypeState(upgraded, demo), upgraded)`；损坏记录不得静默重置有效项目。
- [ ] 运行 `node --test src/stateMigration.test.js`，确认因接口缺失失败。
- [ ] 实现升级与身份接口；迁移只填缺失字段，不改现有存储键和独立模块记录。
- [ ] 改测试命令并运行 `npm test`，确认现有 28 项及新测试通过。
- [ ] 提交本任务文件：`feat: preserve prototype state during v03 migration`。

### Task 2 统一任务和项目摘要

**Files:**
- Create: `apps/web/src/taskDomain.js`
- Create: `apps/web/src/projectSelectors.js`
- Test: `apps/web/src/taskDomain.test.js`
- Test: `apps/web/src/projectSelectors.test.js`
- Modify: `apps/web/src/App.jsx` 的条款、评审和快照动作接入。

**Interfaces:**
- Produces: `reconcileTasks(state, { at })`，保留历史任务并按业务对象、版本、节点、轮次生成或更新有效任务，返回应用状态。
- Produces: `applyTaskAction(task, action)`，动作包含 `type, actorId, at, objectVersion`；支持 `start, save, submit, confirm, approve, reject, transfer, invalidate`，返回新任务或抛出明确原因。
- Produces: `selectMyTasks(state, { actorId, projectId, tab })`，返回按权限和任务状态筛选的任务数组。
- Produces: `getProjectSummary(state, projectId, actorId)`，返回主阶段、本人待办数、有效确认数、评审数、澄清数、复核数；各问题标记按条款去重且允许重叠。
- Task fields: `id, projectId, objectType, objectId, objectVersion, kind, round, assigneeId, status, arrivedAt, startedAt, dueAt, completedAt, history`。
- `kind` 固定为 `draft, confirm, recheck, review-process, review-approve, clarify, final-approve, knowledge-approve, capability-approve`；有效状态使用 `待办理、办理中、已办理、已失效、已取消`，转出是历史事件而不是办结。

- [ ] 写测试 `view and save never complete tasks`：查看不调用状态变更；`save` 保持办理中；仅匹配节点的提交或确认可办结。
- [ ] 写测试 `transfer keeps deadline and does not count as completion`：改派保留 `arrivedAt`、`dueAt` 和历史。
- [ ] 写测试 `stale version and wrong assignee cannot complete task`：旧版本或非责任人动作抛错。
- [ ] 写测试 `reconciliation does not duplicate tasks`：对同一对象重复协调两次，任务 ID 和数量不变；改版使旧任务失效并产生新任务。
- [ ] 写测试 `parallel reviews do not move project out of response preparation`：并行评审与澄清保留应答编制中；工作台、任务中心和项目卡片使用同一个 `selectMyTasks` 计数。

关键断言示例：

```js
const task = { id: 'T-1', projectId: 'P-1', objectType: 'requirement', objectId: 'R-1', objectVersion: 2, kind: 'confirm', round: 1, assigneeId: 'demo-technical', status: '办理中', arrivedAt: '2026-10-20T00:00:00Z', dueAt: '2026-10-25T00:00:00Z', history: [] };
assert.equal(applyTaskAction(task, { type: 'save', actorId: 'demo-technical', objectVersion: 2, at: '2026-10-23T00:00:00Z' }).status, '办理中');
assert.throws(() => applyTaskAction(task, { type: 'confirm', actorId: 'demo-sales', objectVersion: 2, at: '2026-10-23T00:00:00Z' }));
assert.throws(() => applyTaskAction(task, { type: 'confirm', actorId: 'demo-technical', objectVersion: 1, at: '2026-10-23T00:00:00Z' }));
```

- [ ] 运行两份新测试，确认失败；实现上述纯函数并接入应用动作。
- [ ] 运行 `npm test`，核对原确认、评审和快照测试均保留。
- [ ] 提交：`feat: unify task lifecycle and project summaries`。

### Task 3 五入口外壳和导航上下文

**Files:**
- Create: `apps/web/src/navigation.js`
- Create: `apps/web/src/components/ProjectWorkspace.jsx`
- Create: `apps/web/src/components/AdminWorkspace.jsx`
- Test: `apps/web/src/navigation.test.js`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/data.js`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: `parseWorkRoute(hash)`、`buildWorkRoute(route)`，route 字段为 `page, projectId, fileId, sourceVersion, requirementId, reviewId, snapshotId, taskId, returnKey`。
- Produces: `saveReturnContext(key, context)`、`readReturnContext(key)`；保存列表页签、筛选、页码和位置，使用 sessionStorage。
- `ProjectWorkspace` 接收 `route, summary, children, onNavigate, onReturn`；项目 tabs 固定为解析、细则比对、导出。
- `AdminWorkspace` 复用现有知识、机型能力、证据、审计和配置页面，按子模块切换。
- Consumes: Task 2 的统一摘要与任务查询；保留旧 `navigate(page, requirementId)` 调用适配。

- [ ] 写测试 `legacy routes remain reachable`：`#/documents`、`#/response`、`#/reviews`、`#/export` 仍能进入对应项目区域，管理旧地址映射到正确子模块。
- [ ] 写测试 `route round trip preserves duplicate-number clause identity`：两个同号条款使用不同 ID，序列化后不串项。
- [ ] 写测试 `export return restores selected template and issue`：返回上下文保留模板、映射和检查位置。

关键断言示例：

```js
const route = { page: 'response', projectId: 'P-1', fileId: 'F-2', sourceVersion: 'v1', requirementId: 'unnumbered-2', taskId: 'T-2', returnKey: 'export:P-1' };
assert.deepEqual(parseWorkRoute(buildWorkRoute(route)), route);
assert.equal(parseWorkRoute('#/documents').page, 'documents');
```

- [ ] 运行 `node --test src/navigation.test.js` 确认失败；实现外壳、路由和返回上下文。
- [ ] 浏览器检查 WF-00：仅五个一级入口；资源和项目工具可达；有未保存编辑时切换导航仍受保护。
- [ ] 运行 `npm test` 和 `npm run build`。
- [ ] 提交：`feat: introduce five-entry navigation and project workspace`。

### Task 4 工作台 任务中心 我的 RFQ 和分析记录

**Files:**
- Create: `apps/web/src/pages/TasksPage.jsx`
- Create: `apps/web/src/pages/AnalysisRecordsPage.jsx`
- Create: `apps/web/src/analysisDomain.js`
- Test: `apps/web/src/analysisDomain.test.js`
- Modify: `apps/web/src/pages/DashboardPage.jsx`
- Modify: `apps/web/src/pages/ProjectsPage.jsx`
- Modify: `apps/web/src/pages/WorkflowPages.jsx` 的模拟解析事件。
- Create: `apps/web/src/pages/workspace-pages.css`

**Interfaces:**
- `TasksPage` 消费 `selectMyTasks`，通过 `onTaskAction(taskId, action)` 开始办理或转办，通过 `onOpenTask(taskId, mode)` 查看或办理。
- 项目卡片及列表共用 `getProjectSummary` 和 `onOpenProject(projectId, mode)`；`mode` 为 `view` 或 `continue`。
- Produces: `appendAnalysisRun(runs, run)`，运行记录包含 `id, projectId, fileId, sourceVersion, type, status, startedAt, endedAt, successCount, failedCount, needsHumanCount, previousRunId`。
- 项目移交只更新负责人，待办改派逐项明确选择，不联动更改全部专业职责。

- [ ] 扩充任务与项目测试：同一项目“我发起”和“我参与”可重叠，切换范围不越过授权；转办与负责人移交影响分开。
- [ ] 写测试 `no-match result is successful execution` 和 `retry appends related run without overwriting failure`。

关键断言示例：

```js
const failed = { id: 'RUN-1', projectId: 'P-1', fileId: 'F-1', sourceVersion: 'v1', type: 'match', status: '失败', failedCount: 1 };
const next = appendAnalysisRun([failed], { ...failed, id: 'RUN-2', status: '完成', failedCount: 0, successCount: 1, needsHumanCount: 1, previousRunId: 'RUN-1' });
assert.equal(next.length, 2);
assert.equal(next.find(run => run.id === 'RUN-1').status, '失败');
assert.equal(next.find(run => run.id === 'RUN-2').status, '完成');
```

- [ ] 运行新测试确认失败；实现 WF-01～WF-06，并接入模拟分析记录。
- [ ] 浏览器验证待办、已办、全部；卡片/列表保留筛选；点任务名称与办理均带正确上下文；各处待办计数一致。
- [ ] 刷新并确认已有项目、答复、快照和批注未丢失。
- [ ] 运行 `npm test`、`npm run build`，提交：`feat: add task center and project views`。

## 第二批 原文和条款处理

### Task 5 原文主视图和文件版本锚点

**Files:**
- Create: `apps/web/src/documentAnchors.js`
- Create: `apps/web/src/components/SourceDocumentPane.jsx`
- Create: `apps/web/src/components/RequirementOutline.jsx`
- Test: `apps/web/src/documentAnchors.test.js`
- Modify: `apps/web/src/pages/ResponsePage.jsx`
- Modify: `apps/web/src/components/DocumentWorkbench.jsx`
- Modify: `apps/web/src/components/document-workbench.css`
- Modify: `apps/web/src/pages/response-page.css`

**Interfaces:**
- Produces: `makeSourceAnchor(row)` 返回 `{ projectId, fileId, sourceVersion, requirementId, locator }`。
- Produces: `resolveSourceAnchor(rows, anchor)` 返回 `{ status: 'resolved' | 'stale' | 'missing', row }`，不得使用条款编号替代稳定身份。
- `SourceDocumentPane` 接收 `file, rows, selectedAnchor, showResponses, onSelectAnchor`；现有 PDF 使用真实来源，Word 示例展示示例标识，未接入真实预览的文件给出明确状态。
- `RequirementOutline` 接收当前文件条款、选中 ID 与筛选；不创建统一客户章节分类。

- [ ] 写测试 `same clause numbers across files resolve independently`、`unnumbered clause resolves by id`、`old-version anchor is stale`，旧锚点不能自动贴到新版段落。

关键断言示例：

```js
const rows = [{ id: 'R-1', projectId: 'P-1', sourceFileId: 'F-1', sourceVersion: 'v1', clause: '1.1' }, { id: 'R-2', projectId: 'P-1', sourceFileId: 'F-2', sourceVersion: 'v1', clause: '1.1' }];
assert.equal(resolveSourceAnchor(rows, makeSourceAnchor(rows[1])).row.id, 'R-2');
assert.equal(resolveSourceAnchor([{ ...rows[1], sourceVersion: 'v2' }], makeSourceAnchor(rows[1])).status, 'stale');
```

- [ ] 运行 `node --test src/documentAnchors.test.js` 确认失败；实现锚点与正文组件。
- [ ] 重排 WF-07～WF-09：左目录、中间来源原文、右侧条款；复用差距依据、三级匹配、草稿和确认。
- [ ] 明确右侧“差距与应答、匹配依据、批注与记录”；操作区按职责切换，未保存保护覆盖目录、文件、任务及导航切换。
- [ ] 浏览器验证三个文件案例：BHEL PDF、Safety/Facility、反应模块/中转模块；检查同号及无编号条款往返定位。
- [ ] 运行 `npm test`、`npm run build`，提交：`feat: make source document the main response workspace`。

### Task 6 批注 评审和澄清闭环

**Files:**
- Create: `apps/web/src/commentDomain.js`
- Create: `apps/web/src/reviewDomain.js`
- Create: `apps/web/src/components/ClarificationPanel.jsx`
- Test: `apps/web/src/commentDomain.test.js`
- Test: `apps/web/src/reviewDomain.test.js`
- Modify: `apps/web/src/components/WordCommentsPrototype.jsx`
- Modify: `apps/web/public/word-comments.html`
- Modify: `apps/web/src/pages/WorkflowPages.jsx` 的 ReviewsPage。
- Modify: `apps/web/src/pages/ResponsePage.jsx`

**Interfaces:**
- Produces: `promoteCommentToIssue(comment, { kind, actor, at })`，kind 为 `review` 或 `clarification`；返回关联提案，重复转换复用已有事项标识。
- Produces: `prepareReviewProposal(requirement, approvedReview)`，返回 `{ before, proposal, baseVersion }`；不直接写入人工应答。
- Produces: `applyReviewProposal(requirement, proposal, { expectedVersion, actor })`，版本一致且获授权才应用，保留差异与来源并进入待确认或待复核。
- 澄清记录包含问题、跟进人、预期回复日期、回复、回复附件、解决充分性和应答修改建议。
- Consumes: Task 2 的任务动作和 Task 5 的来源锚点。

- [ ] 写测试 `solving comment does not close promoted issue`、`comment conversion is idempotent`、`approved proposal preserves human answer until adopted`。
- [ ] 写测试 `stale proposal cannot overwrite newer reply`、`role switch cannot approve own submitted version`、`recording incomplete customer reply keeps follow-up open`。

关键断言示例：

```js
const requirement = { id: 'R-1', version: 2, draft: '人工答复', status: '待确认' };
const approvedReview = { id: 'DEV-1', requirementId: 'R-1', status: '已关闭', proposedDraft: '获批建议', approvedBy: 'demo-approver' };
const proposal = prepareReviewProposal(requirement, approvedReview);
assert.equal(requirement.draft, '人工答复');
assert.equal(proposal.before.draft, '人工答复');
assert.throws(() => applyReviewProposal({ ...requirement, version: 3 }, proposal, { expectedVersion: 2, actor: { id: 'demo-technical', role: '技术确认人' } }));
```

- [ ] 运行新测试确认失败；将批注关联到当前来源上下文，批注与应答分别显示保存状态。
- [ ] 实现 WF-10～WF-15；复用已有评审表单、路径、批准和退回逻辑，修改批准后直接覆盖应答的行为。
- [ ] 浏览器完成一次“批注 → 评审 → 提交方案 → 独立批准 → 差异核对 → 条款确认”，再完成一次客户澄清；保存中间草稿不得办结任务。
- [ ] 运行 `npm test`、`npm run build`，提交：`feat: connect annotations reviews and clarification tasks`。

## 第三批 变更和导出

### Task 7 变更复核 冻结快照和精确返回

**Files:**
- Create: `apps/web/src/snapshotDomain.js`
- Test: `apps/web/src/snapshotDomain.test.js`
- Modify: `apps/web/src/domain.js`
- Modify: `apps/web/src/rfqWorkflow.js`
- Modify: `apps/web/src/components/RfqRevisionPanel.jsx`
- Modify: `apps/web/src/pages/WorkflowPages.jsx` 的 ExportPage。
- Modify: `apps/web/src/pages/ManagementPages.jsx` 的版本与设置入口。

**Interfaces:**
- Produces: `snapshotFingerprint({ rows, sourceVersions, configuration, template, mapping, attachments })`，稳定序列化全部批准范围，不仅比较答复正文。
- Produces: `checkSnapshotValidity(snapshot, current)`，返回 `{ valid, reasons }`；版本、引用或批准范围变化时禁止当前正式导出。
- `getExportIssues` 的每个 issue 增加 `objectType, objectId, route`，使用 Task 3 导航与返回上下文。
- 客户新版对齐优先明确稳定 ID 与来源锚点；不确定对应关系返回待核对，人工确认映射后再应用。

- [ ] 写测试 `mapping attachment or source changes invalidate pending approval`、`historical approved snapshot remains unchanged`、`old approval task is invalidated on changed submission`。
- [ ] 写测试 `duplicate or missing numbers require explicit revision mapping`；保留旧唯一编号比对路径的已有测试，不扩大为错误自动匹配。

关键断言示例：

```js
const base = { rows: [{ id: 'R-1', version: 1, draft: '已确认答复' }], sourceVersions: ['F-1:v1'], configuration: {}, template: { id: 'TM-1', version: 1 }, mapping: { answer: 'draft' }, attachments: [] };
assert.notEqual(snapshotFingerprint(base), snapshotFingerprint({ ...base, sourceVersions: ['F-1:v2'] }));
assert.notEqual(snapshotFingerprint(base), snapshotFingerprint({ ...base, attachments: [{ id: 'ATT-1', version: 1 }] }));
assert.notEqual(snapshotFingerprint(base), snapshotFingerprint({ ...base, mapping: { answer: 'conditions' } }));
```

- [ ] 运行新测试确认失败；实现三种比对模式的对象选择及影响预览，不能把查看差异当作应用。
- [ ] 完成 WF-16～WF-19；接入最终任务，导出缺项返回具体条款或事项，修正后恢复模板与映射。
- [ ] 浏览器验证旧快照只读、新版修改需复核、独立审批、当前有效 CSV 正式输出和失败重试；真实 DOCX 输出保持接口边界说明。
- [ ] 运行 `npm test`、`npm run build`，提交：`feat: connect revision checks and approved exports`。

### Task 8 全流程验收和交付

**Files:**
- Modify: `apps/web/README.md`
- Modify: `apps/web/启动说明.md`
- Modify: `apps/web/演示汇报.md`
- Create: `docs/RFQ交互改造验证_2026-10-23.md`
- Create: `docs/prototype-updates/2026-10-23-v03-*.png`，仅保存实际页面截图。

- [ ] 从未重置的已有数据打开原型，逐项执行 V0.3 IX-01～IX-18；记录通过项、实际结果与未实现的真实文档能力。
- [ ] 使用新建项目执行“上传示例 → 自动解析 → 应答 → 发起评审 → 批准 → 条款确认 → 冻结 → 最终审批 → 正式导出”。
- [ ] 对照 WF-00～WF-19 检查所有入口和操作，确认不留下只有文案而无法进入的主流程按钮。
- [ ] 检查常见桌面宽度下原文与操作区无遮挡；窄屏提供目录和详情切换，不把三列强行挤成无法阅读的布局。
- [ ] 运行 `npm test`、`npm run build`、`git diff --check`，仅在新改动或失败修复后重复相关检查。
- [ ] 按选定执行方式完成代码复核，修复有依据的问题并回归受影响路径。
- [ ] 更新操作说明与真实能力边界，交付原型访问地址、实际页面截图、验证记录及剩余文档处理接入项。
- [ ] 提交：`docs: record v03 workflow verification and demo guide`。

## 计划自检

- V0.3 五入口及 WF-00～WF-06：任务 1～4。
- 原文主视图、解析和 AI 结果 WF-07～WF-09：任务 5。
- 批注、评审、澄清、转办及移交 WF-10～WF-15：任务 2、4、6。
- 版本、快照、导出 WF-16～WF-19：任务 7。
- 全部 IX-01～IX-18：任务 8，逻辑风险分别在前置任务中自动测试。
- 现有知识、能力、证据、设置及审计不另造一套状态，任务 3 迁移入口并复用。
- 真实 Word 处理及通用会签引擎不在本轮模拟交互的完成声明中，必须另有可验证实现才能交付这些能力。

## 执行方式待选择

建议直接在本会话由主代理按任务顺序实施，并在结束时做一次独立代码复核。任务 1～3 的接口与 Task 5～7 紧密相连，统一实施更容易保持数据和跳转一致。

也可使用每任务独立实现和复核的子代理方式，适合更细的逐任务复核，但上下文成本更高。执行前确认本计划是否覆盖预期，以及当前目录或隔离工作区的选择。
