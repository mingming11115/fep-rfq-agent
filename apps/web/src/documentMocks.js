import { BHEL_ID, makeBhelDocument } from './bhelDemo.js';
import { makeRequirements } from './data.js';

// Synthetic metadata only: no original customer files are stored or read.
export function makeDocumentDemo(projectId, requirements = makeRequirements(projectId)) {
  if (projectId === BHEL_ID) { return makeBhelDocument(requirements); }
  const id = (key) => `${projectId}-DEMO-FILE-${key}`;
  const file = (key, name, purpose, version, status, createdAt, extra = {}) => ({
    id: id(key), name, purpose, version, status, createdAt,
    size: 1482000, visibility: '项目成员可见', sample: true, ...extra,
  });
  const files = [
    file('TECH-1', '客户技术要求.pdf', '要求来源', 'V1.0', '完成', '2026/10/15 09:30:00'),
    file('TECH-2', '客户技术要求.pdf', '要求来源', 'V1.1', '完成', '2026/10/18 14:20:00', {
      previousVersionId: id('TECH-1'), reason: '客户补充安全联锁要求，明确防护门开启时停止危险运动。',
    }),
    file('TECH-3', '客户技术要求.pdf', '要求来源', 'V2.0', '待核对', '2026/10/21 09:15:00', {
      previousVersionId: id('TECH-2'), reason: '客户收紧切缝宽度至 50 μm，新增复合材料适用性要求，需重新核对技术条款。',
    }),
    file('BIZ-1', '客户商务条款.xlsx', '要求来源', 'V1.0', '完成', '2026/10/16 10:00:00', { size: 86240 }),
    file('BIZ-2', '客户商务条款.xlsx', '要求来源', 'V1.1', '待核对', '2026/10/20 16:40:00', {
      size: 94100, previousVersionId: id('BIZ-1'), reason: '客户将交付周期由 12 周调整为 8 周，补充付款与质保条件。',
    }),
    file('LAYOUT', '附件A_厂房布局与接口.pdf', '补充附件', 'V1.0', '完成', '2026/10/19 11:20:00', { size: 2368400 }),
    file('SAMPLE', '附件B_样品与测量方案.docx', '补充附件', 'V1.0', '完成', '2026/10/20 10:10:00', { size: 426800 }),
    file('TEMPLATE', '客户应答模板.xlsx', '应答模板', 'V2.0', '完成', '2026/10/20 15:30:00', { size: 64200 }),
    file('SCAN', '客户补充要求_扫描件.pdf', '要求来源', 'V1.0', '失败', '2026/10/21 10:05:00', {
      size: 5678200, error: '模拟 OCR 失败：第 3–4 页扫描模糊，条款编号无法识别；请重试或手动补录。',
    }),
  ];
  const parsed = requirements.filter(row => !row.id.startsWith(`${projectId}-DOC-EXAMPLE-`)).map((row) => {
    const sourceFile = files.find((item) => item.id === id(row.category === '商务' ? 'BIZ-2' : 'TECH-3'));
    return { ...row, source: sourceFile.name, sourceFileId: sourceFile.id, sourceVersion: sourceFile.version };
  });
  for (const sourceFile of files) {
    if (sourceFile.purpose === '要求来源' && sourceFile.status !== '失败') {
      sourceFile.parsedCount = parsed.filter((row) => row.sourceFileId === sourceFile.id).length;
    }
  }
  const customerFiles = [
    file('CUSTOMER-A', '客户一_RFQ_Safety_Facility.docx', '要求来源', 'V1.0', '完成', '2026/10/22 09:00:00'),
    file('CUSTOMER-B', '客户二_RFQ_模块组合.doc', '要求来源', 'V1.0', '完成', '2026/10/22 09:10:00'),
    ...(projectId === 'RFQ-001' ? [file('CLAUSE-STATUSES', '条款状态示例.docx', '要求来源', 'V1.0', '完成', '2026/10/24 09:00:00')] : []),
  ];
  const examples = [
    ['CUSTOMER-A', 'S1', ['Safety', 'Interlock'], '门禁联锁', '防护门打开时停止危险运动，复位后方可恢复。', 2],
    ['CUSTOMER-A', 'F1', ['Facility'], '公用设施接口', '提供设备电力、冷却水和排风接口要求，注明额定值及允许范围。', 5],
    ['CUSTOMER-A', '', ['Facility'], '安装条件', '安装位置应预留设备维护空间，具体尺寸见布局附件。', 5],
    ['CUSTOMER-B', '1.1', ['反应模块', '温度控制'], '反应温控', '反应模块温度控制精度应达到 ±1 ℃，以双方确认的测试工况为准。', 3],
    ['CUSTOMER-B', '1.1', ['中转模块'], '中转联锁', '中转模块须与反应模块联锁，异常时暂停物料转移。', 7],
    ['CUSTOMER-B', '', ['中转模块'], '转移记录', '记录每次物料转移的开始时间、结束时间及异常信息。', 8],
    ...(projectId === 'RFQ-001' ? [
      ['CLAUSE-STATUSES', 'S1', ['Safety'], '门禁联锁', '防护门打开时停止危险运动，复位后方可恢复。', 1],
      ['CLAUSE-STATUSES', 'F1', ['Facility'], '公用设施接口', '提供设备电力、冷却水和排风接口要求，注明额定值及允许范围。', 1],
      ['CLAUSE-STATUSES', 'F2', ['Facility'], '安装条件', '安装位置应预留设备维护空间，具体尺寸见布局附件。', 1],
    ] : []),
  ];
  const customerRows = examples.map(([key, clause, sectionPath, title, original, sourcePage], i) => {
    const sourceFile = customerFiles.find(f => f.id === id(key));
    return { id: `${projectId}-DOC-EXAMPLE-${i}`, clause, sectionPath, title, original,
      sourceOriginal: original, source: sourceFile.name, sourceFileId: sourceFile.id,
      sourceVersion: sourceFile.version, sourcePage, sourceOrder: i, sourceAnchor: `paragraph-${i + 1}`,
      category: '', conclusion: '待确认', status: '待确认', owner: '技术确认人',
      draft: '', evidence: '', conditions: '', remark: '', matchLevel: 'none', score: 0, version: 1,
      parserNote: '模拟 Word 章节识别，原始编号保留',
    };
  });
  customerFiles.forEach(f => { f.parsedCount = customerRows.filter(r => r.sourceFileId === f.id).length; });
  return { files: [...customerFiles, ...files], parsed: [...customerRows, ...parsed] };
}
