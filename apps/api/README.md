# RFQ 后端

## MVC 包结构

源码根包为 `com.naura.rfq`，按职责分层，业务调用方向为 `controller → service → mapper → model.entity`。

```text
com.naura.rfq
├── controller          # HTTP 路由、参数校验、响应组装
├── service             # 业务流程、事务、审计与权限协作
├── mapper              # MyBatis 数据访问接口
├── model
│   ├── entity          # 数据库实体
│   ├── dto             # 跨层请求与数据传输对象
│   ├── vo              # 共享接口响应模型
│   ├── query           # 分页及查询条件
│   └── parse           # 文档读取、抽取中间模型
├── config              # Spring 配置及 properties 配置绑定
├── security            # 鉴权、访问控制与当前用户上下文
├── storage             # 原件及 Office 文件存储
├── integration         # DOCX/PDF、OCR、模型和历史条款抽取适配
├── support             # 示例文件等辅助能力
└── common              # 统一响应、异常、ID 等公共能力
```

前后端分离，View 以 JSON 响应模型表达。Controller 不访问 Mapper、不声明业务事务；事务与文件回滚清理在 Service 中执行。MyBatis XML 保留在 `src/main/resources/mapper`，实体别名指向 `com.naura.rfq.model.entity`。仅由单个 Controller 使用的请求、响应类型可作为其内部类型，共享类型放在 `model`；Service 与 Model 不依赖 Controller。

运行 `mvn verify` 验证全部后端测试；`mvn -Dtest=ArchitectureTest test` 可独立检查分层约束。测试默认需要 MySQL，配置项见下文。

## 原件上传与下载（B10）

接口和版本语义见 [原件上传与下载](../../docs/api/RFQ原件上传与下载接口_v0.1.md)。新增文档详情、规范 MIME 和 255 字符文件名限制；上传版本由项目锁下的当前读取分配，并由 V5 唯一索引保护。旧原件不覆盖，解析仅更新状态。

下载开始前核对登记大小/SHA-256；保持流式响应、Range/HEAD、UTF-8 附件名和 SHA ETag。缺失原件 404，完整性异常 409。真实 HTTP multipart 超限与存储流超限均返回统一 413。V5 不自动修复历史重复编号，部署前按接口说明检查历史记录。

## 项目维护（B09，2026-11-03）

支持项目基本信息部分更新、截止日期、负责人移交、归档及恢复，见 [项目维护接口](../../docs/api/RFQ项目维护接口_v0.1.md)。写操作须携带当前 version 和原因；接收负责人须为已获项目授权的有效 SR。

项目列表默认查询活动项目，archived=true 查询归档项目，支持编码/名称/客户搜索和阶段筛选。归档后业务原件/条款/解析入口暂停写入，历史读取与授权撤销仍按项目权限开放。归档与业务修改按“项目 → 文档”顺序加锁，锁竞争返回 409 提示重试。

## 基础管理与验收（2026-11-03）

完整功能目录见 [后端开发验收清单](../../docs/development/RFQ后端开发验收清单_2026-11-03.md)，首批为 BU、人员、项目权限与审计；请求和响应见 [基础管理接口](../../docs/api/RFQ基础管理接口_v0.1.md)。

加入 BU 不自动取得全部项目权限。普通业务人员须有有效成员身份及负责人/项目授权；BU 管理员访问本 BU，平台身份只管理元数据，不自动访问业务文件。项目授权维护要求原因和项目 version；撤权后原 JWT 按最新权限拒绝访问。成员暂停与角色撤销分开保存，恢复成员不会恢复已撤销角色。

`GET /api/rfq/audit` 提供带 BU 隔离的分页和过滤；成功管理操作与审计同事务。跨 BU 共享账号的全局资料、密码和全局状态由平台或覆盖全部相关 BU 的管理员维护。现有成员候选数组协议保留，前端业务仍须后续逐模块接入真实接口。

Java 17 / Spring Boot / MyBatis / MySQL，包含业务鉴权、客户文档上传、DOCX/PDF 读取、规则/模型条款抽取和 OCR。业务接口前缀 `/api/rfq`，返回 `{code,msg,data}`；需要 `Authorization: Bearer <token>`。

