# RFQ 独立后端框架

## ONLYOFFICE 原件批阅（2026-10-30）

现已提供真实 DOCX / PDF 上传、批阅副本、签名编辑器会话、保存回调和下载接口。原始文件保留不变，后续编辑只写入批阅副本。文件及元数据保存在 Docker 命名卷，重启后继续可用。

在 `rfq-service` 目录准备 `.env`：

```bash
cp .env.example .env
# 用 openssl rand -hex 32 生成随机密钥，填入 .env 的 ONLYOFFICE_JWT_SECRET。
docker compose -p rfq-office --profile office up --build -d
```

本机入口：RFQ 后端 `http://127.0.0.1:48081`，ONLYOFFICE `http://127.0.0.1:8082`。首次启动文档服务需稍等，`/healthcheck` 返回 `true` 后即可使用。当前机器已配置并启动，不需要再次覆盖 `.env`。不加 `--profile office` 仍可单独启动后端框架。

| 配置 | 默认值 / 含义 |
| --- | --- |
| `ONLYOFFICE_JWT_SECRET` | 至少 32 字符；后端和文档服务必须一致，勿提交到 Git |
| `ONLYOFFICE_PUBLIC_URL` | `http://127.0.0.1:8082`，浏览器加载编辑器脚本的地址 |
| `ONLYOFFICE_INTERNAL_URL` | `http://onlyoffice`，后端在 Docker 网络中访问文档服务的地址 |
| `ONLYOFFICE_CALLBACK_BASE_URL` | Compose 固定 `http://rfq-service:48081`；本机 Java 启动时需改成文档容器能访问的后端地址 |
| `ONLYOFFICE_STORAGE_DIR` | Compose 使用 `/app/data/onlyoffice`；本机 Java 默认为 `data/onlyoffice` |

Vite 已为 `/api/office` 配置同源代理。修改后端端口时，可在启动前端时设置 `RFQ_BACKEND_URL`。浏览器地址、容器内地址与回调地址分别配置，不能把容器中的 `localhost` 当作宿主机。

接口前缀 `/api/office`：

- `GET /status`：配置状态与上传上限。
- `POST /documents`：multipart 文件及项目、文件、来源版本引用，返回随机文档引用和访问凭据。
- `GET /documents/{id}`：持久化版本、保存时间、保存错误状态。
- `POST /documents/{id}/session`：返回签名后的官方 Docs API 配置。
- `POST /documents/{id}/save`：请求文档服务强制保存，仍须等待回调确认落盘。
- `GET /documents/{id}/download?kind=original|review`：原件或最新已保存批阅版。
- `GET /content/{id}?ticket=...`：供文档服务读取的有时限签名地址。
- `POST /callback/{id}`：JWT 验签后的保存回调，返回 ONLYOFFICE 原生 `{error:0|1}`。

除签名内容地址和保存回调外，文档接口使用 `X-Office-Access` 访问凭据。只处理 DOCX / PDF，单文件上限 30 MiB；旧 DOC 请先转换。强制保存保留当前协作 key；最终保存后换用新 key。成功回调的凭据摘要持久化，非连续重复回调也不会回滚已保存版本。

这是本机集成：前端演示身份决定编辑/只读配置，但尚未接入企业认证和后端项目成员权限。保留默认回环端口；正式部署需接入业务认证与授权。原文件批阅下载与正式对外应答导出是两套操作，批阅不会自动更新条款、确认状态或最终评审。

下方为原框架的运行说明；数据库、企业身份和 AI 业务仍未接入。

`rfq-service` 是可独立构建、运行和部署的 Spring Boot 后端项目，位于当前工作区的 `rfq-service/` 目录，与现有 Naura 应用分别维护和启动。

当前使用 Java 17、Spring Boot 3.5.9 和 Maven，版本为 `0.0.1-SNAPSHOT`。应用启动不需要数据库、Redis 或其他外部服务。

## 当前范围

- Spring MVC Web、Bean Validation、Actuator。
- 通用返回结构 `{code, msg, data}`，成功码为 `0`，以及业务异常与全局异常处理基础能力。
- `local`、`prod` 两套运行 profile，默认应用端口 `48081`。
- 仅暴露 `/actuator/health` 和 `/actuator/info` 两个管理端点；健康详情及组件信息隐藏，Actuator 保留标准返回结构。

当前新增上述文档集成 API；仍没有数据库或 Redis 依赖、企业认证实现、AI 或模型服务接入。`/` 没有业务页面或接口，验证启动状态请访问健康端点。

## 项目结构

```text
rfq-service/
├── pom.xml
├── Dockerfile
├── compose.yaml
├── .env.example
├── .dockerignore
├── .gitignore
├── README.md
└── src/
    ├── main/
    │   ├── java/com/naura/rfq/
    │   │   ├── RfqServiceApplication.java
    │   │   └── common/
    │   │       ├── api/ApiResponse.java
    │   │       └── exception/
    │   │           ├── BusinessException.java
    │   │           └── GlobalExceptionHandler.java
    │   └── resources/
    │       ├── application.yml
    │       ├── application-local.yml
    │       └── application-prod.yml
    └── test/java/com/naura/rfq/
        ├── FrameworkSmokeTest.java
        └── ErrorHandlingTest.java
```

