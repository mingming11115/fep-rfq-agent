# BU管理与知识管理 UI 统一

Goal: 按用户确认的 Group 配置页 Ant Design 风格，统一 BU管理、标准回复库、历史RFQ及知识页导航。
Architecture: 新增局部共享 AdminPageHeader 与样式；BU管理使用原生 Card/Table/Tag，知识工作区保留原有数据和审批组件，统一标题、分区和表单视觉层级。
Tech Stack: React、Ant Design、现有业务领域模块。
Spec: 用户确认当前 Group 配置页样式作为参照；优化页面 UI，业务规则及权限保持。

- [x] 共享标题、卡片、筛选及响应式布局；可访问的知识导航。
- [x] BU人员原生分页表格、资格状态标签、评审配置卡片。
- [x] 标准回复库与历史RFQ标题、筛选、列表、详情样式统一。
- [x] 界面交互验证、业务回归与生产构建，独立复核。

Constraints: 不修改当前 genericCatalog.js 和 GenericCatalog.jsx 中用户已有未提交修改；不自动提交或推送。
Review focus: BU切换、分页筛选重置、权限按钮、知识导航、窄屏详情布局、弹窗内角色及审批规则。

Validation: 相关界面/人员/权限/知识/历史RFQ回归42项通过；生产构建通过；隔离Chrome验证3页面无脚本错误，720px和390px知识页面无横向溢出；独立代码复核未发现功能回归。
Local previews: .local/admin-preview（隔离演示数据，不使用真实账号会话）。
