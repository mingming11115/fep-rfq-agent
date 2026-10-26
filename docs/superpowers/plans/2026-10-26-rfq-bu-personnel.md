# RFQ 四角色与 BU 人员范围实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在现有React原型中落实后台管理、BU管理员、SR、技术四种基础角色，使BU人员范围实际约束项目选人、条款确认与最终评审。

**Architecture:** 统一保存账号、BU、BU人员资格、技术组方式与项目分派；共享权限模块同时校验角色、资格、数据范围和任务归属。平台管理与BU管理分别提供入口，最终评审由项目指定的SR与技术组双方完成，技术组支持全员通过和负责人代表通过，按实际人员分别保存评审记录。

**Tech Stack:** React 19、Vite 7、JavaScript ES modules、node:test、现有CSS与localStorage，不新增依赖。

**Spec:** [RFQ四角色与BU人员范围设计](../specs/2026-10-26-rfq-bu-personnel-design.md)

## Global Constraints

- 系统设四种基础角色：后台管理、BU管理员、SR、技术。“销售”统一改称“SR”。
- 最终评审是项目流程职责，由指定SR和技术组共同承担，不作为第五种基础角色。
- SR整理应答 → 技术组成员／SR按分工确认 → SR提交评审 → 指定SR与技术组双方最终评审通过 → SR正式导出。
- 最终评审范围必须是有效确认人员范围的子集。
- 将人员加入BU范围不会自动授予所有BU项目的阅读或操作权。
- SR方评审人不能出现在本项目技术组评审名单中；技术组成员ID须去重；SR提交人与SR方评审人可以是同一人，但提交不会自动记为SR方通过。
- 技术组支持全员通过和负责人代表通过两种方式，由BU管理员配置；全员只指项目指定名单，代表必须是组内指定负责人。
- 只有同一有效快照、同一轮次的SR通过且技术组满足本轮条件，整份应答才记为已批准；仅一方通过时不能正式导出。
- 任一方退回后重新提交的新轮次，重新取得双方通过，不沿用上一轮结果。
- 用户工作区已有的导航顺序调整须保留；迁移不重置现有浏览器数据。
- 本计划只针对本机交互原型；企业认证、服务端鉴权、组织同步与多人共享存储不在实施范围。

## 已确认的最终通过规则

用户已确认技术方是一组人员，接受全员通过及指定负责人代表通过两种方式。本计划由BU管理员配置技术组方式，SR方始终单独通过；实施默认新BU采用全员通过。项目从BU范围中指定SR和技术组成员，代表模式额外指定组内负责人。提交时冻结名单、方式、负责人及规则版本，不能在评审中或导出时临时切换以绕过未完成任务。

## Review Focus

1. 同一基础角色有多名人员：两名技术人员不能互相处理对方任务，显示名称改变也不能改变授权；任务1、3覆盖。
2. BU名单中的人员没有项目授权：列表、计数、全局搜索、文件和深链接不能泄露项目内容；任务3覆盖。
3. 人员被停用或移出范围时页面仍打开：旧任务和回调即时拒绝操作并保留历史；任务2、3覆盖。
4. 旧最终审批身份及无BU项目：迁移保持ID和历史，重复加载不扩大未知人员权限；任务1、4覆盖。
5. 技术组多人及两种方式：全员模式漏一人仍不能导出，代表模式其他成员不能代替负责人；空名单、重复成员、模式切换和同一账号兼任双方不能绕过；任务1、2、3、4覆盖。

## 文件与状态接口

新增 `src/personnelDomain.js`，负责账号、BU成员、候选范围、成员变更与分派校验；新增 `src/personnelDomain.test.js`。新增 `src/pages/BuAdminPage.jsx`，负责BU人员表、资格编辑和项目授权，样式复用 `management-pages.css`。不把人员规则分散到各页面。

共享状态新增以下字段，作为本机原型的单一授权来源：

```js
accountsById: { [userId]: { id, name, enabled, systemAdmin, managedBuIds: [] } }
businessUnits: [{ id, name }]
buPersonnelByBuId: {
  [buId]: [{ userId, roles: ['SR'], enabled, canConfirm, canFinalReview,
    resourceQualifications: [] }]
}
buReviewSettingsByBuId: {
  [buId]: { technicalMode: 'all' | 'representative', version: 1 }
}
```

