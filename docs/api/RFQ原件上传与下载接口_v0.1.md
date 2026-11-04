# RFQ 原件上传、版本与下载接口 v0.1

对应 B10，基于 B09 项目维护与统一权限。延续 `/api/rfq`、Bearer JWT、`{code,msg,data}` 和 PageView。文件流不包装 JSON；失败使用统一错误响应。

## 上传

POST `/projects/{projectId}/documents`，multipart 字段 file。SR 或对应 BU 管理员必须有项目访问权，项目必须未归档。文件最多 **30 MiB（31,457,280 字节）**；声明大小和实际读取长度都检查。真实 DOCX/PDF 内容不符、空文件、零页或加密 PDF 返回 400；超限返回 413。上传后不会自动开始解析。

客户端目录和控制字符从文件名移除，名称上限 255。支持中文、空格和大写扩展名；不能伪造扩展名绕过真实内容校验。服务端按验证格式设置规范 MIME，不信任 multipart Content-Type：

| 格式 | contentType |
| --- | --- |
| DOCX | application/vnd.openxmlformats-officedocument.wordprocessingml.document |
| PDF | application/pdf |

返回示例：

```json
{"code":0,"msg":"成功","data":{"id":"DOC-...","projectId":"RFQ-...","name":"客户需求.pdf","version":2,"purpose":"REQUIREMENT_SOURCE","sizeBytes":10240,"sha256":"64位SHA-256十六进制","status":"UPLOADED","uploadedBy":"USR-...","createdAt":"2026-11-04T00:00:00Z","contentType":"application/pdf"}}
```

POST `/projects/{projectId}/documents/sample` 保持示例原件入口，执行相同权限、归档保护、版本分配与事务回滚规则。

## 版本与原件不可变

版本为**项目内上传序号**，从 1 递增，服务端项目锁和当前数据库读取共同分配。客户端不指定编号；同名或相同内容重新上传仍创建独立文档 ID 和新编号，旧文件及其 SHA 保留，不推测文件名版本链。

数据库唯一约束 `(project_id,version)` 防止重复版本；旧快照不能重复分配已提交编号。达到有符号 int 上限时返回 409，不写文件、不溢出。上传失败或事务回滚清理暂存/原件、回滚文档记录、项目阶段/版本及成功审计，失败不消耗版本。

解析仅更新文档状态，不得覆盖名称、版本、用途、存储位置、类型、大小、哈希或上传者。没有修改/覆盖原件的 API，批阅仍使用独立副本。

## 列表与详情

| 方法与路径 | 参数 | 返回 |
| --- | --- | --- |
| GET `/projects/{projectId}/documents` | page、size、sort；sort 白名单 createdAt/version，默认 createdAt,desc | PageView<DocumentView> |
| GET `/documents/{documentId}` | 无 | DocumentView |

详情和列表与上传响应使用同一 DocumentView，不返回内部 storageRef。按版本倒序示例：`?page=1&size=20&sort=version,desc`。文档版本可通过自身 ID 独立查看和下载。

## 下载与完整性

GET `/documents/{documentId}/download`；同样支持 HEAD 与 Range。先校验项目读取权，再以有界流读取核对登记大小和 SHA-256，之后沿用 FileSystemResource 流式响应，不整包装入内存。

- Content-Type 为规范 DOCX/PDF MIME。
- Content-Disposition 为 attachment，UTF-8 文件名。
- Content-Length 为登记原件大小；Range 返回相应部分长度和 206。
- Cache-Control: no-store；X-Content-Type-Options: nosniff。
- ETag 为双引号包围的小写 SHA-256。

未知文档或缺失原件 404；登记完整性信息缺失、大小或哈希不符 409，要求管理员核对。校验发生在响应开始前，存储目录由本服务管理；本轮不新增临时副本协议。GET/HEAD 不写审计或补写历史校验信息。

归档项目历史原件仍按项目授权可读；撤销授权后旧 JWT 下一次读取立即拒绝。技术人员未授权不能读取，纯平台管理身份不自动取得正文访问权；跨 BU 403，未登录 401。

## 错误与迁移

413 同时覆盖存储真实流限制和真实 Servlet multipart 限制，返回中文提示，避免 MockMvc 验证与实际服务器表现不一致。400 为非法文件、文件名或排序；409 为归档写保护、版本冲突/上限、完整性异常。错误不返回服务器路径、SQL 或堆栈。

新增 `V5__document_version.sql` 唯一索引，V1–V4 不修改。上线前可只读检查历史重复：

```sql
select project_id,version,count(*)
from customer_document
group by project_id,version
having count(*)>1;
```

如有重复，先核对历史来源后处理；迁移不会自动重编号。历史缺少哈希/大小的原件需核对登记后才能通过完整性下载，GET 不静默补齐。

后续 B11 处理解析任务供应商联调，B12 处理条款/来源映射，B23 处理 craft/office 项目鉴权；它们不包含在本轮原件版本语义中。
