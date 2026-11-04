# RFQ 基础管理接口 v0.1

日期：2026-11-03。对应 `rfq-service`；完整功能及首批证据见 [后端开发验收清单](RFQ后端开发验收清单_2026-11-03.md)。

## 公共约定

前缀 `/api/rfq`；除登录外要求 `Authorization: Bearer <token>`。成功 HTTP 200 + `{code:0,msg:"成功",data:...}`。列表用 `{list,page,size,total,totalPages}`，page 默认 1，size 默认 20、最大 100；sort 字段白名单，非法返回 400。时间使用 UTC ISO-8601。

错误：400 参数/人员资格不满足，401 未登录/账号停用，403 超出管理或业务范围，404 对象不存在，409 唯一编码/旧版本/状态冲突。读接口不写审计。平台全局账号管理和业务项目访问是独立权限。

## BU

| 方法与路径 | 参数 | 返回 data | 权限 |
| --- | --- | --- | --- |
| GET `/admin/business-units` | page、size、sort、keyword；sort=createdAt/code/name | PageView<BuView> | 平台全部；BU 管理员仅本人管理 BU |
| POST `/admin/business-units` | `{code,name}`；code 为 2–16 位字母/数字/_/-；name≤64 | BuView | 平台 |
| PATCH `/admin/business-units/{id}` | `{name}` | BuView | 平台 |

BuView 示例：`{"id":"BU-...","code":"FEP","name":"FEP事业部","createdAt":"2026-11-03T00:00:00Z"}`。重复编码 409；普通业务身份 403。BU 不提供物理删除接口。

## 账号与角色

| 方法与路径 | 参数 | 返回 data |
| --- | --- | --- |
| GET `/admin/users` | page、size、sort、keyword、buId；sort=createdAt/username/displayName | PageView<UserView> |
| POST `/admin/users` | `{username,password,displayName,email?,buId,role}` | UserView |
| PATCH `/admin/users/{id}` | `{displayName,email?}` | UserView |
| PATCH `/admin/users/{id}/status` | `{status:"ACTIVE"或"DISABLED"}` | UserView |
| POST `/admin/users/{id}/password` | `{password}` | null |
| POST `/admin/users/{id}/roles` | `{buId,role}` | `{buId,role}` |
| DELETE `/admin/users/{id}/roles` | query buId、role；仅停用绑定，不删历史 | null |

username：3–32 位字母/数字/点/_/-；password：8–64 字符；displayName≤64，email≤128 且格式合法。role 白名单 SR、TECH、BU_ADMIN、APPROVER（兼容已有角色，不赋予默认项目读取权）。创建普通账号不会授予 systemAdmin。

UserView：`{id,username,displayName,email,status,systemAdmin,roles:[{buId,role}],createdAt}`；不返回密码或散列。账号列表保留停用的 BU 绑定，方便恢复；BU 管理员的角色列表仅包含管理范围内的角色。

平台可管理全部账号。BU 管理员仅维护本人 BU 普通账号，不能修改平台账号，不能授予/撤销 BU_ADMIN。全局资料、全局状态和密码会影响全部 BU，目标存在其他未管理 BU 归属时返回 403；该 BU 的成员启停和资格仍可维护。禁止停用当前登录账号；至少保留一个有效平台管理员。

## BU 成员及资格

| 方法与路径 | 参数 | 返回 data | 权限 |
| --- | --- | --- | --- |
| GET `/business-units/{buId}/members` | 无 | MemberView[] | 已登录且可达该 BU；平台可读全部 |
| GET `/admin/business-units/{buId}/members` | 无 | MemberView[] | 平台或对应 BU 管理员 |
| PATCH `/admin/business-units/{buId}/members/{userId}` | `{canConfirm?,canFinalReview?,resourceQualifications?}` | MemberView | 同上 |
| PATCH `/admin/business-units/{buId}/members/{userId}/status` | `{enabled:true或false}`，必填 | MemberView | 同上；BU 管理员成员状态仅平台维护 |

MemberView：`{userId,username,displayName,roles,enabled,canConfirm,canFinalReview,resourceQualifications}`。资源资格白名单 knowledge-publish、capability-publish。没有资格档案时默认不授予确认/最终评审/发布资格。最终评审资格要求条款确认资格；停用账号或成员返回 enabled=false，有效确认及最终评审标志为 false。

