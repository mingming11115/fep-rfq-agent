# 堡垒机上的前后端容器部署

推荐使用仓库根目录下的 `apps/observability/docker-rfq.sh`，不需要 Docker Compose。前端和后端各一个容器，由同一脚本构建、启动和检查。

## 更新与启动

在服务器上的仓库根目录执行。先保存已有未提交修改，再按原有方式更新代码：

```bash
git pull --ff-only
bash apps/observability/docker-rfq.sh build
bash apps/observability/docker-rfq.sh start
bash apps/observability/docker-rfq.sh status
```

`build` 在镜像内安装 Node 依赖、构建网页，校验并包含 Word/PDF 的 HTML、JS、WASM 及嵌套脚本，同时生成 gzip 副本。无需在服务器安装 Node 或 Rust，也不再使用 `deploy/frontend-dist` 或旧的 `apps/web/public/craft-editors`。后端继续按原 Dockerfile 构建。

`start` 先确认两个镜像存在且属于同一次构建，然后替换容器。后端健康检查返回 `UP`、前端接口转发正常、通过 nginx 取得的全部编辑器文件散列与构建清单一致后，才显示“前后端已就绪”。构建第二个镜像失败时不会误启动混用版本。该检查验证文件传输完整性，不替代浏览器中的 WebGL、WASM 初始化和实际文档验证。

| 服务 | 默认位置 |
| --- | --- |
| 前端和编辑器 | `rfq-web:onlyoffice`，容器内 nginx 8080，映射宿主机 `127.0.0.1:48080` |
| Java 后端 | `rfq-service:onlyoffice`，映射宿主机 `127.0.0.1:48081` |
| 前端访问后端 | Docker 网络 `rfq-net` 中的 `rfq-service:48081` |
| 业务文件与日志 | 沿用 `rfq-office-documents:/app/data` |
| 数据库 | 沿用原 MySQL 和 `/opt/rfq/db.env` 配置 |

旧数据不自动迁移到其他路径。`stop`、`restart` 不删除数据卷。镜像构建成功后再启动；首次下载依赖耗时较长，不能把镜像构建时间与浏览器编辑器的启动时间混为一谈。

## 保留原 HTTP 80 入口，自动迁移

本环境只使用 HTTP 80。日常执行上面的 build/start 即可：start 在容器就绪后自动读取宿主机 nginx -T 的生效配置，识别 RFQ 的 HTTP 80 站点并将网页、编辑器、接口转发到本机 48080。原域名和对外 80 端口保留，不申请新端口、不生成证书、不启用 HTTPS。

部署账号需要能读取并写入原 nginx 配置、运行 nginx -T/-t/-s reload（通常沿用已有 root 部署账号）。配置文件逐个保留带时间戳的备份；校验或重载失败自动恢复原配置，start 返回失败。无法识别 RFQ 站点时停止并报错，不改其他站点。前端镜像内提供迁移解析器，服务器无需安装 Node。

首次更新后浏览器 Ctrl+F5，清除旧的 7 天编辑器缓存。已有 HTTPS 需求的其他环境仍可使用 setup-https.sh，但本环境不执行该脚本。

## 验证与日志

在服务器上执行：

```bash
curl --fail http://127.0.0.1:48080/healthz
curl --fail http://127.0.0.1:48080/backend-health
bash apps/observability/docker-rfq.sh logs web
# 另一个终端查看后端
bash apps/observability/docker-rfq.sh logs api
```

再从实际浏览器访问的 HTTP 地址打开文档。容器内部检查通过，而 HTTP 页面仍旧或仍超时时，检查宿主机代理是否仍从旧目录提供文件。前端容器提供 `/craft-editors/wordcraft-classic/index.html` 和 `/craft-editors/pdfcraft-classic/index.html`；大文件 HEAD 请求应成功，缺失文件应返回 404，不能返回业务首页 HTML。

编辑器资源下载及初始化最多等待 180 秒；收到编辑器就绪信号后，文档打开另计 60 秒。PDF 的模块或 WASM 加载失败会立即回传错误，避免一律等到超时。gzip 会减小网络传输量，但不能替代正常的网络、浏览器 WebGL 支持和文档格式校验。

## 配置和版本回退

- `WEB_HOST_PORT=48080`、`WEB_BIND=127.0.0.1`：前端映射，默认供宿主机反向代理使用。直接 HTTP 访问需显式设置 `WEB_BIND=0.0.0.0` 并按环境放行端口；本环境正式访问继续使用原 HTTP 80 入口。
- `HOST_PORT=48081`：保留原后端映射。
- `RFQ_STARTUP_TIMEOUT=180`：后端/前端检查各自的轮询等待时间。单次网络请求也有自己的短超时。
- `RFQ_IMAGE_TAG=版本号`：前后端统一版本，例如构建和启动时都加 `RFQ_IMAGE_TAG=20261121`。保留旧标签后，可用旧标签重新执行 `start` 回退应用文件；这不会回退数据库模式或业务数据。
- `NPM_REGISTRY`：构建前端的 npm 镜像源，默认 `https://registry.npmmirror.com`，可改成企业内部源。
- `RFQ_OFFICE_UPSTREAM`：仅旧 OnlyOffice API 需单独后端时覆盖，默认同 Java 服务。WordCraft/PdfCraft 无需 OnlyOffice 容器。

日常更新仍是 `build` 后 `start`，无需手工同步网页目录或运行 `update-web.sh`，HTTP 80 入口由 start 自动处理。`update-web.sh`、`publish-web.sh` 以及 `setup-https.sh --static -w /旧目录` 只保留给旧静态部署。`apps/api/compose.yaml` 是旧后端部署入口，本指南使用 Bash 统一管理，避免混用两套容器名称和数据卷。
