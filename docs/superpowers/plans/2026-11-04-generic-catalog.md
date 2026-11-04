# 通用分组与能力配置 Implementation Plan

Goal: 各 BU 独立配置名称、层级和字段，RFQ 可选择通用分组。
Architecture: 增加 BU 隔离的目录 schema 与节点；兼容现有机型工艺和能力审批资料。
Tech Stack: React、Ant Design、localStorage、Node test runner。
Spec: 用户于当前会话确认的通用分组树方案。

- [x] 通用目录领域模型：层级、字段、节点校验、BU 隔离、历史目录迁移、路径与 RFQ 快照；先验证失败测试再实现。
- [x] 配置界面：名称、层级排序及停用，字段类型和必填，节点维护，能力挂载；保留原能力审批入口。
- [x] RFQ 通用分组选择和快照兼容，执行领域测试、现有回归与构建。

Constraints: 不删除历史记录；配置仅 BU 配置权限可写；目录数据不跨 BU。
Review focus: 停用祖先、必填值 0、非法日期、重复字段、已引用层级移除、已有 RFQ 快照。

Validation: 全量串行回归 502/502；最终目录与界面定向测试 9/9；生产构建通过。
Review: 完成独立代码复核；补充发布撤销入口及旧目录新增条目的增量兼容。
