# FEP RFQ Agent

RFQ 应答与审核工程，包含 React 前端、Java 后端，以及 Word/PDF 原文批阅组件。

## 工程目录

| 目录 | 内容 |
| --- | --- |
| `apps/web` | React/Vite 前端、单元测试与静态资源 |
| `apps/api` | Java 17 / Spring Boot 后端、数据库迁移与接口测试 |
| `packages/craft-editors` | WordCraft/PdfCraft 集成、补丁、预编译资源和许可证 |
| `tests/browser` | 浏览器诊断与手动流程测试 |
| `scripts` | 工程检查与后端开发命令 |
| `docs` | 产品、架构、接口、开发指南与历史资料 |
| `.local` | 本机日志、IDE 配置和迁移核对资料；不进入 Git |

## 前端开发

### 单一 MySQL 工作空间

保留原来的完整页面、导航和 RFQ 工作台，只提供一个入口：[http://127.0.0.1:5173](http://127.0.0.1:5173)。页面登录后经 Java 后端读取 MySQL 的项目、原件、条款和成员，不读取前端演示核心缓存；空库和无授权账号保持空列表，连接失败时显示错误和重试。

```sh
npm run dev:api        # Java 后端，默认 48084
npm run dev            # 原工作台 UI，默认 5173
```

两个命令分别在终端运行。Windows 已配置好本机工具时，可运行 `npm start` 启动已配置的 MySQL、后端和唯一前端。MySQL 继续使用 `RFQ_DB_URL`、`RFQ_DB_USER`、`RFQ_DB_PASSWORD`，默认连接 `127.0.0.1:3306/rfq`。

前端模拟入口、独立数据库表格页和 `5174` 服务已取消。登录页只使用数据库账号。演示初始化默认关闭，保留已有库内记录、密码和人工修改；显式设置 `RFQ_DEMO_DATA_ENABLED=true` 后可补入完整演示集：8 个项目、33 条要求及应答、7 条评审、3 份定稿快照、2 个机型、4 个工艺、5 条能力、4 条知识、4 条证据元数据和2份历史知识文档。每版种子只执行一次，不会重置已有记录。

首页一键登录统一为张明（`mysql_sr`）、李工（`mysql_tech`）、王强（`mysql_appr`）、陈静（`mysql_bu`）和系统管理员（`admin`），开发页面顶部身份下拉沿用同一套账号。初始密码为 `Rfq@2026`，后端照常验证密码和权限，密码修改后快捷登录会正常失败。`mysql_tech2`、`mysql_tech3` 保留供已有审批记录引用，不再出现在快捷入口。

原件读取、新建项目、上传和解析使用现有后端接口。应答、评审、快照和知识目录展示读取各自的数据库业务表；尚缺完整后端持久化的编辑和审批操作保持未开放。证据迁移保存原有元数据，不会凭空生成报告原件。部分旧页面组件中的模拟工具保留供单元测试使用，产品入口不会调用它们。

构建使用 `npm run build`，输出到 `apps/web/dist`。数据库核对可使用 [SQL 脚本](docs/development/mysql-demo-check.sql)。

需要 Node.js 22.12+。在工程根目录执行：

```sh
npm ci --prefix apps/web
npm run dev
```

访问 http://127.0.0.1:5173 。前端默认代理到本机 `48084` 的 RFQ/Craft 接口及 `48081` 的 Office 接口；可用 `RFQ_API_TARGET`、`RFQ_CRAFT_API_TARGET`、`RFQ_BACKEND_URL` 调整，详见 [前端说明](apps/web/README.md)。

普通开发无需编译 Rust：启动与构建会校验 `packages/craft-editors/site` 中的预编译资源，并复制到前端生成目录。

## 后端开发

需要 Java 17、Maven，以及配置好的 MySQL。数据库和接口配置见 [后端说明](apps/api/README.md)，本地环境变量参考 [配置模板](apps/api/.env.example)。模板不会自动加载到进程，请通过终端或部署配置注入。

```sh
npm run dev:api
```

也可在 `apps/api` 中直接运行 `mvn spring-boot:run`。开发脚本使用 `JAVA_HOME` 和 PATH 中的 Maven，支持 `MVN_CMD`；本机存在 `.rfq-tools` 工具时可自动使用。`npm run dev:api` 使用 `48084`，直接运行 Maven 默认 `48081`，可用 `SERVER_PORT` 调整。

后端以 `apps/api` 为工作目录时，本地文件默认保存在其 `data/` 下；原有数据与历史运行包已分别保留在 `apps/api/data` 和 `apps/api/runtime`。历史包不会随源码修改自动更新。其他工作目录启动时，请明确设置绝对存储目录，避免生成另一套数据。

## 验证与构建

```sh
npm test                 # 目录检查、前端串行测试、编辑器测试
npm run build           # 前端生产构建
npm run test:api         # 后端测试，需要测试数据库
npm run build:api        # 后端 verify，需要测试数据库
```

各模块依赖分别安装；根工程没有额外 Node 依赖。浏览器诊断工具按 [浏览器测试说明](tests/browser/README.md) 单独安装和运行。

Docker 从 `apps/api` 执行 `docker compose up --build -d`，详见后端说明。

## 文档与清理

[文档索引](docs/README.md) · [目录迁移说明](docs/development/project-layout.md) · [Windows 编辑器启动](docs/development/windows-craft-startup.md)

`apps/web/dist`、`apps/web/public/craft-editors`、`apps/api/target` 可以重新生成；运行时不删除 `apps/api/data`。`node_modules` 可通过对应模块的锁文件重新安装。日志、IDE 配置、密钥和运行数据不进入 Git。