`resourceQualifications`可包含 `knowledge-publish`、`capability-publish`，不从最终评审资格推导。项目新增`buId`；沿用`participantIds`作为业务参与授权来源，人员表中的“授权项目”从项目状态派生，不另存一份`projectIds`。每条要求新增`confirmationAssigneeId`，项目`approvalConfig.finalReviewers = {srId, technicalIds: [], technicalRepresentativeId: null}`保存SR、非空且去重的技术组名单及组内负责人（适用时）。SR不得属于该技术组。最终评审规则固定为`sr-and-technical`，技术组内部方式从BU设置读取。

快照冻结`finalReview = {policy: 'sr-and-technical', technicalMode, ruleVersion, reviewers: {srId, technicalIds, technicalRepresentativeId}, decisions: {sr: null, technicalByActorId: {}}}`。个人结果保存`{actorId, result: 'approved' | 'rejected', reason, at}`，仅可写入当前账号自己的必需评审记录。全员模式生成一条SR任务及每名技术成员各一条任务；代表模式生成一条SR任务及一条技术负责人任务。`final-approve`任务保存`reviewSide: 'sr' | 'technical'`，任务唯一性同时包含快照ID、轮次、评审方和实际处理人ID，不能将多名技术成员合并为一条任务。

`currentProjectScope`同时纳入BU规则版本、技术组方式及项目SR／技术名单和负责人，使上述变更触发待评审快照失效；评审展示始终读取快照冻结值，不用最新BU设置改写既有任务。`isFinalReviewApproved`遇到无效冻结配置返回false，不因空名单的全称判断而误判通过。

既有专业事项保存`approverId`，从项目最终评审候选中选择一人。该字段仅表示具体方案的独立批准职责，不能作为整份应答通过标记。缺失或失效分派要求重新配置，不按基础角色猜测处理人。

管理角色的可访问BU从账号`managedBuIds`读取；业务角色从当前BU人员记录读取。`actorId`标识实际人员，`actorRole`表示当前使用的基础角色，两者分别记录。平台管理员不因`systemAdmin`获得业务角色或项目阅读权。

### Task 1: 统一人员与资格模型及兼容迁移

**Files:**
- Create: `rfq-react-prototype/src/personnelDomain.js`
- Create: `rfq-react-prototype/src/personnelDomain.test.js`
- Modify: `rfq-react-prototype/src/stateMigration.js`
- Modify: `rfq-react-prototype/src/data.js`
- Test: `rfq-react-prototype/src/stateMigration.test.js`

**Interfaces:**
- `getPersonnelContext(state, actorId, buId)` → `{account, member, managed, enabled}`，缺失对象以无资格处理。
- `getEligiblePersonnel(state, {buId, projectId, duty, side})` → 人员数组，`duty`为`confirm`或`final-review`；最终评审时`side`必填为`sr`或`technical`并过滤对应业务角色，所有候选同时过滤启用、BU资格和项目参与授权。
- `canManageBu(state, actorId, buId)` → boolean，仅启用的本BU管理员为true。
- `assertProjectAssignment(state, {actorId, projectId, userId, duty, side})` → 成功返回true，越界、最终评审方与业务角色不符、同一人员占据两方时抛出中文错误。
- `getRequiredFinalReviewers(finalReview)` → `[{actorId, side}]`；拒绝空技术组、重复成员、SR与技术重叠、缺失方式及代表不属于组内的配置；全员模式返回SR及全体技术成员，代表模式返回SR及组内负责人。
- `upgradePrototypeState(previous, demo)`沿用入口，返回包含上述统一状态及旧ID兼容映射的新版本状态。

- [x] **Step 1:** 添加失败测试：两个BU、两名同角色人员、停用账号、缺失账号、无项目参与权、最终评审资格但没有确认资格均准确过滤；跨BU管理员不可管理，SR及技术不可编辑名单；三人技术组在全员模式生成三名必需技术评审人，代表模式仅生成组内指定负责人，空组、重复成员和无效负责人拒绝。
- [x] **Step 2:** 在`rfq-react-prototype`执行`node --test src/personnelDomain.test.js src/stateMigration.test.js`，记录新测试失败原因。
- [x] **Step 3:** 实现上述接口和迁移：保留`demo-sales`等旧ID；当前角色销售负责人→SR、技术确认人→技术；旧最终审批人映射为保留ID的技术人员并具有确认及最终评审资格。历史记录原称谓不改写。只有明确的旧演示用户和示例项目获得示例BU，不将未知账号提升为业务人员。
- [x] **Step 4:** 增加迁移幂等断言，确认原应答、来源、历史快照和导出记录不丢失。重复执行Step 2命令，要求全部通过。
- [x] **Step 5:** 复核仅涉及本任务文件及既有导航改动未被覆盖，再保存独立变更；不包含工作区其他未提交修改。

