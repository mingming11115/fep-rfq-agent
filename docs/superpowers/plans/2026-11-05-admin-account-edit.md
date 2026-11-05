# 后台账号编辑 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this small change in the current checkout.

**Goal:** 后台账号目录支持编辑账号姓名、邮箱，新建账号初始密码默认 `12345678`。

**Architecture:** 复用现有 `adminApi.updateUser(id, {displayName, email})` 和后端授权、审计逻辑；账号表单按 `id` 区分新建与编辑。

**Tech Stack:** React 19、Ant Design、Node test runner、happy-dom。

**Spec:** 用户请求“后台管理员增加编辑账号的功能，初始密码12345678”；沿用后端已有资料编辑范围，账号名只读，BU及业务角色继续由原有范围管理维护。

## Global Constraints

- 新建表单初始密码默认 `12345678`，允许管理员自行调整。
- 编辑只提交姓名和邮箱，不提交密码、账号名、BU、角色和状态。
- 保留工作区已有改动；复用当前 checkout，不自动提交。

## Review Focus

- 编辑应使用 PATCH，避免误调用新增账号接口。
- 空邮箱提交 null；姓名去除首尾空白后不可为空。
- 服务端拒绝保存后保留表单与错误，允许重试。
- 取消编辑不发送写请求；再次打开读取原账号资料。
- 新建默认密码可直接提交；打开编辑不会携带默认密码。

## Task 1: 账号编辑与默认密码

**Files:**
- Modify: `apps/web/src/pages/PlatformAdminPage.jsx`
- Test: `apps/web/src/platformAccountUi.test.js`

**Interfaces:** 保留已有列表和创建接口；编辑调用 `adminApi.updateUser(id, {displayName, email})`。

- [x] 添加真实组件交互测试，覆盖默认密码创建、编辑保存、取消、空姓名及接口失败重试。
- [x] 执行 `node --test apps/web/src/platformAccountUi.test.js`，确认缺失编辑入口与默认密码的预期失败。
- [x] 增加账号行编辑按钮，回填资料并按 id 分流保存；仅新建展示初始密码和BU角色字段。
- [x] 执行定向测试、`npm test` 和 `npm run build`，记录结果并检查改动。

## 验证记录

- 定向交互测试：5/5 通过。初次运行按预期因默认密码为空及缺少编辑入口失败。
- 账号与BU管理组合测试：6/6 通过；编辑器测试：25/25 通过。
- `npm run build`：通过；Vite 提示部分生成文件超过 500 kB。
- `npm test`：目录检查与工具测试通过；前端全量测试出现原有 `focusedDiscussion.test.js:26` 失败（找不到“讨论”按钮），随后停在已通过但未退出的 `genericCatalogUi.test.js`，手动停止该轮。两者均不依赖本次修改的账号页面；没有修改其他功能。单独复跑讨论用例复现同样失败，目录用例加 `--test-force-exit` 后通过。
- 独立代码复核：未发现问题；`git diff --check` 通过。

## 后续修复：新账号登录被前端拒绝

- 使用已创建的 `aaa`（SR，BU-FEP）实际登录复现：登录成功，工作台和侧栏都无权限，当前身份显示原始账号ID与错误的 BU-DEMO。
- 后端登录及成员接口均返回正确角色。前端只消费了ID、角色，没有同步账号目录、真实BU和成员资格；旧BU请求失败还会使整批成员加载失败。
- 新增 `sessionPersonnel.js` 将会话接入权限模型，成员目录按BU独立同步，补齐真实人员名称和明确资格；不自动分配项目权限。
- 新登录回到所属角色的首页，刷新时恢复有效的BU和角色选择；既有成员快照保持稳定，避免启动过程误使审批失效。
- 浏览器验证 `aaa`：修复前工作台拒绝访问；修复后刷新、退出后重登、从残留系统配置地址登录均可进入工作台与“我的RFQ”，SR可打开新建入口，未授权项目保持不可见。
- 新增自动测试覆盖四种业务角色、新平台账号、无角色账号、空目录、跨BU暂停、刷新身份、审批快照稳定，以及实际App遇到旧演示BU拒绝时仍完成真实成员同步。
- 最终相关回归：72/72通过；生产构建通过；目录检查、工具测试及25项编辑器测试通过。
- 前端全量使用 `node --test --test-force-exit --test-concurrency=1 apps/web/src/*.test.js` 避免既有测试调度器不退出：543/545通过。失败为未改动的 `focusedDiscussion.test.js:26`（找不到讨论按钮）和 `rfqDirectory.test.js`（测试环境未提供SVGElement），两者不导入本次修改的登录或会话权限模块。
- 独立复核指出并验证修复了启动时清除既有审批资格、刷新覆盖次要角色两处回归，均有先失败后通过的回归测试；最终复核无剩余问题。