成员暂停保存在 `bu_member_profile.enabled`，角色撤销保存在 `user_bu_role.status`；恢复成员不会恢复已撤销角色。每次 JWT 请求重新读取有效角色和成员状态。既有数组协议用于当前人员同步，候选目录分页改造后续提供兼容方案。

## 项目授权

仅平台或对应 BU 管理员维护。普通 SR/TECH/APPROVER 和跨 BU 管理员返回 403。

| 方法与路径 | 参数 | 返回 data |
| --- | --- | --- |
| GET `/projects/{id}/access` | 无 | `{projectId,buId,ownerId,version}` |
| GET `/projects/{id}/members` | page、size、sort（createdAt/updatedAt） | PageView<MemberView> |
| PATCH `/projects/{id}/members/{userId}` | `{version,enabled,reason}`；version≥0，reason非空≤500 | AccessView（更新后的 version） |

项目 MemberView：`{projectId,userId,displayName,enabled,owner,updatedAt}`。这里 enabled 是项目授权的保存状态；实际读取仍同时校验账号与 BU 成员状态，并非独立的确认/评审资格。

示例：先 GET access 取得 version=2，再 PATCH `/projects/RFQ-.../members/USR-...`：

```json
{"version":2,"enabled":true,"reason":"加入本项目技术协作"}
```

成功 data：`{"projectId":"RFQ-...","buId":"BU-FEP","ownerId":"USR-...","version":3}`。旧 version 409；未填原因/版本/启停值 400；人员跨 BU、账号停用、成员停用或非业务账号时不能授予；可以撤销已经停用成员的历史项目授权。负责人授权不可直接撤销，返回 409；变更负责人使用 [B09 项目移交](RFQ项目维护接口_v0.1.md)。归档期间仍可维护访问授权。

新建项目的 ownerId 必须是该 BU 有效 SR；省略时使用当前人，因此仅有管理角色时应显式选择有效 SR。迁移只保留已有负责人授权。业务 `GET /projects`、项目详情、文档列表/下载、条款及解析结果统一检查项目访问范围，过滤先于分页/计数。平台身份可维护 access 元数据，但不因此获得原文读取权。

## 审计

GET `/audit`，仅平台或 BU 管理员。参数全部可选：

| 参数 | 规则 |
| --- | --- |
| page / size / sort | 默认 1/20/createdAt,desc；只允许 createdAt 排序 |
| buId | 平台可指定 BU；BU 管理员只能选择本人管理 BU，省略查询本人全部管理 BU |
| actorId / action / objectType / objectId | 精确匹配；分别最多 64/64/32/64 字符 |
| result | 成功 / 失败 |
| createdFrom / createdTo | UTC ISO-8601，含边界；起点晚于终点返回 400 |

返回 PageView，元素：`{id,buId,actorId,action,objectType,objectId,result,detail,createdAt}`。例如：

```json
{"code":0,"msg":"成功","data":{"list":[{"id":"EVT-...","buId":"BU-FEP","actorId":"USR-...","action":"授予项目访问","objectType":"project","objectId":"RFQ-...","result":"成功","detail":"USR-...：加入本项目技术协作","createdAt":"2026-11-03T00:00:00Z"}],"page":1,"size":20,"total":1,"totalPages":1}}
```

范围在 SQL 中过滤，total 不包含其他 BU。历史 buId=null 不推断归属，只能由平台查询。管理写入和成功审计同事务；回滚不保留成功记录。账号全球变更在相关 BU 分别留痕，密码仅记录重置动作。现存业务之外的 craft/office 独立访问协议及全站失败请求日志，不包含在本批业务审计中。

## 迁移及联调

新增 `V3__admin_project_access.sql`，不修改 V1/V2。若历史环境人工建立过旧版 bu_member_profile，本迁移保留其资格记录并补充 enabled。历史知识库文档的 V3 为未实施草案，下次落地需使用新的迁移编号。

请在独立测试库运行 Maven verify。当前验证通过专用 Docker MySQL 8 和离线 Maven 缓存，不使用运行中的演示数据库。源码修改不会自动刷新 `runtime/rfq-service.jar` 或现有服务容器；交付包以验证生成的 target/rfq-service.jar 为准。
