# FEP RFQ 接口规范（CRUD 基本约定）v0.1

> 适用范围：`rfq-service` 全部 `/api/rfq/**` 业务接口
> 生效方式：新增接口评审时按本规范逐条核对；与旧代码冲突时以本规范为准逐步修正
> 更新时间：2026-11-02

---

## 1. URL 设计

### 1.1 资源命名

| 规则 | 正例 | 反例 |
|---|---|---|
| 资源用**名词复数**，全小写，连字符分隔 | `/api/rfq/projects`、`/parse-runs` | `/api/rfq/getProjectList`、`/parseRuns` |
| 子资源表达归属层级，**最多两层** | `/projects/{projectId}/documents`、`/projects/{projectId}/requirements` | `/projects/{projectId}/documents/{docId}/blocks/{blockId}/comments`（过深） |
| 动作类操作用**动词子资源**（POST） | `POST /documents/{id}/parse-runs`、`POST /projects/{id}/snapshots` | `GET /parseDocument?id=xxx` |
| 无路径动词：`create/delete/update` 禁止出现在 URL 里 | — | `/api/rfq/deleteProject` |
| 路径参数名 = 资源单数 ID | `{projectId}`、`{documentId}`、`{runId}` | `{id1}`、`{pid}` |

### 1.2 五件套标准模板

以任意资源 `X`（挂在项目下）为例，一套完整 CRUD 是这五个：

```
GET    /api/rfq/projects/{projectId}/x-list        ← 有明确归属时挂项目下
GET    /api/rfq/xs/{id}                            ← 单个详情
POST   /api/rfq/projects/{projectId}/xs            ← 创建（归属在 URL 里）
PATCH  /api/rfq/xs/{id}                            ← 部分更新（只传要改的字段）
DELETE /api/rfq/xs/{id}                            ← 删除（业务删除走软删/状态机，见 1.4）
```

实际命名用复数真名（如 `deviations`、`snapshots`、`exports`），不真的叫 `x-list`。

### 1.3 方法语义

| 方法 | 语义 | 幂等 | 本项目用法 |
|---|---|---|---|
| `GET` | 查询，**零副作用**（不写库、不写审计） | ✅ | 列表、详情、内容块 |
| `POST` | 创建资源 / 触发动作 | ❌ | 建项目、上传文件、触发解析、审批快照 |
| `PATCH` | **部分**更新（只传变更字段） | ❌ | 修正条款。**不用 PUT 做全量替换**（容易把没传的字段清空） |
| `PUT` | 仅用于「整体幂等替换」或附文件上传 | ✅ | 目前只用于 craft 批阅版保存，业务接口暂不新增 |
| `DELETE` | 删除 | ✅ | 仅限管理面；业务数据（项目/文档/条款）**一律不物理删**，用状态字段（见 1.4） |

### 1.4 删除规则（重要）

- **客户文件、条款、项目、快照：禁止物理删除**。审计链不能断。
- 要「删」时改为状态流转：文档 `status → ARCHIVED`、项目 `stage → CANCELLED`，列表接口默认不过滤归档数据时需支持 `?archived=true` 查询。
- `DELETE /api/rfq/**` 目前**一个都没有**；将来出现时必须先回答「审计怎么留」。

---

## 2. 请求规范

### 2.1 参数位置

| 数据 | 位置 | 示例 |
|---|---|---|
| 资源定位 | Path | `/requirements/{id}` |
| 过滤/分页/排序 | Query String | `?status=PARSING&page=1&size=20&sort=createdAt,desc` |
| 创建/更新的数据 | Body（JSON，UTF-8） | `{"name": "..."}` |
| 文件 | Form-Data，字段名 `file` | 见接口文档 4.2 |
| 身份 | Header `Authorization: Bearer <token>` | 全局统一，**不用** cookie/query 传 token |

### 2.2 校验规则

