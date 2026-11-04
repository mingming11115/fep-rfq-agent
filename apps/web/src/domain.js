import { canReviewWithoutManualConfirmation, captureSystemRecommendation, getUnconfirmedComplyRows } from './responseRecommendation.js';

const FINAL_CONCLUSIONS = new Set(['Comply', '有条件 Comply', '不满足', '不适用']);
const MATERIAL_FIELDS = ['original', 'conclusion', 'draft', 'conditions', 'evidence', 'reason', 'owner'];
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

export function importParsedRequirements(existing, parsed) {
  const rows = new Map(existing.map((row) => [row.id, row]));
  for (const row of parsed) {
    if (rows.has(row.id)) continue;
    const added = { ...row, systemRecommendation: structuredClone(row.systemRecommendation || captureSystemRecommendation(row)), status: '待确认' };
    delete added.confirmedAt;
    delete added.confirmedBy;
    rows.set(row.id, added);
  }
  return [...rows.values()];
}

export function correctParsedRequirement(row, patch, reason) {
  const fields = ['clause', 'title', 'original', 'category', 'sourcePage'];
  const corrected = { ...row };
  for (const key of fields) if (Object.hasOwn(patch, key)) corrected[key] = String(patch[key] ?? '').trim();
  if (['title', 'original', 'sourcePage'].some((key) => !String(corrected[key] ?? '').trim())) throw new Error('请完整填写标题、要求原文和来源页码');
  if (!fields.some((key) => String(row[key] ?? '') !== String(corrected[key] ?? ''))) return row;
  if (!hasText(reason)) throw new Error('请填写字段修改原因');
  return {
    ...corrected, sourceOriginal: row.sourceOriginal ?? row.original, sourceCorrected: true,
    previousOriginal: row.original, status: '待确认', version: (row.version || 1) + 1,
    matchLevel: 'none', score: 0, confirmedAt: undefined, confirmedBy: undefined,
    parseHistory: [...(row.parseHistory || []), { time: new Date().toISOString(), action: 'correct', reason: reason.trim() }],
  };
}

export function confirmationValidation(row) {
  const issues = [];
  if (row.removedFromSource && row.conclusion !== '不适用') issues.push('客户新版已删除此条款，请确认不适用范围处置');
  if (!hasText(row.original)) issues.push('请填写客户要求原文');
  if (!FINAL_CONCLUSIONS.has(row.conclusion)) issues.push('请选择明确的最终结论，待确认不能作为最终处置');
  if (row.conclusion === '不适用' && !hasText(row.reason)) issues.push('选择不适用时，请说明不适用范围依据');
  return issues;
}

export function requirementValidation(row) {
  const issues = confirmationValidation(row);
  if (!hasText(row.draft)) issues.push('请填写对外答复');
  if (row.conclusion === '有条件 Comply' && !hasText(row.conditions)) issues.push('有条件 Comply 必须填写适用条件');
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
  const issues = confirmationValidation(row);
  if (issues.length) throw new Error(issues.join('；'));
  return { ...row, status: '已确认', needsReview:false,sourceRevision:false,sourceCorrected:false,confirmationReason:undefined,confirmedAt: new Date().toISOString() };
}

export function getExportIssues(requirements = [], reviews = [], projectId) {
  const issues = [];
  if (requirements.length === 0) issues.push({ id: 'empty-requirements', label: '应答矩阵', message: '尚无可提交的要求条目，请先解析并确认客户要求' });
  for (const row of requirements) {
    const messages = requirementValidation(row);
    if(row.pendingReviewProposal)messages.push('评审或澄清建议尚未核对');
    if (row.status !== '已确认' && !canReviewWithoutManualConfirmation(row,projectId)) messages.unshift('条目尚未完成内部确认；系统未推荐 Comply 的条目须人工确认');
    if (messages.length) issues.push({ id: row.id,objectType:'requirement',objectId:row.id,route:{page:'response',requirementId:row.id,fileId:row.sourceFileId,sourceVersion:row.sourceVersion}, label: `${row.clause || ''} ${row.title || '要求条目'}`.trim(), message: messages.join('；') });
  }
  for (const review of reviews) {
    if (!['已关闭','已取消'].includes(review.status)) issues.push({ id: review.id,objectType:'review',objectId:review.id,route:{page:'reviews',reviewId:review.id,requirementId:review.requirementId}, label: review.title || '评审事项', message: `关联评审尚未关闭（${review.status || '待处理'}），请完成全部评审确认` });
  }
  return issues;
}

export function makeSnapshot(projectId, requirements, actorRole) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return {
    id: `SNAP-${id}`, projectId, status: '审批中',
    createdAt: new Date().toISOString(), createdBy: actorRole,
    rows: structuredClone(requirements),
    unconfirmedComplyIds: getUnconfirmedComplyRows(requirements,projectId).map(row=>row.id),
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
