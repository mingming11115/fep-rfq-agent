# Windows 启动原生 Word / PDF 批阅

需要 Node.js 22.12 或以上版本、Java 17 或以上版本，以及仓库源码。预编译资源包提供 Word/PDF 编辑器和 Java 后端 JAR，Windows 无需安装 Rust、wasm-bindgen、Maven 或 Docker。

## 更新代码与解压

在仓库根目录的 PowerShell 中更新 `master`：

```powershell
git switch master
git pull --ff-only origin master
```

先保存或提交自己已有的代码改动；不要通过重置仓库来更新。下载与本次提交匹配的 Release 附件 `rfq-windows-resources.zip`，将 ZIP 的内容解压到仓库根目录。解压后应能看到：

```text
demos/craft-review/site/wordcraft-classic/build.json
demos/craft-review/site/pdfcraft-classic/build.json
rfq-service/target/rfq-service.jar
WINDOWS-START.txt
```

不要在路径中多套一层 `rfq-windows-resources` 文件夹。资源包不包含业务文件、浏览器数据或 Docker 数据卷，不覆盖文件存储目录。

## 启动后端

在仓库根目录打开 PowerShell：

```powershell
java -version
java -jar .\rfq-service\target\rfq-service.jar --server.port=48083 --office.storage-dir=./rfq-service/data/craft
```

保持这个窗口运行。在另一个 PowerShell 检查：

```powershell
curl.exe http://127.0.0.1:48083/actuator/health
```

返回 `{"status":"UP"}` 后，再启动前端。后端文件保存在 `rfq-service/data/craft`，不要删除该目录。若此前使用的是其他存储位置，请把 `--office.storage-dir` 改为原来的位置；Docker 文件卷不会自动迁移到 Java 本地目录。

## 启动前端

在仓库根目录另开 PowerShell：

```powershell
cd .\rfq-react-prototype
node --version
npm ci
npm run craft:prepare
npm run dev
```

`npm ci` 只需首次安装或依赖变更后执行。看到启动成功后打开 `http://127.0.0.1:5173/`。前后端两个窗口都应保持运行；退出时分别按 `Ctrl+C`。已有服务占用同一端口时，使用原来的服务或先正常关闭它，不要重复启动。

前端默认把 `/api/craft` 转发到 `48083`。只有 Java 后端运行在其他地址时，才在前端启动前设置：

```powershell
$env:RFQ_CRAFT_API_TARGET="http://127.0.0.1:实际端口"
npm run dev
```

Windows 的 Git 自动换行不会再使同一补丁误报“补丁已更新”；运行文件仍按完整字节散列校验。真实代码补丁或编译产物变化仍会被拒绝，需要使用匹配提交的资源包。

## 仅补充编辑器资源

如果后端已经可用，可只下载 `craft-editors.zip`，解压到 `demos/craft-review/site/`（直接得到两个 `*-classic` 文件夹），然后在 `rfq-react-prototype` 运行 `npm run craft:prepare`。不要同时使用不同提交的源码和编辑器资源。
