const FINAL_CONCLUSIONS = new Set(['Comply', '有条件 Comply', '不满足', '不适用']);
const MATERIAL_FIELDS = ['original', 'conclusion', 'draft', 'conditions', 'evidence', 'reason', 'owner'];
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

export function requirementValidation(row) {
  const issues = [];
  if (!hasText(row.original)) issues.push('请填写客户要求原文');
  if (!hasText(row.draft)) issues.push('请填写对外答复');
  if (!hasText(row.owner)) issues.push('请分派确认责任人');
  if (!FINAL_CONCLUSIONS.has(row.conclusion)) issues.push('请选择明确的最终结论，待确认不能作为最终处置');
  if (row.conclusion === '有条件 Comply' && !hasText(row.conditions)) issues.push('有条件 Comply 必须填写适用条件');
  if (row.conclusion === '不适用' && !hasText(row.reason)) issues.push('不适用必须填写范围依据');
  if (['Comply', '有条件 Comply'].includes(row.conclusion) && !hasText(row.evidence)) issues.push('满足类结论必须关联有效证据');
  return issues;
}

export function applyRequirementEdit(row, patch) {
  const updated = { ...row, ...patch };
  const materialChange = MATERIAL_FIELDS.some((field) => row[field] !== updated[field]);
  updated.version = materialChange ? (row.version || 1) + 1 : row.version;
  if (materialChange && row.status === '已确认') {
    updated.status = '待确认';
    delete updated.confirmedAt;
    delete updated.confirmedBy;
  }
  return updated;
}

export function confirmRequirement(row) {
  const issues = requirementValidation(row);
  if (issues.length) throw new Error(issues.join('；'));
  return { ...row, status: '已确认', confirmedAt: new Date().toISOString() };
}

export function getExportIssues(requirements = [], reviews = []) {
  const issues = [];
  if (requirements.length === 0) issues.push({ id: 'empty-requirements', label: '应答矩阵', message: '尚无可提交的要求条目，请先解析并确认客户要求' });
  for (const row of requirements) {
    const messages = requirementValidation(row);
    if (row.status !== '已确认') messages.unshift('条目尚未完成内部确认');
    if (messages.length) issues.push({ id: row.id, label: `${row.clause || ''} ${row.title || '要求条目'}`.trim(), message: messages.join('；') });
  }
  for (const review of reviews) {
    if (review.status !== '已关闭') issues.push({ id: review.id, label: review.title || '评审事项', message: `关联评审尚未关闭（${review.status || '待处理'}），请完成处理及所需批准` });
  }
  return issues;
}

export function makeSnapshot(projectId, requirements, actorRole) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return {
    id: `SNAP-${id}`, projectId, status: '审批中',
    createdAt: new Date().toISOString(), createdBy: actorRole,
    rows: structuredClone(requirements),
  };
}

function csvCell(value) {
  let text = String(value ?? '');
  // Preserve the supplied text; prefix an apostrophe if a spreadsheet could execute it.
  if (/^[\s\uFEFF]*[=+@-]/u.test(text)) text = `'${text}`;
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows) {
  const fields = ['clause', 'original', 'conclusion', 'draft', 'conditions', 'status'];
  const header = '条款,客户要求,应答结论,对外答复,适用条件,确认状态';
  return [header, ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(','))].join('\r\n');
}
