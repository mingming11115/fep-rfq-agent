# RFQ Word Ribbon Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一隐藏用户指定的七个 Word 标签。
**Architecture:** 修改现有 WordCraft 原生源码补丁；在形成最终标签列表后过滤，供常规功能区和折叠菜单共同使用。
**Tech Stack:** Rust / egui / WordCraft 0.13.2 / WASM；现有 Python 构建和 React 资源准备脚本。
**Spec:** `docs/superpowers/specs/2026-11-01-craft-ribbon-tabs-design.md`

## Global Constraints

- 仅隐藏 Zotero、Developer、Mailings、References、Layout、Design、File。
- 所有浏览器默认生效，旧偏好和重置不能恢复标签。
- 保留其他标签、上下文工具栏和宿主保存、下载、上传、批注。
- 固定版本、字体、许可证和补丁散列校验保留。

## Review Focus

旧偏好选中已隐藏标签时回退到可见标签；窄屏更多菜单不得泄漏标签；重置和显式 show 不得恢复；上下文标签不误删；新补丁能够从固定归档应用并构建。

### Task 1: 原生工具栏显示策略与构建

**Files:** 修改 `demos/craft-review/wordcraft-classic-comments.patch`；更新 `docs/craft-project-review.md` 和验证记录。
**Interfaces:** WordCraft `ribbon::show` 形成的标签列表用于常规标签和更多菜单；引擎命令和宿主消息协议不变。

- [x] 写原生 UI 回归：七个标签不出现，显式 show / reset / 旧选中态及窄屏均不恢复，其他标签与表格上下文仍可用。
- [x] 运行回归，确认缺少过滤时失败。
- [x] 实现统一显示过滤，更新可重复应用的源码补丁。
- [x] 运行定向原生测试、前端测试、可执行的上游检查，构建 WASM 和前端，检查实际资源。
- [x] 独立复查本次差异，记录验证结果和限制，保留改动供用户审阅。

### Task 2: 后续要求——工具栏默认收起

- [x] 原生 UI 回归先复现初始展开，再覆盖点击展开、逐帧保持、手动收起与窄屏菜单展开。
- [x] 仅首次启用宿主批阅时设置收起；普通和折叠菜单标签点击时展开。
- [x] 功能区相关 42 项、宿主 20 项、前端 426 项通过；更新补丁并重建 Word WASM 和前端。
- [x] 浏览器验证默认收起、单击展开、双击收起；独立复查并记录结果。

### Task 3: 2026-11-02 Word 正文目录入口（已撤回，由 Task 4 取代）

以下记录为澄清前的实现历史；最终代码已撤掉此新增入口及对应回归。

- [x] 明确用户需要 Word 正文目录，并检查现有目录工具组及命令。
- [x] 写 UI 回归并复现“插入”栏缺少入口；覆盖正文目录生成、DOCX 保存重开、删除保留原文及只读写入保护。
- [x] 提取原“引用”栏目录工具组供“插入”复用；保留隐藏标签和默认收起。
- [x] 原生、前端回归，WASM 与前端构建；补丁归档应用、资源校验和独立复查。
- [x] 浏览器核对入口并保存截图；不改写用户当前文件。

### Task 4: 2026-11-02 独立只读目录导航

- [x] 按最终澄清撤回新增正文目录入口，恢复上游“插入”和“引用”代码。
- [x] 先复现缺少导航协议和按钮的失败；覆盖打开、标题/条款跳转、关闭、页码兜底及歧义过滤。
- [x] 在宿主文件标题栏增加“目录”开关，复用原生导航；已有标题优先，其次同一文档版本的唯一条款匹配，最后使用页码。
- [x] 原生回归断言文档内容、版本号、撤销历史和未保存状态不变；前端断言不触发保存或批注同步写入。
- [x] 导航不可变性 3 项、功能区及对话框 42 项、宿主 23 项、既有导航 4 项、前端 427 项通过；Word WASM 和前端构建成功。
- [x] 固定归档应用补丁后 24 个源码文件逐字节匹配；31 个编辑器产物在来源、public、dist 中散列一致。格式和差异检查通过，独立复查无问题。
- [x] 实际页面展开 S1/F1/F2 目录，点击 F1 跳转并返回 S1，关闭/重开目录没有未保存提示；截图保存，未修改原文件。