### Task 2: BU 管理后台与受约束的项目选人

**Files:**
- Create: `rfq-react-prototype/src/pages/BuAdminPage.jsx`
- Modify: `rfq-react-prototype/src/personnelDomain.js`
- Modify: `rfq-react-prototype/src/pages/ManagementPages.jsx`
- Modify: `rfq-react-prototype/src/pages/management-pages.css`
- Modify: `rfq-react-prototype/src/components/AdminWorkspace.jsx`
- Modify: `rfq-react-prototype/src/navigation.js`
- Modify: `rfq-react-prototype/src/App.jsx`
- Test: `rfq-react-prototype/src/personnelDomain.test.js`
- Test: `rfq-react-prototype/src/navigation.test.js`

**Interfaces:**
- Consumes: Task 1人员上下文、候选范围与分派校验接口。
- `updateBuMember(state, {actorId, buId, userId, patch, reason})` → 新state；禁止越界修改BU及平台管理员字段，检查角色和资格子集关系，保留审计前后值。
- `assignProjectDuty(state, {actorId, projectId, userId, duty, side, requirementId, reason})` → 新state；`duty`为`confirm`，用于条款确认分派；最终评审统一使用`configureProjectFinalReviewers`，避免逐个修改时留下无效组配置。项目负责人及BU管理员均受候选范围约束。
- `updateBuReviewSettings(state, {actorId, buId, technicalMode, reason})` → 新state；仅本BU管理员可选`all`或`representative`并生成新规则版本及审计。
- `configureProjectFinalReviewers(state, {actorId, projectId, srId, technicalIds, technicalRepresentativeId, reason})` → 新state；检查本BU候选、项目权限、非空去重技术名单、SR与技术不重叠、代表在组内；与现有待评审快照冲突时令本轮失效，不原地替换冻结名单。
- `BuAdminPage({state, actorId, buId, onUpdateMember, onAssignDuty})`通过上层共享状态读写；增加`bu-admin`受限路由，不独立维护localStorage名单。

- [x] **Step 1:** 添加失败测试：名单及技术组规则编辑必须本BU管理权限及原因；普通SR、技术及他BU管理员被拒；撤销确认资格同步撤销最终评审资格；跨BU及停用人员分派被拒；SR和多名技术选人均匹配角色且ID不重叠；代表必须来自技术组；伪造新增`systemAdmin`字段被拒。
- [x] **Step 2:** 执行`node --test src/personnelDomain.test.js src/navigation.test.js`，确认新断言先失败。
- [x] **Step 3:** 实现成员变更及分派接口；保存前展示受影响的项目和未完成任务，保留原审计及历史处理人。
- [x] **Step 4:** 实现BU后台四个配置区及姓名、账号、角色、确认资格、最终评审资格、项目、状态列，接入搜索、筛选、添加、编辑及停用。在最终评审配置区提供技术组“全员通过／负责人代表通过”两项选择，SR方始终必需。平台“系统配置与运维”继续独立，移除业务授权依赖页面内“演示管理身份”切换的做法。
- [x] **Step 5:** 项目设置按稳定ID分别展示“SR方最终评审人”单选、“技术组评审成员”多选，并在代表模式展示组内负责人单选；显示各技术成员条款分工及BU规定的评审方式，不允许普通人员切换方式。缺少SR、技术成员或有效代表时允许存草稿但阻止提交。不保留可任意填入角色名的授权路径。重复Step 2命令并执行`npm run build`，要求成功。

### Task 3: 四角色权限及主流程接入

