# Prompt 清单与调用决策树

> 范围：`apps/api` 内所有会发给大模型的 system prompt（不含外部 OCR / MinerU 服务自身的提示词）。
> 目的：记录当前 prompt 结构、调用链路和历史包袱，作为后续收敛的依据。
> 最近更新：2026-11-17，完成「删除 Word 总结分支」和「合并 Word / MinerU 答复定位」。

## 1. 结论

- 当前一共 **4 套任务提示词** + 1 段共用规则：
  1. 内容块抽取（含历史条款补全）
  2. Word Markdown 抽取
  3. 历史纯模型抽取（规则关闭时）
  4. 历史答复定位（Word / MinerU 共用）
- Word 与 RFQ 的抽取**共用同一段 `RULES`**，差异只在输入协议和输出 JSON 契约。
- Word / MinerU 的答复定位已合并：后端统一提供「条款 + 表头 + 候选单元格」，模型只返回候选 ID 或 `null`。
- 历史纯模型分支仍在，是否下线取决于部署配置核对结果（见第 6 节）。

## 2. Prompt 清单

| ID | 常量 | 定义位置 | 拼装方式 | 调用位置 | 触发条件 |
|---|---|---|---|---|---|
| P0 | `RequirementExtractionPrompt.RULES` | `RequirementExtractionPrompt.java:4` | 被 P1、P2 原样前置 | 不单独发送 | — |
| P1 | `HybridRequirementExtractor.PROMPT` | `HybridRequirementExtractor.java` | `RULES` + 内容块协议 | 同文件 `extractWithReport` | 项目 RFQ 非 Word 路径；历史条款补全 |
| P1b | `HISTORY_CONTEXT` | 同文件 | 追加在 P1 之后 | 同上 | 仅历史条款补全（`extractModelRequirements`） |
| P2 | `WordMarkdownExtractor.PROMPT` | `WordMarkdownExtractor.java:32` | `RULES` + Markdown 协议 | `WordMarkdownExtractor.java:126` | 项目 DOCX 且 LLM 开启 |
| P3 | `HistoryModelExtractor.PROMPT` | `HistoryModelExtractor.java:27` | 独立 + 任务后缀 | `HistoryModelExtractor.java:160` | 历史 RFQ：纯模型路径（规则关闭） |
| P4 | `ANSWER_PROMPT` | `HybridRequirementExtractor.java` | 独立 | `answerArray` / `locateAnswerBatch` | 历史 RFQ：定位供应商答复 |

### 2.1 各 prompt 的输入 / 输出 / 校验

| ID | 输入 | 输出契约 | 服务端校验与降级 |
|---|---|---|---|
| P1 | JSON 数组：`blockIndex`、`type`、`text`、`sectionPath` | `requirements[]`：`blockIndex`、`originalText`、`item`、`description`、`customerClauseNo`、`specification`、`supportingSources`；`ignoredBlockIndexes` | 引文必须能在块内逐字定位；必须覆盖全部块；规则已识别的条款不允许被忽略；单批失败降级规则抽取 |
| P1b | 同 P1 | 同 P1，`supportingSources` 填 `[]` | 同上 |
| P2 | 带 `[S数字]` 标记的 Markdown | `requirements[]`：`customerClauseNo`、`title`、`requirementText`、`specification`、`sourceRefs`；`ignoredSourceRefs` | `S` 编号必须存在；分批时只认「本批主要来源」；单批失败记 issue，全部失败才整体失败 |
| P3 | `[{source,anchor,text,sectionPath,tableHeader,...}]` | `clauses[]`：`source`、`clauseNo`、`title`、`requirement`、`answer`、`answerSource`；`metadata` | 要求与答复都必须逐字出现在源块；答复来源必须与本行/同批段落一致 |
| P4 | `[{id,requirement,candidates:[{id,rowIndex,columnIndex,header,text}]}]` | `answers[]`：`id`、`candidateId`（可空） | `id` 必须在本批内且不重复；`candidateId` 必须命中该 target 的候选；后端按 ID 取原文，不接受模型改写 |

## 3. 调用决策树

### 3.1 项目 RFQ 解析（`ParseService.readAndExtract`）

```
读取器 = readerFor(document)
├─ DOCX 且 rfq.llm.enabled=true
│   └─ WordMarkdownReader（markitdown）→ WordMarkdownExtractor → P2
│       └─ 失败直接抛 DocumentReadException（不降级）
├─ DOCX 且 LLM 关闭
│   └─ DocxBlockReader → 规则抽取（不再调用模型总结）
└─ 其他（PDF 等）
    └─ extractWithReport
        ├─ LLM 开启 → P1
        └─ LLM 关闭 → 仅规则抽取
```

> `rfq.llm.enabled` 默认 `false`（`application.yml`）。此时 Word、PDF 都只走规则抽取；DOCX 也不会生成 `source.md`。
> Word 规则抽取保留：`extractWordWithReport` 现在只返回规则结果，`WORD_SUMMARY_PROMPT` 和总结批次已删除。

### 3.2 历史 RFQ 解析（`HistoryParseService` → `HistoryExtractor`）

