# 浏览器诊断工具

这些脚本从原 `.workbuddy/browser-test` 迁入，供手动排查 Chrome 下拉框、缩放和原文编辑交互。常规业务回归使用根目录 `npm test`。

在工程根目录执行：

```sh
npm ci --prefix tests/browser
node tests/browser/test-dropdowns.mjs
```

运行前启动前端 `npm run dev`，并安装本机 Chrome。截图写入 `.local/artifacts/browser`，不提交到 Git。需要登录状态副本的脚本，使用环境变量 `RFQ_CHROME_PROFILE` 指定单独的测试 profile；不要使用正在运行的个人 Chrome profile。

这些工具会操作真实浏览器，按需要单独运行；CI 入口位于 `apps/web/scripts/windows-dropdown-check.mjs` 和 `.github/workflows/windows-dropdown-check.yml`。