**Files:**
- Modify: `rfq-react-prototype/src/permissions.js`
- Modify: `rfq-react-prototype/src/taskDomain.js`
- Modify: `rfq-react-prototype/src/reviewDomain.js`
- Modify: `rfq-react-prototype/src/rfqWorkflow.js`
- Modify: `rfq-react-prototype/src/projectSelectors.js`
- Modify: `rfq-react-prototype/src/snapshotDomain.js`
- Modify: `rfq-react-prototype/src/App.jsx`
- Modify: `rfq-react-prototype/src/pages/ResponsePage.jsx`
- Modify: `rfq-react-prototype/src/pages/WorkflowPages.jsx`
- Modify: `rfq-react-prototype/src/pages/DashboardPage.jsx`
- Modify: `rfq-react-prototype/src/pages/TasksPage.jsx`
- Modify: `rfq-react-prototype/src/pages/ProjectsPage.jsx`
- Modify: `rfq-react-prototype/src/pages/ReferencePages.jsx`
- Modify: `rfq-react-prototype/src/components/AssessmentPanel.jsx`
- Modify: `rfq-react-prototype/src/components/ClarificationPanel.jsx`
- Modify: `rfq-react-prototype/src/components/RfqRevisionPanel.jsx`
- Modify: `rfq-react-prototype/src/components/AnnotationPanel.jsx`
- Modify: `rfq-react-prototype/src/components/ProjectWorkspace.jsx`
- Test: `rfq-react-prototype/src/permissions.test.js`
- Test: `rfq-react-prototype/src/taskDomain.test.js`
- Test: `rfq-react-prototype/src/reviewDomain.test.js`
- Test: `rfq-react-prototype/src/projectSelectors.test.js`
- Test: `rfq-react-prototype/src/snapshotDomain.test.js`
- Test: `rfq-react-prototype/src/requirementWorkflow.test.js`

**Interfaces:**
- Consumes: Tasks 1、2的统一状态和分派接口。
- `canPerform(role, action, context)`沿用前两项并增加`context = {state, actorId, projectId, requirementId, buId}`；基础角色只控制粗粒度能力，业务操作缺少必要上下文时拒绝。
- `canAccessProject(state, actorId, projectId)` → boolean，用于列表、路由、文件、搜索、AI记录及聚合统计。
- `isQualifiedTaskActor(task, actorId, state)`按BU资格和真实分派判断，替代固定`demo-technical`／`demo-approver`。
- `applyFinalReviewDecision(snapshot, {actorId, side, result, reason, at})` → 新快照；仅当前快照的必需评审人可记录自己的结果，不可覆盖他人记录；退回必填原因，SR通过且技术组满足冻结方式才批准，任一必需人员退回则整份退回。当前BU资格及任务上下文在操作边界校验；代表模式非负责人只能提供普通意见。
- `isFinalReviewApproved(snapshot)` → boolean，调用Task 1的`getRequiredFinalReviewers`校验冻结方式和非空必需名单，再验证SR通过及每名必需技术人员各自的通过记录，用于项目状态和正式导出门槛。仅有旧`status: '已批准'`、一条`reviewedById`或其他未指定成员的记录不能补齐通过。
- `canAccessPage(role, page, context)`与`getRoleNavigation(role, context)`对管理入口执行相同范围判断；`assertBusinessAction`继续作为业务操作边界。
- `assertIndependentApproval(review, actor, context)`在既有接口后增加统一授权上下文，校验事项`approverId`、有效候选资格、当前任务及提交人独立，不再要求基础角色名为“最终审批人”。新增`assignReviewApprover(state, {actorId, projectId, reviewId, userId, reason})`，供原专业事项分派入口使用；候选从Task 1的`final-review`范围取得。