```
HistoryExtractor.extract(primary, companion)
├─ history.rules-enabled=true（默认）
│   ├─ read(primary)        // 规则读条款，按表格表示分别登记候选
│   ├─ llm.enabled=true → applyModel() → P1 + P1b
│   ├─ read(companion)      // 配套答复文件（可选）
│   └─ llm.enabled=true → applyTableAnswers()
│       ├─ Word 表格行 → AnswerTarget（候选来自行内单元格）
│       ├─ MinerU 表格 → AnswerTarget（候选来自展开网格，保留原始行列）
│       └─ 合并为一次 P4 调用
└─ history.rules-enabled=false
    └─ HistoryModelExtractor.extract() → P3（主文件 / 配套答复两种任务后缀）
```

> `history.rules-enabled` 默认 `true`。默认链路是「规则读取 + P1/P1b 补条款 + P4 定位答复」；P3 只在显式关闭规则时生效。

## 4. 答复定位的统一契约

- `AnswerTarget`：`id`（条款 key）、`requirement`、`candidates`。
- `AnswerCandidate`：`id`（候选序号）、`rowIndex`（MinerU 原始行号，Word 为 -1）、`columnIndex`（列号）、`header`、`text`。
- 模型只返回 `{"id":"...","candidateId":0}`；`candidateId=null` 表示没有明确答复。
- 后端按 `candidateId` 取候选原文，不再让模型回抄 `quote`，避免改写和定位漂移。
- MinerU 适配：
  - 候选来自 `tableRows`（已展开的网格），`rowIndex` 映射回 `mineruTable.sourceRows()` 的原始行号；
  - 表头按数据行之前的表头逐列合并，`colspan` 留下的空格沿用左列；
  - 排除编号、要求、项目、规格列，以及 `Rev` 列的纯版本号（如 `R2`）。

## 5. 当前历史包袱

| 编号 | 问题 | 状态 |
|---|---|---|
| B1 | 历史 RFQ 有两条互斥链路（`rules-enabled`） | 仍在；待部署配置核对后决定是否下线纯模型分支 |
| B2 | Word / MinerU 两个答复定位 prompt | **已解决**：合并为 P4，候选 ID 契约 |
| B3 | 历史条款补全复用 P1 + `HISTORY_CONTEXT` 后缀 | 仍在，属可接受的复用 |
| B4 | `WORD_SUMMARY_PROMPT` 生产不可达 | **已删除**：连同总结批次与 `withWordSummary` |
| B5 | 条款抽取与答复定位分两次模型调用 | 仍在（规则路径需要按行选格）；纯模型路径一次完成 |

## 6. 部署配置核对（历史纯模型分支）

仓库内检索 `RFQ_HISTORY_RULES_ENABLED` / `history.rules-enabled`：

| 位置 | 值 |
|---|---|
| `apps/api/.env.example` | `true` |
| `apps/api/compose.yaml` | `${RFQ_HISTORY_RULES_ENABLED:-true}` |
| `apps/api/README.md` | 默认 `true` |
| `application.yml` | `${RFQ_HISTORY_RULES_ENABLED:true}` |

结论：**仓库内没有任何配置把规则解析设为 `false`**，默认与示例都是 `true`。但仓库外的部署环境（K8s/服务器 env）无法从代码确认，仍需在部署侧核对。确认没有环境依赖纯模型分支后，才可删除 P3，收敛到 3 套：
1. 内容块抽取（含历史条款补全）
2. Word Markdown 抽取
3. 历史答复定位

删除前需用同一批历史 RFQ 对比：配套答复、跨段落答复、原文定位三项结果。

## 7. 本次变更（2026-11-17）

**代码**
- `HybridRequirementExtractor.java`
  - 删除 `WORD_SUMMARY_PROMPT`、`summarizeWordBatch`、`withWordSummary`。
  - `extractWordWithReport(List<RawBlock>)` 改为纯规则抽取。
  - 删除 `MINERU_HISTORY_ANSWER_PROMPT`、`WORD_HISTORY_ANSWER_PROMPT`，新增统一 `ANSWER_PROMPT`。
  - 新增 `AnswerTarget` / `AnswerCandidate`，删除 `HistoryAnswerTarget` / `WordAnswerTarget` / `WordAnswerCell`。
  - 新增 `locateAnswers` / `locateAnswerBatch`，删除 `extractWordHistoryAnswers` / `extractWordAnswerBatch` / `extractMineruHistoryAnswers` / `historyAnswerText`。
- `HistoryExtractor.java`
  - `wordSources` 改为统一 `AnswerTarget`。
  - 新增 `mineruAnswerTargets`（原始行号、列号、合并表头）与 `mergedHeaders`。
  - `applyTableAnswers` 合并 Word / MinerU 目标，只调用一次 `locateAnswers`。
- `ParseService.java`：`extractWordWithReport` 调用改为单参数。

**测试**
- `ParsingAdaptersTest`：删除两条 Word 总结测试，新增 `wordRulesDoNotCallTheModel`。
- `HistoryExtractorTest`：答复契约改为 `id` + `candidateId`。
- `MineruPdfReaderTest`：改为校验候选、表头、原始行列坐标。

**文档**：本文件同步更新为 4 套结构。
