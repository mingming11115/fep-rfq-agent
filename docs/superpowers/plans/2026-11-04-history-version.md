# History RFQ version implementation plan

**Goal:** 上传维护版本链并逐条比较历史 RFQ。
**Architecture:** 每个上传保留独立文档，familyId 归组；纯函数计算差异，页面使用可读资源限定候选版本。
**Tech Stack:** React / Ant Design / node:test。
**Spec:** docs/superpowers/specs/2026-11-04-history-version-design.md

## Global Constraints
保留旧数据、原件、审核状态与权限边界，不新增依赖。

## Review Focus
重复编号不误配；重编号能配对；并发上传版本递增；新版本继承范围；旧记录兼容。

### Task 1: 版本与比对领域逻辑
- [x] 新增 historyVersions.test.js，覆盖重编号、参数变化、重复编号、内部修订。
- [x] 实现 historyVersions.js，运行 node --test src/historyVersions.test.js。
### Task 2: 上传版本链
- [x] 扩展 historyClient.test.js 验证旧版保留及范围继承。
- [x] 扩展 historyClient.js 上传参数，串行分配修订号，拒绝重复版本标识。
### Task 3: 页面与验证
- [x] HistoryKnowledgePage.jsx 增加上传关联、版本记录及比对入口。
- [x] 执行 npm test 与 npm run build；记录实际结果。