## 上传与解析（2026-11-03）

流程：上传并验证真实文件 → 保存不可变原件及 SHA-256 → 触发解析 → 原生读取文字/表格 → OCR 图片 → 模型或规则抽取 → 校验来源 → 入库。

- DOCX：读取正文、表格、嵌套表格及段落/表格内嵌图片。Word 使用结构锚点，不伪造页码。页眉、页脚、浮动文本框、自动编号标签不在当前读取范围。
- PDF：读取原生文本；无文字页渲染成图片后 OCR；有文字页中的图片对象单独 OCR，包括 Form 内图片。支持内联图片；不支持矢量路径绘制的混合页图中文字识别。
- 原件单文件最多 30 MiB，校验真实 DOCX/PDF 内容；拒绝加密或空 PDF、伪造扩展名和损坏文件。上传失败清理暂存文件，事务回滚清理原件。
- 上传与解析是两个动作，上传完成不会自动解析。解析当前同步执行，请给调用方设置足够超时。
- 同文档解析与人工条款修改使用数据库锁串行；重解析失败保留已有条款；已人工修改的条款不允许被重解析覆盖，返回 `409`，请上传新文档版本。
- 同一项目上传时分配递增文档版本。重解析会替换未人工修改的条款并分配新 ID；历史运行记录保留统计信息，不保留独立的旧条款快照。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/login` | `{username,password}`，获取 token |
| POST | `/projects/{id}/documents` | multipart 字段 `file`，上传 DOCX/PDF |
| POST | `/projects/{id}/documents/sample` | 生成示例 RFQ，便于验证 |
| GET | `/projects/{id}/documents?page=1&size=20` | 文档列表 |
| GET | `/documents/{id}` | 文档元数据详情，不返回内部存储位置 |
| GET | `/documents/{id}/download` | 下载不可变原件，遵循项目读取权限 |
| POST | `/documents/{id}/parse-runs` | 创建并同步完成解析 |
| GET | `/parse-runs/{id}` | 运行状态、实际 extractor、异常数量及说明 |
| GET | `/documents/{id}/blocks` | 原文内容块、sourceAnchor、provenance、processingStatus |
| GET | `/projects/{id}/requirements?page=1&size=20` | 解析条款及待人工核对原因 |
| PATCH | `/requirements/{id}` | 人工修正条款，携带 version 乐观锁版本 |

上传、触发解析和修改条款要求 SR / BU_ADMIN，并校验项目归属；读取遵循既有项目访问权限。完整基础接口见 [接口文档](../../docs/api/RFQ后端接口文档_v0.2.md)。

解析状态使用小写 `completed` / `partial` / `failed`。有未识别图片、OCR 文字、模型待核对条款或服务降级时为 `partial`，不表示所有内容已完整提取。`issueCount` 包含待核对条款和处理告警数；`message` 提供摘要，图片等细节通过内容块查询。`provenance=ocr` 区分识别文字与原生文字。条款 `originalText` 保存摘录，`requirementText` 保存抽取后的要求。

## 模型与 OCR 配置

两者默认关闭、独立开关、独立配置。模型关闭时使用现有规则抽取；模型已开启但连接失败、超时、HTTP 错误、JSON 错误、输出未完整结束、引用不存在、原文引用不匹配或内容块遗漏时，退回规则并记录降级。一次运行首次模型失败后，剩余批次直接使用规则，避免重复等待；已经成功的批次保留。

OCR 关闭或失败时保留图片占位和待核对标识，可读正文继续解析；不会生成虚构图片文字。纯扫描件没有可读内容时返回 `partial` 和明确人工核对提示。OCR 识别成功的文字同样需要人工核对数值及单位。模型输出均标记人工核对；程序校验来源摘录不能替代语义审核。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| RFQ_LLM_ENABLED | false | 模型开关 |
| RFQ_LLM_URL | 空 | **完整** Chat Completions URL，例如内网 `http://model-gateway:8000/v1/chat/completions` |
| RFQ_LLM_MODEL | 空 | 模型名称，由实际网关提供 |
| RFQ_LLM_API_KEY | 空 | 可选 Bearer 密钥，支持无密钥内网服务 |
| RFQ_LLM_CONNECT_TIMEOUT / RFQ_LLM_TIMEOUT | 3s / 30s | 连接及整次请求超时 |
| RFQ_LLM_BATCH_CHARS / RFQ_LLM_BATCH_BLOCKS | 16000 / 20 | 每批最多原文字符/块数；超大单块退回规则 |
| RFQ_OCR_ENABLED | false | OCR 开关 |
| RFQ_OCR_URL / RFQ_OCR_API_KEY | 空 | 完整 OCR 地址、可选 Bearer 密钥 |
| RFQ_OCR_CONNECT_TIMEOUT / RFQ_OCR_TIMEOUT | 3s / 30s | OCR 连接及整次请求超时 |
| RFQ_OCR_MAX_IMAGES | 100 | 每份文档图片/扫描页的识别数量上限，超限保留待核对标记 |
| RFQ_OCR_MAX_IMAGE_PIXELS | 20000000 | PDF 扫描页渲染/图片的像素上限 |
| RFQ_OCR_MAX_IMAGE_BYTES | 10485760 | 单张识别图片字节上限 |
| RFQ_PARSE_MAX_BLOCKS | 5000 | 最多处理内容块数；超出时提示内容未完全处理 |

