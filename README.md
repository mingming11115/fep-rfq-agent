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

需要 Node.js 22.12+。在工程根目录执行：

```sh
npm ci --prefix apps/web
npm run dev
```

访问 http://127.0.0.1:5173 。前端默认代理到本机 `48083` 的 RFQ/Craft 接口及 `48081` 的 Office 接口；可用 `RFQ_API_TARGET`、`RFQ_CRAFT_API_TARGET`、`RFQ_BACKEND_URL` 调整，详见 [前端说明](apps/web/README.md)。

普通开发无需编译 Rust：启动与构建会校验 `packages/craft-editors/site` 中的预编译资源，并复制到前端生成目录。

## 后端开发

需要 Java 17、Maven，以及配置好的 MySQL。数据库和接口配置见 [后端说明](apps/api/README.md)，本地环境变量参考 [配置模板](apps/api/.env.example)。模板不会自动加载到进程，请通过终端或部署配置注入。

```sh
npm run dev:api
```

也可在 `apps/api` 中直接运行 `mvn spring-boot:run`。开发脚本使用 `JAVA_HOME` 和 PATH 中的 Maven，支持 `MVN_CMD`；本机存在 `.rfq-tools` 工具时可自动使用。后端默认端口为 `48081`，需要同时接入当前前端时，将 `SERVER_PORT=48083`，或调整前端代理。

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