## 本机运行

需要 JDK 17 或更新版本，以及 Maven 3.9 或更新版本。先进入项目目录：

```bash
cd rfq-service
java -version
mvn -version
```

默认使用 `local` profile：

```bash
mvn -B -ntp spring-boot:run
```

也可以先构建再运行 JAR：

```bash
mvn -B -ntp verify
java -jar target/rfq-service.jar
```

切换到 `prod` 并修改监听端口：

```bash
SPRING_PROFILES_ACTIVE=prod SERVER_PORT=48082 java -jar target/rfq-service.jar
```

`SERVER_PORT` 控制应用监听端口，`SPRING_PROFILES_ACTIVE` 选择 profile；未设置时分别为 `48081` 和 `local`。Maven 与 `java -jar` 不会自动读取 Compose 使用的 `.env` 文件，需要在终端显式设置环境变量。

## Docker 部署

需要 Docker Engine 或 Docker Desktop，以及 Docker Compose v2。构建需要启用 BuildKit（Docker Desktop 默认启用），以复用 Maven 依赖缓存。当前工作环境没有预装 Java/Maven，可使用多阶段 Docker 构建完成编译、测试和运行；首次构建需要下载基础镜像和 Maven 依赖。

在项目目录执行：

```bash
cp .env.example .env
docker compose up --build -d
docker compose logs --tail=100 -f rfq-service
```

按 `Ctrl+C` 退出日志跟踪后，后台服务继续运行。检查健康状态：

```bash
curl --fail --silent --show-error http://127.0.0.1:48081/actuator/health
curl --fail --silent --show-error http://127.0.0.1:48081/actuator/info
```

服务正常时，健康端点返回 `{"status":"UP"}`。应用信息端点返回应用名称等基础信息。启动后如果尚未监听端口，稍候再执行健康检查。

停止并移除本项目容器：

```bash
docker compose down
```

Compose 的配置变量如下：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `RFQ_HOST_PORT` | `48081` | 宿主机端口；修改后健康检查 URL 也应使用对应端口 |
| `SPRING_PROFILES_ACTIVE` | `prod` | 容器中启用的 Spring profile，可设为 `local` 或 `prod` |
| `JAVA_TOOL_OPTIONS` | 空 | 可选 JVM 参数，如 `-XX:MaxRAMPercentage=75.0` |

Compose 固定容器内部 `SERVER_PORT=48081`，并将端口映射到宿主机 `127.0.0.1:${RFQ_HOST_PORT:-48081}`。修改宿主机端口只需更改 `.env` 中的 `RFQ_HOST_PORT`，然后重新运行 `docker compose up --build -d`。

当前尚未实现认证，因此默认仅允许宿主机本地访问。如需对外提供服务，应通过反向代理控制入口，并在代理或后续认证模块中配置访问控制与 TLS。

Dockerfile 的构建阶段使用 Maven 3.9.9 和 JDK 17 执行 `mvn -B -ntp verify`，包含测试；运行阶段只保留 JRE 17 和应用 JAR，以非 root 用户 `10001:10001` 启动。构建产物固定为 `target/rfq-service.jar`，镜像内路径为 `/app/app.jar`。

也可单独构建镜像并启动容器：

```bash
docker build -t rfq-service:local .
docker run --rm --name rfq-service -p 127.0.0.1:48081:48081 -e SPRING_PROFILES_ACTIVE=prod rfq-service:local
```

## 测试与验证

安装本机 JDK/Maven 后，可单独运行测试，或执行包括打包在内的完整验证：

```bash
mvn -B -ntp test
mvn -B -ntp verify
```

Docker 构建也会执行完整 Maven 验证；测试失败会使镜像构建失败。启动后使用前述 `curl` 命令检查健康及应用信息。本机启动若使用了自定义 `SERVER_PORT`，请同步调整 URL。

2026-10-24 已完成验证：Java 17 容器内 `mvn verify` 的 11 项测试全部通过，多阶段镜像构建成功；以 `prod` profile、非 root 用户启动后，健康接口返回 `{"status":"UP"}`，应用信息接口正常，环境管理端点与测试专用路由均返回 404。临时验证容器已停止，后续可按上述命令启动。

## 独立部署与后续扩展

本目录有独立的 `pom.xml`、构建产物、应用配置和 Compose 文件，可整体复制到部署主机后单独构建运行。所有命令均在 `rfq-service/` 内执行，不需要启动现有 Naura 应用，也不需要共享其数据库、环境变量或端口。容器日志输出到标准输出，可通过 `docker compose logs` 查看。

后续 RFQ 业务代码可在 `com.naura.rfq` 下按业务模块新增。通用返回与异常逻辑集中在 `common` 包。需要认证时，再增加安全依赖与认证配置；需要数据库时，再增加数据访问依赖、连接配置及迁移脚本，并按环境提供凭据。环境差异分别放入 `application-local.yml`、`application-prod.yml`，敏感值通过环境变量注入。上述能力当前均未接入。
