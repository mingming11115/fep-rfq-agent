# RFQ 参考合同审查产品的优化实施计划

> 执行方式：在当前原型内逐项实现，保留现有未提交修改。参考用户已确认的工作台设计与指定的三个产品。

**目标：** 在 RFQ细则比对内看清差距、处理偏离、理解审批路径，并检查新版条款对已有应答的影响。
**范围：** React 交互原型及需求、交互和优化说明文档；数据与解析继续明确标注为模拟。
**约束：** 不恢复解析人工比对、顶部处理偏离／导出应答按钮、知识页客户反馈；不改模块名称。

## 任务

- [x] 参数与依据：结构化对照客户值、能力值、单位、工况、配置、证据；单位兼容才计算差距，条件不足保持待澄清。参考 SAP／Icertis 偏离识别与 SpotDraft AI。
- [x] 就地处理偏离：复用既有事项详情和审批逻辑，在当前条目打开；保留未保存保护、独立批准及应答回填。参考 SpotDraft 审批演示。
- [x] 条件审批路径：按条目类别选择专业处理职责，展示触发条件、当前责任人、截止日期与最终批准；沿用项目责任配置。参考 Concord 条件审批。
- [x] 版本影响：输入结构化新版条款，按条款编号对齐，展示新增／修改／删除／不变及前后内容；应用时只使受影响条目待复核，保留已有答复及冻结快照。参考 SAP／Icertis 版本比对。
- [x] 交付说明：输出优化什么、怎么优化、参考哪个，写明原型边界和核验范围。

## 文件与验证

业务算法集中在 src/rfqWorkflow.js，通过 src/domain.test.js 覆盖单位转换、条件不足、类别路由、重复编号、空输入、删除和恢复、应答保留、版本失效。界面分为 AssessmentPanel、ApprovalRoute、RfqRevisionPanel，接入现有 ResponsePage、ReviewsPage 和 VersionsPage。运行 npm test、npm run build、git diff --check；浏览器检查三栏、条目内偏离、审批与版本预览。

## 参考证据

- https://www.spotdraft.com/demo-library ：官方分模块导览；使用 AI、Approvals、Workflow Manager 的公开主题和功能说明，不声称逐屏复刻。
- https://www.concord.app/approval-workflows/ ：官方条件审批、多级步骤、审批职责和提醒说明。
- https://www.sap.com/products/spend-management/ariba-contract-intelligence-by-icertis/product-tour.html ：官方搜索索引可核验偏离识别、版本比较和审批触发；正文抓取超时，未逐屏验证导览。
