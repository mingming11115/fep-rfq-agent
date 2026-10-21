import { makeRequirements } from './data.js';

// Synthetic metadata only: no original customer files are stored or read.
export function makeDocumentDemo(projectId, requirements = makeRequirements(projectId)) {
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
  const parsed = requirements.map((row) => {
    const sourceFile = files.find((item) => item.id === id(row.category === '商务' ? 'BIZ-2' : 'TECH-3'));
    return { ...row, source: sourceFile.name, sourceFileId: sourceFile.id, sourceVersion: sourceFile.version };
  });
  for (const sourceFile of files) {
    if (sourceFile.purpose === '要求来源' && sourceFile.status !== '失败') {
      sourceFile.parsedCount = parsed.filter((row) => row.sourceFileId === sourceFile.id).length;
    }
  }
  return { files, parsed };
}