- [x] **Step 1:** 添加失败测试：已分派SR确认成功，未分派SR被拒；已分派技术可完成技术方最终评审但不可提交快照或导出；SR提交者可以显式完成被指定的SR方评审，提交本身不生成通过记录；BU／后台管理员仅凭管理角色均不能执行这些业务动作；两名技术不能处理对方任务；专业事项仅指定批准人可处理且不得批准自己提交的方案。
- [x] **Step 2:** 添加范围及撤权测试：不属于项目的BU成员不能通过URL、搜索、统计或旧任务查看内容；停用人员不能从已打开页面继续确认或评审；越权的专业事项、知识和能力审核同样被拒。
- [x] **Step 3:** 执行`node --test src/permissions.test.js src/taskDomain.test.js src/reviewDomain.test.js src/projectSelectors.test.js src/snapshotDomain.test.js src/requirementWorkflow.test.js`，确认新测试失败后再实施。
- [x] **Step 4:** 更新权限模块、任务生成与处理、页面及App操作回调；将当前界面和新事件的销售称谓改为SR，顶部改为人员身份及当前基础角色，最终评审显示为任务职责。保留现有“工作台、我的RFQ、任务中心”的导航顺序。
- [x] **Step 5:** 由SR承担快照提交，冻结BU技术组规则及项目名单，按`getRequiredFinalReviewers`生成一条SR任务及N条技术任务（全员模式N为组内人数，代表模式N为1），任务唯一性包含`reviewSide`及处理人ID。允许确认人再次评审，也允许提交SR显式完成本方评审；同一账号不能兼任双方。保留专业事项支路的提交与批准人员独立校验，按事项`approverId`分派；完成后仍需采用及确认。知识和能力发布分别使用BU管理员的对应资格，不再归旧最终审批角色。
- [x] **Step 6:** 为两种技术组方式写入精确断言，再实现快照通过、项目状态及导出：三人全员组只通过两人不可导出，三人全过但SR未过仍不可导出；SR和三人全过才批准。代表模式只有组内指定负责人通过才计技术方，非负责人意见不计，负责人通过仍需SR通过。空组、重复人员、无效代表、错误评审方、未指定人员及重复点击均不能补齐通过；SR及技术可按任意先后顺序处理；任一必需人员退回整份退回并取消本轮其余任务。新快照、来源变更、BU方式变化、改派或撤权后重新提交须重新取得全部必需人员通过，上一轮结果不沿用。
- [x] **Step 7:** 重复Step 3命令，要求全部通过；确认正式导出仍检查最新有效快照、来源版本、条款确认及未闭事项。

### Task 4: 历史兼容与浏览器验收

**Files:**
- Modify: `rfq-react-prototype/README.md`
- Modify: `FEP销售RFQ提效Agent_PRD_v0.2.md`（仅当前角色及权限章节，历史产品名称不做机械替换）
- Modify: `FEP销售RFQ提效Agent_交互设计_v0.3.md`（当前角色、BU后台和主流程，保留历史版本说明）
- Create: `docs/RFQ四角色与BU人员范围验证_2026-10-26.md`
- Test: `rfq-react-prototype/src/stateMigration.test.js`
- Test: `rfq-react-prototype/src/navigation.test.js`

**Interfaces:** 消费前述最终状态与业务接口；无新增产品接口。

- [x] **Step 1:** 增加真实形状的旧本机状态迁移回归：包含旧审批身份、未完成任务、已批准快照、独立知识记录及用户项目；核对ID、历史原值、文件与导航顺序均保留。旧单人审批保留历史但不伪造双方签署，不能用于新的正式导出；旧待审批任务重新配置双方人员并提交新会签轮次。
- [x] **Step 2:** 在`rfq-react-prototype`执行`npm test`、`npm run build`；在仓库根执行`git diff --check`。记录实际结果及既有警告，不扩展无关修复。
- [x] **Step 3:** 在隔离的浏览器演示存储中验收两个BU及一个至少三名成员的技术组：BU管理员维护范围并选全员模式→SR分派条款→SR及技术成员按分工确认→SR提交→SR通过且只有两名技术通过时不可导出→最后一名通过后SR正式导出。再验证代表模式，仅指定负责人有技术方最终任务，负责人和SR均通过才可导出；补验技术先通过的相反顺序。
- [x] **Step 4:** 验收停用和改派、跨BU拒绝、无项目权限直达拒绝、旧任务失效、退回重新提交和来源变化后旧批准不可导出。不得重置用户当前浏览器存储。
- [x] **Step 5:** 更新文档及验证记录，只宣称实际完成的交互和测试；交付时明确这是本机原型权限，生产授权仍需服务端实现。

## 计划自检

四种基础角色、SR称谓、BU后台人员范围、技术组多人分工及两种评审方式、项目授权、按人生成任务、同一快照SR与技术组双方通过、退回重提、历史兼容和越权拒绝均有对应任务与验证。技术组支持全员通过或指定负责人代表通过，由BU管理员设置并随快照固定；SR方始终必需。

本轮实施已完成；146项测试、生产构建与浏览器主要流程验收通过，工作区保留进入任务前的导航顺序调整。详细修复与验证见本次验证记录。

## 实施补充

纯投票逻辑位于`src/finalReviewDomain.js`，数据范围位于`src/resourceVisibility.js`；任务转办和条款确认统一进入`taskDomain.js`，项目移交统一进入`projectDomain.js`。保留旧角色字符串的独立辅助接口兼容，当前应用身份先迁移为四角色，实际写入均校验当前人员上下文。新建演示案例可预设明确标注的模拟会签；读取旧存储不会生成模拟签署。