模型接口使用非流式 `model` 和 `messages` 请求，[协议参考](https://developers.openai.com/api/reference/resources/chat)。服务端发送固定系统指令及内容块 JSON；网关返回 `choices[0].message.content` 中的 JSON 字符串，且 `finish_reason=stop`。不依赖特定模型 SDK 或强制 JSON 模式。

模型返回内容示例（blockIndex 为输入内容块编号）：

```json
{
  "requirements": [{
    "blockIndex": 0,
    "originalText": "1.1 设计压力应不低于 2 MPa。",
    "requirementText": "设计压力应不低于 2 MPa。",
    "title": "设计压力",
    "customerClauseNo": "1.1",
    "level": 2,
    "parentClauseNo": "1",
    "obligation": "mandatory"
  }],
  "ignoredBlockIndexes": []
}
```

每个输入块必须被要求引用或明确列入 `ignoredBlockIndexes`，原文摘录必须是对应块的连续原文，且未忽略块的全部原文需被摘录覆盖，遗漏块内后文同样触发降级。模型不能忽略规则已识别出的候选条款。当前模型模式不直接接受模型给出的指标 JSON，避免未经验证的结构化数值入库；规则模式仍提供指标提取。

OCR 使用本项目定义的轻量 HTTP JSON 协议，可通过适配服务对接 PaddleOCR、云 OCR 或现有内网 OCR；不是上述服务的原生协议。请求格式：

```json
{"imageBase64":"不带data:前缀的图片Base64","mimeType":"image/png","anchor":"page-1"}
```

成功返回 HTTP 2xx 和 `{"text":"识别出的完整文字"}`。空白结果、错误响应或非法 JSON 都按无法识别处理。PDF 扫描页上传 PNG；DOCX 图片保留原始媒体类型。HTTP 响应最多 2 MiB；不跟随重定向，日志与用户提示不包含远端响应正文和密钥。

没有填写真实服务地址和凭据时，可完整使用上传与原生文字/规则解析。当前通过本地 HTTP 假服务验证成功、错误、超时和降级，尚未与指定供应商实网联调。

## 本机运行与验证

需要 JDK 17+、Maven 3.9+、MySQL 8。配置 `RFQ_DB_URL`、`RFQ_DB_USER`、`RFQ_DB_PASSWORD` 和 `RFQ_JWT_SECRET`；默认端口 48081。Flyway 用 `B10__rfq_schema.sql` 自动建表。新电脑启动及旧演示库重建步骤见 [启动指南](../../启动.md)。

```bash
cd apps/api
mvn -B -ntp verify
java -jar target/rfq-service.jar
```

测试会使用配置的数据库，新功能集成测试会写入测试文档；请使用独立测试库运行 `verify`。成功的验证产物为 `target/rfq-service.jar`。仓库内 `runtime/rfq-service.jar` 为历史分发包，源码修改不会自动更新该包。

`java -jar` 不会自动载入 `.env`。可在终端导出变量，或使用 Spring 配置文件。Compose 自动读取当前目录 `.env`：

```bash
cp .env.example .env
# 填写数据库、JWT 和所需模型/OCR 变量；已有 .env 请直接补充，勿覆盖。
docker compose up --build -d rfq-service
```

Compose 将原件和批阅稿保存在 `/app/data` 的命名卷内。数据库由外部提供，`RFQ_DB_URL` 必须能从容器访问；macOS 本机数据库可用 `host.docker.internal`。健康检查 `GET /actuator/health`，仅开放 health / info 管理端点。

## 原生 Word/PDF 批阅与 ONLYOFFICE

历史批阅接口保留：`/api/craft` 提供原件/批阅稿存储和修订并发控制，`/api/office` 提供 ONLYOFFICE 签名会话和回调。它们与 `/api/rfq` 业务文档是独立的文件记录，不会自动触发解析或同步条款。批阅接口仍沿用各自访问凭据，未接入 `/api/rfq` 的项目业务权限。

ONLYOFFICE 使用 `.env.example` 中的 `ONLYOFFICE_*` 配置和 `docker compose --profile office up --build -d`。操作细节见 [项目批阅接入](../../docs/development/craft-project-review.md) 与 [Windows 原生编辑器启动](../../docs/development/windows-craft-startup.md)。不要将批阅稿保存等同于正式应答导出。

## 历史知识文件解析

`POST /api/rfq/history/parse` 接收 multipart `file`、可选 `responseFile`、必填 `buId`。请求使用现有 JWT，服务端校验所属 BU，支持该 BU 的维护角色。文件支持真实 DOCX/PDF、每个不超过 30 MiB，复用原件内容校验及 OCR 读取器；临时文件在读取结束后清理。

响应包含 `metadata`、`clauses`、`sources`、`issues`。条款的 `answer` 合并原文件的答复与结论列，不生成结论字段。配套答复只按唯一编号关联；重复或未关联内容通过来源与异常返回。PDF 历史入口保留逐行唯一锚点，项目 RFQ 的原读取行为保持不变。该接口只做解析，知识草稿／审核仍由当前前端原型保存，不意味着已提供服务器知识库。
# RFQ 原件存储切换

默认 `RFQ_STORAGE_TYPE=local`，原件存储在 `RFQ_STORAGE_DIR`（默认 `./data/rfq-files`）。使用 MinIO 时设置以下环境变量后重启后端：

```dotenv
RFQ_STORAGE_TYPE=minio
RFQ_MINIO_ENDPOINT=http://localhost:9000
RFQ_MINIO_BUCKET=rfq-files
RFQ_MINIO_ACCESS_KEY=your-access-key
RFQ_MINIO_SECRET_KEY=your-secret-key
```

需预先创建私有 bucket，账号具备对应对象的读、写、删除权限。密钥通过部署环境注入，不提交到仓库。使用 MinIO Java SDK：[官方接口说明](https://docs.min.io/aistor/developers/sdk/java/api/)。

开关只决定新 RFQ 原件的写入位置。旧本地路径保持不变，MinIO 原件记录 `minio:bucket/key`，下载、解析、回滚清理按记录路由；切回 local 后仍需保留 MinIO 连接配置以读取旧 MinIO 文件。没有自动迁移，也不会在 MinIO 出错时静默回退到本地。切换 bucket 后旧文件仍读取记录中的 bucket；更换 endpoint 时需确保旧对象在新 endpoint 可用。

MinIO 上传先在本地验证格式及大小，读取时通过临时文件验证 SHA-256 和大小，解析结束即清理。后端仍需本地临时磁盘空间。本开关不涉及独立的 OnlyOffice 存储。
