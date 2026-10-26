# 应答依据改名与去重 Implementation Plan

> **For agentic workers:** Execute this small presentation change inline; keep the user's existing checkout and pending changes.

**Goal:** 保留布局，通过改名和展示去重区分候选资料与当前应答引用的证据。

**Architecture:** 仅修改 ResponsePage 和 AssessmentPanel 的展示。候选内容继续读取 suggestion，当前引用继续读取 form.evidence。

**Tech Stack:** React 19 / Vite 7 / node:test。

**Spec:** 用户选择“改名和去重”；不采用区块合并方案。

## Global Constraints

- 使用“候选参考依据”和“当前引用证据”。
- 客户原文出处保留在客户要求旁，底部不再重复展示。
- 应答建议保留建议结论、来源摘要和待核实事项，完整候选证据通过入口查看。
- 保留既有采用、匹配、保存、版本与权限逻辑。
- 本次为可逆展示修改，不新增与实现重复的测试，不提交其他待处理工作。

## Review Focus

- 无命中、检索失败和无权限时不增加可误导的候选入口。
- 当前引用为空时不以候选证据代替。
- 候选与当前引用不同时分别展示各自的数据。
- 查看候选不会清除当前未保存内容。
- 较窄侧栏下新名称和底部引用仍可阅读。

### Task 1: 更新展示并验证

**Files:** Modify `rfq-react-prototype/src/pages/ResponsePage.jsx` and `rfq-react-prototype/src/components/AssessmentPanel.jsx`.

- [x] 更新页签、标题、候选证据字段名称。
- [x] 将应答建议的完整证据文本改为摘要入口；入口打开当前条款的候选页签。用于参数核实的独有资料继续显示。
- [x] 底部只展示当前应答证据，原文定位入口继续保留在客户要求区。
- [x] 运行既有测试、生产构建、diff 检查，并在浏览器核对名称、去重与入口。

验证：`npm test` 115/115 通过，`npm run build` 通过（保留既有包体积提示），`git diff --check` 通过。浏览器核对标准回复、能力候选、无候选及引用为空；确认摘要入口切换到候选页签，当前引用继续独立显示。

截图：`docs/prototype-updates/2026-10-26-response-evidence-cleanup.png`。