- 必填校验用 `@Valid + @NotBlank/@NotNull/@Pattern`（jakarta.validation），错误统一 400
- 枚举值服务端白名单校验，非法值 400 并在 `msg` 里列出合法值
- **所有校验在服务端做**，前端校验只是体验优化，不是安全边界

### 2.3 分页规范（列表接口必须遵守）

数据量可能超过 200 行的列表（条款、审计、成员），**必须分页**：

```
请求：GET /api/rfq/audit?page=1&size=20&sort=createdAt,desc&actorId=demo-sales
```

| 参数 | 默认 | 约束 |
|---|---|---|
| `page` | 1 | ≥ 1 |
| `size` | 20 | 1–100（超 100 按 100 截断，防大查询拖库） |
| `sort` | `createdAt,desc` | 只允许白名单字段 |

**响应 `data` 统一为分页信封**：

```json
{
  "list": [ ... ],
  "page": 1,
  "size": 20,
  "total": 137,
  "totalPages": 7
}
```

现有项目/条款列表暂为全量返回（演示数据量小），接入真实数据前按本条改造。

---

## 3. 响应规范

### 3.1 统一包装（不变，所有接口强制）

```json
{ "code": 0, "msg": "成功", "data": { ... } }
```

- 成功：`code=0`，HTTP 状态码 200（创建类也是 200，本项目不用 201/204，简化前端判断）
- 失败：`code` = 业务错误码（同 HTTP 状态），`msg` = **可直接展示给用户的中文**，`data=null`
- 禁止在 `data` 里再包一层 `{result: ...}` 之类的自定义信封

### 3.2 错误码（固定表，新增需先登记到此表）

| code | HTTP | 语义 | 典型 msg |
|---|---|---|---|
| 0 | 200 | 成功 | 成功 |
| 400 | 400 | 参数/业务规则不通过 | `当前仅支持 DOCX / PDF` |
| 401 | 401 | 未登录/过期/账号停用 | `登录已过期，请重新登录` |
| 403 | 403 | 无权限 | `无权访问该事业部数据` |
| 404 | 404 | 资源不存在 | `项目不存在` |
| 409 | 409 | 乐观锁冲突/状态冲突 | `条款已被他人修改，请刷新后重试` |
| 500 | 500 | 未预期异常（GlobalExceptionHandler 兜底） | `系统繁忙，请稍后重试`（不暴露堆栈） |

规则：
- `msg` 面向用户，**不出现**异常类名、SQL、堆栈字样
- 需要给开发者看的细节进**日志和审计**，不进响应体

### 3.3 字段约定

| 约定 | 规则 |
|---|---|
| 命名 | JSON 字段 camelCase（`sizeBytes`、`createdAt`） |
| 时间 | ISO-8601 UTC 字符串：`2026-11-02T09:00:00Z`。前端自己转本地时区 |
| 金额 | 分为单位整数（本业务暂无，预留） |
| ID | 业务前缀 + 8–10 位短随机串：`RFQ-a1b2c3d4`、`DOC-x1y2z3a4b5`、`REQ-...`、`RUN-...`。对外只见这个 ID，**不暴露数据库自增主键**。**生成统一走 `com.naura.rfq.common.id.Ids.next(prefix)`**（UUIDv4，多机零协调；换 ULID/雪花只改该类），禁止在业务代码里手写 `UUID.randomUUID()` 拼接 |
| 枚举 | 全大写下划线：`MANDATORY`、`PARSING`、`VALID`。新增枚举值 = 数据库迁移脚本 + 文档同步更新 |
| 布尔 | `is` 前缀禁用（JSON 序列化坑），直接 `systemAdmin`、`archived` |
| 版本 | 可被修改的聚合根（project、requirement、document）必须带 `version` 字段返回 |

---

## 4. 并发与一致性

### 4.1 乐观锁（写接口强制）

1. 实体带 `version` 字段（`@Version` 或手动比对）
2. `PATCH` 请求体带 `version` 时校验：不一致 → `409`，msg 提示「已被他人修改，请刷新后重试」
3. 不带 `version` 的更新允许（「最后写入胜出」），但**多人高频编辑的资源（条款、批阅）必须带**

