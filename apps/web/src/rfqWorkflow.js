const units = { 'μm': ['length', 1], 'µm': ['length', 1], um: ['length', 1], mm: ['length', 1000], '周': ['time', 7], '天': ['time', 1], '%': ['percent', 1] };
const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
export function compareParameter(check) {
  const { requested = {}, capability = {}, evidence, contextMatches } = check;
  const pending = (reason) => ({ status: 'pending', label: '待澄清', reason });
  if (requested.value === '' || requested.value == null || capability.value === '' || capability.value == null) return pending('参数或能力值缺失');
  const requestUnit = units[requested.unit], capabilityUnit = units[capability.unit];
  if (!requestUnit || !capabilityUnit || requestUnit[0] !== capabilityUnit[0]) return pending('单位或指标类型不兼容，需核对');
  const expected = Number(requested.value), actual = Number(capability.value) * capabilityUnit[1] / requestUnit[1];
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) return pending('参数不是可比较的数值');
  const difference = Number(Math.abs(actual - expected).toFixed(6));
  if (!['<=', '>=', '='].includes(requested.operator)) return pending('比较规则尚未明确');
  const fits = requested.operator === '<=' ? actual <= expected + 1e-9 : requested.operator === '>=' ? actual >= expected - 1e-9 : Math.abs(actual - expected) < 1e-9;
  const result = { difference, unit: requested.unit, normalizedCapability: actual };
  if (!clean(evidence) || contextMatches !== true) return { ...result, ...pending(!clean(evidence) ? '缺少有效证据' : '材料、配置或测试条件尚未一致') };
  return { ...result, status: fits ? 'pass' : 'gap', label: fits ? '参数符合' : '存在偏离', reason: fits ? '数值及适用条件一致，仍需确认应答' : `超出要求边界 ${difference} ${requested.unit}` };
}
export function getReviewRoute(row, config = {}) {
  const category = row?.category || '技术';
  const key = ({ 商务: 'business', 质量: 'quality', 服务: 'service' })[category] || 'technical';
  const defaults = { business: '商务确认人', quality: '质量确认人', service: '服务确认人', technical: '技术确认人' };
  const owner = Object.hasOwn(config, key) ? config[key] : defaults[key];
  return { owner, approver: Object.hasOwn(config, 'final') ? config.final : '最终审批人', rule: `${category}类要求分派`, reasons: [`要求类别：${category}`, ...(row?.conclusion === '不满足' ? ['存在明确能力或交付偏离'] : row?.conclusion === '有条件 Comply' ? ['承诺依赖附加条件'] : row?.matchLevel === 'none' ? ['缺少可用依据，需补证'] : ['评审事项'])] };
}
function indexRows(rows) {
  const index = new Map();
  for (const row of rows) {
    const clause = clean(row.clause);
    if (!clause || !clean(row.original)) throw new Error('每条要求必须填写条款编号和原文');
    if (index.has(clause)) throw new Error(`条款编号重复：${clause}`);
    index.set(clause, row);
  }
  return index;
}
export function diffRfqRequirements(existing, incoming) {
  if (!Array.isArray(incoming) || !incoming.length) throw new Error('至少提供一条新版要求，空文件不能推断为全部删除');
  const mapped=incoming.some(r=>r.previousId||existing.some(old=>old.id===r.id));
  let previous,next;
  if(mapped){previous=new Map(existing.map(r=>[r.id,r]));next=new Map();incoming.forEach((row,i)=>{let key=row.previousId||(previous.has(row.id)?row.id:null);if(!key&&!incoming.some(r=>r.previousId)){const clause=clean(row.clause);if(clause&&existing.filter(r=>clean(r.clause)===clause).length<=1&&incoming.filter(r=>clean(r.clause)===clause).length===1)key=existing.find(r=>clean(r.clause)===clause)?.id||'new';}if(!key)throw new Error('每条新版要求都需指定原条款 ID，新增项填写 new');if(key!=='new'&&!previous.has(key))throw new Error('原条款 ID 不存在，请人工核对映射');const id=key==='new'?`new:${i}`:key;if(next.has(id))throw new Error('同一旧条款不能重复映射');if(!clean(row.original))throw new Error('每条要求必须填写原文');next.set(id,row);});}
  else {previous=indexRows(existing);next=indexRows(incoming);}
  const changes = [...next].map(([clause, after]) => {
    const before = previous.get(clause);
    const modified = before && (before.removedFromSource || ['clause','original', 'title', 'category'].some((key) => clean(before[key]) !== clean(after[key])));
    return { clause:after.clause, before, after, kind: !before ? 'added' : modified ? 'modified' : 'unchanged' };
  });
  for (const [clause, before] of previous) if (!next.has(clause) && !before.removedFromSource) changes.push({ clause, before, after: null, kind: 'removed' });
  return changes;
}
export function applyRfqRevision(existing, incoming, reason, source, config = {}) {
  if (!clean(reason) || !clean(source)) throw new Error('请填写新版来源与变更原因');
  const changes = diffRfqRequirements(existing, incoming), affectedIds = [];
  const rows = changes.map(({ before, after, kind }) => {
    if (kind === 'unchanged') return before;
    const id = before?.id || `REQ-${globalThis.crypto.randomUUID()}`;
    affectedIds.push(id);
    const row = { ...(before || { conclusion: '待确认', draft: '', conditions: '', evidence: '', matchLevel: 'none', score: 0 }), ...(after ? { clause: clean(after.clause), title: clean(after.title), category: after.category || before?.category || '技术', original: after.original } : {}), id, status: '待确认', matchLevel: 'none', score: 0, version: (before?.version || 0) + 1, source, sourceFileId:after?.sourceFileId||before?.sourceFileId||source,sourceVersion:after?.sourceVersion||`${before?.sourceVersion||'V1'}-r${(before?.version||0)+1}`,sourceOriginal:after?.original||before?.sourceOriginal||before?.original,needsReview:true,readyForConfirmation:false,pendingReviewProposal:null, previousOriginal: before?.original || '', sourceChange: kind, removedFromSource: kind === 'removed', reason, sourceRevision: true };
    if (!before || before.category !== row.category || !row.owner) row.owner = getReviewRoute(row, config).owner;
    delete row.confirmedAt; delete row.confirmedBy;
    return row;
  });
  // Retain already-retired clauses as historical records across subsequent revisions.
  for (const old of existing) if (old.removedFromSource && !rows.some((row) => row.id === old.id)) rows.push(old);
  return { rows, changes, affectedIds };
}
export function refreshReviewForRevision(review, before, after, config = {}) {
  if (review.status === '已关闭') return review;
  const routing = getReviewRoute(after, config);
  return { ...review, version:(review.version||1)+1,round:(review.round||1)+1,status: '待处理', routing, owner: before?.category !== after?.category ? routing.owner : review.owner, submittedAt: undefined, submittedBy: undefined, submittedById:undefined,requirementVersion:undefined,requirementAtSubmission:undefined,approvedAt: undefined, approvedBy: undefined,approvedById:undefined };
}
