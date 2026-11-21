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

## 已有 HTTPS 站点的一次性切换

**只启动容器不会改变已有 nginx 站点。** 旧站点仍可能从宿主机目录提供旧网页。首次迁移必须让浏览器实际使用的 HTTPS 入口将网页、编辑器和接口都转发到 `127.0.0.1:48080`。

如果站点原来由本仓库的 HTTPS 脚本管理，执行：

```bash
sudo bash deploy/https/setup-https.sh --container -n 实际访问域名或IP
```

默认复用 `/etc/nginx/ssl/rfq.crt` 和 `rfq.key`。企业证书或其他位置的证书必须显式传入，避免更换现有访问证书：

```bash
sudo bash deploy/https/setup-https.sh --container -n 实际访问域名 \
  --cert /现有证书路径/site.crt --key /现有私钥路径/site.key
```

可以先在末尾加 `--dry-run` 查看操作。脚本会备份已有 `rfq.conf`，校验通过才重载。自定义安装的 nginx、不同名称的站点或其他反向代理应修改实际生效的站点；不要额外建立一个同域名的重复站点。网页入口的核心配置为：

```nginx
location / {
    proxy_pass http://127.0.0.1:48080;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
}
```

同时移除该站点原先直接读取网页的静态资源正则 `location`，否则 JS/WASM 仍会被旧规则截走。可参考 `deploy/https/nginx-rfq-container.conf`；需要上传文档时保留 `client_max_body_size 64m`。保留原证书、访问域名和端口。

首次切换后浏览器按 `Ctrl+F5` 清除之前缓存 7 天的编辑器文件。新版容器对固定文件名的编辑器资源要求重新验证，Vite 带内容散列的资源仍可长期缓存。

## 验证与日志

在服务器上执行：

```bash
curl --fail http://127.0.0.1:48080/healthz
curl --fail http://127.0.0.1:48080/backend-health
bash apps/observability/docker-rfq.sh logs web
# 另一个终端查看后端
bash apps/observability/docker-rfq.sh logs api
```

再从实际浏览器访问的 HTTPS 地址打开文档。容器内部检查通过，而 HTTPS 页面仍旧或仍超时时，检查宿主机代理是否仍从旧目录提供文件。前端容器提供 `/craft-editors/wordcraft-classic/index.html` 和 `/craft-editors/pdfcraft-classic/index.html`；大文件 HEAD 请求应成功，缺失文件应返回 404，不能返回业务首页 HTML。

编辑器资源下载及初始化最多等待 180 秒；收到编辑器就绪信号后，文档打开另计 60 秒。PDF 的模块或 WASM 加载失败会立即回传错误，避免一律等到超时。gzip 会减小网络传输量，但不能替代正常的网络、浏览器 WebGL 支持和文档格式校验。

## 配置和版本回退

- `WEB_HOST_PORT=48080`、`WEB_BIND=127.0.0.1`：前端映射，默认供宿主机反向代理使用。直接 HTTP 访问需显式设置 `WEB_BIND=0.0.0.0` 并按环境放行端口；正式访问继续使用已有 HTTPS 入口。
- `HOST_PORT=48081`：保留原后端映射。
- `RFQ_STARTUP_TIMEOUT=180`：后端/前端检查各自的轮询等待时间。单次网络请求也有自己的短超时。
- `RFQ_IMAGE_TAG=版本号`：前后端统一版本，例如构建和启动时都加 `RFQ_IMAGE_TAG=20261121`。保留旧标签后，可用旧标签重新执行 `start` 回退应用文件；这不会回退数据库模式或业务数据。
- `NPM_REGISTRY`：构建前端的 npm 镜像源，默认 `https://registry.npmmirror.com`，可改成企业内部源。
- `RFQ_OFFICE_UPSTREAM`：仅旧 OnlyOffice API 需单独后端时覆盖，默认同 Java 服务。WordCraft/PdfCraft 无需 OnlyOffice 容器。

日常更新仍是 `build` 后 `start`，无需再次同步网页目录、运行 `update-web.sh` 或重配 HTTPS。`update-web.sh`、`publish-web.sh` 以及 `setup-https.sh --static -w /旧目录` 只保留给旧静态部署。`apps/api/compose.yaml` 是旧后端部署入口，本指南使用 Bash 统一管理，避免混用两套容器名称和数据卷。
