# MySQL 演示数据与读取范围

产品只保留原界面和 MySQL 数据入口。演示数据也是数据库业务记录，仍在名称/答复中标明模拟性质。

空库从 [init.sql](../../apps/api/src/main/resources/db/init.sql) 一次导入账号、项目、条款、应答、评审、快照、知识数据和 Word 原件。`npm start` 默认开启预热，已有库保留现有记录。可设置 `RFQ_DEMO_DATA_ENABLED=false` 跳过预热。

`GET /projects/{id}/workflow-records` 受现有项目授权检查保护；`GET /business-units/{id}/resources` 受 BU 和关联项目权限检查保护。前端按原页面形状映射，不从 localStorage 补业务数据。未实现的业务编辑操作继续禁用。

开发环境顶部下拉的快捷账号通过普通密码登录换取真实 JWT。失败保留当前登录状态，切换成功后重新读取当前账号可见数据库数据。生产构建隐藏快捷入口。

数据库核对查询见 `mysql-demo-check.sql`。
