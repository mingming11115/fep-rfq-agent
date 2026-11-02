# FEP RFQ Agent 项目长期备忘

## 本机环境（Windows）
- 这台 Windows 电脑没有 Docker、WSL 被沙箱拦截。
- 已装便携版工具（不需管理员权限），位于 `C:\Users\ming\.rfq-tools\`：
  - JDK 17：`jdk-17.0.20.1+1`（Temurin，清华 TUNA 镜像）
  - Maven 3.9.16（`maven-settings.xml` 阿里云镜像）+ Rust stable（`RUSTUP_HOME=.rfq-tools/rustup/home`，`CARGO_HOME=.rfq-tools/cargo`）——master 已内置编译产物，这些仅在需要本地重新构建时使用
- 终端默认带 HTTP 代理 `127.0.0.1:55299`，curl 本机端口必须加 `--noproxy "*"`，否则误报 502。

## 数据库（MySQL 8.0.28 便携版，2026-11-02 起 H2 已彻底移除）
- 安装目录 `C:\Users\ming\.rfq-tools\mysql`（阿里云镜像 winx64 zip 解压，未注册系统服务、不要管理员权限）
- 数据目录 `C:\Users\ming\.rfq-tools\mysql-data`（**勿删**），配置文件 `C:\Users\ming\.rfq-tools\mysql-my.ini`
- 启动 `bash /c/Users/ming/.rfq-tools/mysql-start.sh`（前台运行，建议单独开一个终端窗口）；停止用 `mysql-stop.sh`
- 端口 3306，库 `rfq`（utf8mb4 / utf8mb4_0900_ai_ci，时区 +08:00）
- 账号：应用 `rfq_app / rfq_app_pwd`（仅 rfq 库权限）；root 密码 `rfq_root_pwd`
- 坑：`my.ini` 里**不能**加 `skip-name-resolve`，否则 127.0.0.1 的 TCP 连接匹配不到 `root@localhost`，报 1130 Host is not allowed
- 表结构由 Flyway 管（`db/migration/V1__init.sql`），`ddl-auto: none`。改表 = 新增 V2 脚本，不要手改库；历史脚本的校验和被记录，改动会导致启动报 checksum mismatch
- 演示账号密码统一 `Rfq@2026`，用户名 sr01 / bu01 / tech01 / appr01 / admin

## 持久层：MyBatis（2026-11-02 从 Spring Data JPA 切换）
- 依赖 `mybatis-spring-boot-starter 3.0.4`；spring-boot-starter-data-jpa 已移除，JAR 从 81MB 降到 55MB（Hibernate 只剩 validator）
- Mapper 接口在 `com.naura.rfq.mapper`，XML 在 `resources/mapper/*.xml`，靠 `map-underscore-to-camel-case: true` 做列名到字段的映射
- 实体是纯 POJO（Lombok @Getter/@Setter/@NoArgsConstructor），无 JPA 注解；`@Version` 的初值改由字段默认值 `0L` 承担
- 分页用自研 `common/api/PageQuery` + `PageView.of(list, total, page, size)`；排序字段过白名单后转下划线拼进 `order by`（唯一用 `${}` 的地方），其余参数全部 `#{}`
- **`save()` 的语义被拆开**：新建走 insert、已存在走 update，写新代码时不要混用
- 乐观锁：`RequirementMapper.updateWithVersion` 的 where 带 `and version = #{version}` 且 `version + 1`，返回 0 → 抛 409
- 坑一：`PageQuery` 不能用 record。MyBatis 取 `#{q.size}` 走 JavaBean 反射，record 的 `size()` 没有 get 前缀，报 `There is no getter for property named 'size'`
- 坑二：全局 CORS 只映射 `/api/rfq/**`。office 端点自带 `@CrossOrigin(origins = "*")`，两处叠加会被 Spring 合并成 `"*"` + `allowCredentials=true` 并直接抛异常（曾导致 OfficeIntegrationTest 500）
- 坑三：清空业务表可让 `DemoDataInitializer` 重跑，用来验证 insert；它只在 `app_user` 为空时播种

## 启动方式（2026-11-02 起走 master 直启路线）
- master 已把编辑器产物（`demos/craft-review/site/*-classic`）和后端 JAR（`rfq-service/runtime/rfq-service.jar`，81MB）直接提交进 Git，`git pull` 即可拿到全部资源，不再需要 Mac 传 zip 或本机构建。
- 启动顺序：**先 MySQL（3306）→ 后端（48083）→ 前端（5173）**。MySQL 没起时后端会因连不上库直接失败。
- 后端（48083，仓库根目录运行）：
  ```
  /c/Users/ming/.rfq-tools/jdk-17.0.20.1+1/bin/java -jar rfq-service/runtime/rfq-service.jar \
    --server.port=48083 --office.storage-dir=./rfq-service/data/craft
  ```
  文件存储在 `rfq-service/data/craft`，勿删。
- 前端：`rfq-react-prototype` 下 `npx vite --host 127.0.0.1 --port 5173 --strictPort`（craft 批阅入口用 5174）。编辑器资源入库后 `npm run dev` 的 predev 也能正常通过。
- 健康检查：`http://127.0.0.1:48083/actuator/health`
- 历史坑（已由上游修复）：Windows git 检出把补丁 LF 转 CRLF 导致 prepare 哈希校验失败；master 的 prepare 脚本现已同时接受两种换行，且 `.gitattributes` 强制 `*.patch eol=lf`。

## Git 仓库结构：两端分叉（2026-11-02 20:22 核实）
- **origin/master 与本地 master 是两条线**，公共祖先 `69932db`。远程只有 10 个 java 文件（仅 `office/` 那套 + common），本地多出的 49 个（`parse/`、`requirement/`、`project/`、`mapper/`、`V1__init.sql`、`MapperIntegrationTest`）来自本地两笔未推送的 `add` 提交。
- 因此 `git diff master origin/master` 会显示"远程删掉了 3568 行后端代码"——**这是误导**，远端从来没删除，只是本地额外持有完整业务后端。判断前先 `git ls-tree -r --name-only <ref> | grep -c` 数文件，别只看 diff。
- 远程 2026-11-02 的 8 笔提交全部是前端 UI 改进（文件操作分组、双主区块、注释筛选折叠、当前条款聚焦、右侧评论编辑器、条款定位反馈）+ 设计稿与 plan，**不涉及后端**，合并后无需重启后端 JAR。
- 拉取做法：先 `git branch backup/pre-pull-<日期>` 备份，再 `git pull --no-rebase --no-edit origin master`；合并后 `npm test`（447 用例）验证，vite 会自动 HMR。
- 仓库把 `.workbuddy/memory`、`.idea`、`outputs/` 临时产物也提交过，历史里有若干 `add` 空提交标题，属于噪音，不影响代码。
