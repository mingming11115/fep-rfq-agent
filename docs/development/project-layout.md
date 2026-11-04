# 工程目录迁移

2026-11-04 将原型开发目录统一组织为前后端工程。业务功能不在本次调整范围。

| 原位置 | 新位置 |
| --- | --- |
| `rfq-react-prototype` | `apps/web` |
| `rfq-service` | `apps/api` |
| `demos/craft-review` | `packages/craft-editors` |
| `.workbuddy/browser-test` | `tests/browser` |
| 根目录 PRD、交互设计 | `docs/product` |
| 接口文档 | `docs/api` |
| 启动与接入文档 | `docs/development` |
| 阶段验证与旧汇报 | `docs/archive` |
| `output`、`outputs` | `docs/archive/artifacts` |
| IDE 配置、运行日志、诊断截图 | `.local` |

原有 `data` 和 `runtime` 随后端移动，迁移前后核验 38 个文件的 SHA-256 一致。`data` 包含用户业务文件，不能按构建产物清理。生产部署如配置了绝对存储位置或 Docker 卷，继续使用原位置。

前端构建和 Vite 文件访问范围已指向新的编辑器目录。编辑器预编译资源及对应许可证保留在 Git 中，前端 `public/craft-editors` 是自动生成副本。

前端 `dist`、生成的编辑器副本、后端 `target` 已清理；验证时可重新生成。依赖目录保留，避免不必要的重新安装。

本机 `.local/layout-map.json` 记录迁移映射，`.local/runtime-manifest.json` 用于迁移完整性核对，均不进入 Git。历史资料已归档，其中旧日期、旧机器路径和历史判断仅用于追溯。

后端源码默认使用工作目录下的 `data/rfq-files`；根开发脚本固定以 `apps/api` 为工作目录。通过历史运行包从根目录启动时，须明确传入新存储路径，见 Windows 启动说明。

空的历史 Gitlink 占位 `naura-ai`、`naura-ai-ui` 已移除，当前工程没有引用。原记录分别为 `9a36a3da102722346dca0c311a489dcd7ec0beda`、`0baf0e4121993f89c9b43aaff262d0553e4eb7ce`；原仓库对象不做删除。临时 Office 锁文件和 macOS 目录缓存不继续纳入版本控制。

验证：根目录 `npm test` 通过（前端 505 项、编辑器 25 项）；`npm run build` 通过。后端 Java 17 编译、16 项不连接数据库的单元测试及 Maven package 通过，数据库集成测试未在此次目录整理中运行。恢复的 5173 前端、编辑器跨目录资源及 48083 后端健康接口均返回 HTTP 200。

开发工具校验补充：带空格的 Maven 路径真实启动测试 1/1 通过，已接入根测试入口。