### 4.2 状态机操作

有状态流转的资源（文档、项目、审批）的状态变更**一律用动作接口**，不用 PATCH 改状态字段：

```
✅ POST /documents/{id}/parse-runs        （触发解析，状态由服务端推演）
❌ PATCH /documents/{id}  {"status":"PARSING"}   （前端直接改状态 = 越权）
```

非法状态迁移返回 409：`当前状态不允许该操作`。

---

## 5. 安全规范（每个写接口必查清单）

新增写接口上线前逐条打勾：

- [ ] **认证**：接口在 `/api/rfq/**` 下，默认被 JWT 拦截器覆盖；放行清单（`/login`）不随意扩大
- [ ] **BU 隔离**：先 `requireProject/requireBu` 校验归属，再做业务。跨 BU 一律 403
- [ ] **角色**：写操作用 `AccessGuard.requireSourceManager` 或新增的对应方法，不允许在 Controller 里手写角色判断散落各处
- [ ] **审计**：所有写操作（POST/PATCH/DELETE/动作接口）成功后调 `audit.success(actor, 动作, 对象类型, 对象ID, 摘要)`；查询不写审计
- [ ] **越权读**：按 ID 查资源时必须先验证当前用户对该资源（或其所属项目/BU）的访问权，**不能只凭 ID 能查到就返回**（IDOR 防护）
- [ ] **输入上限**：文本字段限长、列表限分页、解析限块数（`rfq.parse.max-blocks` 模式），防单请求拖垮服务

---

## 6. 代码骨架约定

新增一个资源的 Controller 按此骨架写（以偏离项为例）：

```java
@RestController
@RequestMapping("/api/rfq")
@RequiredArgsConstructor
public class DeviationController {

    private final DeviationRepository deviations;
    private final ProjectRepository projects;
    private final AccessGuard access;
    private final AuditService audit;

    // —— View / Request 用 record 内聚在 Controller 里（现状约定，不另建 dto 包）——
    public record DeviationView(String id, String projectId, String clause, String type,
            String note, String status, Long version) {
        public static DeviationView of(Deviation d) { ... }
    }

    public record CreateDeviationRequest(@NotBlank String clause, @NotBlank String type, String note) { }

    @GetMapping("/projects/{projectId}/deviations")
    public ApiResponse<List<DeviationView>> list(@PathVariable String projectId) {
        Project project = projects.findById(projectId)
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(CurrentUserHolder.require(), project);      // ① 归属校验
        return ApiResponse.success(deviations.findByProjectIdOrderByCreatedAtDesc(projectId)
                .stream().map(DeviationView::of).toList());               // ② 查询零副作用
    }

    @PostMapping("/projects/{projectId}/deviations")
    public ApiResponse<DeviationView> create(@PathVariable String projectId,
            @Valid @RequestBody CreateDeviationRequest request) {
        CurrentUser user = CurrentUserHolder.require();
        Project project = projects.findById(projectId)
                .orElseThrow(() -> new BusinessException(404, "项目不存在"));
        access.requireProject(user, project);                             // ① 归属
        access.requireSourceManager(user, project.getBuId());             // ② 角色
        // ... 建实体、保存
        audit.success(user.id(), "登记偏离项", "deviation", id, request.clause()); // ③ 审计
        return ApiResponse.success(DeviationView.of(saved));
    }
}
```

**顺序铁律：认证（拦截器）→ 归属（requireProject）→ 角色（requireSourceManager/…）→ 业务 → 审计 → 返回。**

---

## 7. 文档同步

每个新接口合并前，`docs/RFQ后端接口文档_v0.1.md` 必须同步更新：方法 + 路径 + 参数表 + 响应示例 + 错误码。文档和代码不一致时，**以先修复不一致为最高优先级**，不允许「先上线后补文档」。
