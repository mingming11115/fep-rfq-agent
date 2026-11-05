# MySQL 演示数据与读取范围

产品只保留原界面和 MySQL 数据入口。演示数据也是数据库业务记录，仍在名称/答复中标明模拟性质。

`MysqlDemoDataInitializer`（v1）初始化项目、原件、解析记录、条款和基本账号。`MysqlBusinessDataInitializer`（v2）补充逐条应答、评审、快照、机型、工艺、能力、知识、证据元数据、历史知识文档和技术组账号。证据目录中的历史文件名仅为原有元数据，没有伪造报告原件。

所有种子在同一事务中锁定版本标记，每版完成后不再重跑，不重置已有密码或手工修改。local 配置默认启用，其他环境默认关闭；可设置 `RFQ_DEMO_DATA_ENABLED=false`。

`MysqlApprovalScopeInitializer`（v3）只修复未被修改的 v2 导入快照，将批准范围绑定到实际数据库条款和原件版本；整个现有 JSON 必须仍与 v2 一致，否则保持原记录。语义指纹覆盖客户原文、答复、结论、条件、证据、条款与原件版本、确认人和评审资格，忽略传输附加字段及显示名称；后续真实内容变化仍使快照失效。

`GET /projects/{id}/workflow-records` 受现有项目授权检查保护；`GET /business-units/{id}/resources` 受 BU 和关联项目权限检查保护。前端按原页面形状映射，不从 localStorage 补业务数据。未实现的业务编辑操作继续禁用。

开发环境顶部下拉的快捷账号通过普通密码登录换取真实 JWT。失败保留当前登录状态，切换成功后重新读取当前账号可见数据库数据。生产构建隐藏快捷入口。

数据源生成命令为 `node scripts/generate-mysql-demo.mjs`，源文件中的旧演示常量仅供生成器及组件测试使用。数据库核对查询见 `mysql-demo-check.sql`。
