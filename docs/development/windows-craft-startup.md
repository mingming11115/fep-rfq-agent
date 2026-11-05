# Windows 直接从 Git 启动

需要 Node.js 22.12 或以上版本、Java 17 或以上版本。Word/PDF 预编译编辑器及 Java 后端运行包均随 Git 提供，不需要另外下载 ZIP，也不需要 Rust、wasm-bindgen、Maven 或 Docker。

## 更新代码

更新前，先在前后端的服务窗口分别按 `Ctrl+C` 停止运行，再在仓库根目录的 PowerShell 执行。Windows 上运行中的 Java 可能占用 JAR，停止后 Git 才能更新运行包。

```powershell
git switch master
git pull --ff-only origin master
```

已有未提交代码时先保存或提交，不要重置仓库。拉取后以下文件由 Git 直接提供：

```text
packages/craft-editors/site/wordcraft-classic/build.json
packages/craft-editors/site/pdfcraft-classic/build.json
apps/api/runtime/rfq-service.jar
```

## 启动后端

在仓库根目录打开 PowerShell：

```powershell
java -jar .\apps\api\runtime\rfq-service.jar --server.port=48083 --office.storage-dir=./apps/api/data/craft --rfq.storage-dir=./apps/api/data/rfq-files
```

保持窗口运行。在另一个 PowerShell 中确认健康状态：

```powershell
curl.exe http://127.0.0.1:48083/actuator/health
```

应返回 `{"status":"UP"}`。已有后端时使用原来的服务即可，不要重复占用端口。文件保存到 `apps/api/data/craft`；已有其他存储位置时继续使用原路径，调整 `--office.storage-dir`。Docker 数据卷不会自动迁移到本地 Java 目录。

## 启动前端

在仓库根目录另开 PowerShell：

```powershell
cd .\apps/web
npm ci
npm run dev
```

`npm ci` 只需首次安装或依赖变更后执行。`npm run dev` 和 `npm run build` 会自动校验 Git 中的编辑器资源，连同演示文件生成到 `apps/web/.generated-public`，再由 Vite 提供或打包。不再读取旧的 `apps/web/public/craft-editors` 副本，避免损坏或不可读的旧 WASM 阻断启动。不必单独运行 `craft:prepare`，也不必编译编辑器。生产部署应完整复制 `apps/web/dist`，包含其中的 `craft-editors`、`craft-demo` 和 `onlyoffice-demo` 目录。

看到启动成功后打开 `http://127.0.0.1:5173/`。前后端窗口都保持运行。后续更新顺序为：先分别按 `Ctrl+C` 停止服务，运行 `git pull`，再正常启动前后端。

只有后端运行在其他端口时，才在前端启动前设置：

```powershell
$env:RFQ_CRAFT_API_TARGET="http://127.0.0.1:实际端口"
npm run dev
```

Git 属性保证编译资源在 Windows 上保持原始字节，校验清单继续拒绝真实补丁或运行文件变化。修改原生编辑器代码后，需要重新构建并连同产物、清单一起提交；后端代码变化后同样更新 `runtime` 运行包。开发构建缓存、前端生成副本和业务数据继续不入 Git。
