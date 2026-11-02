import {compareParameter} from './rfqWorkflow.js';

const conclusionLabels={Comply:'满足','有条件 Comply':'有条件满足','不满足':'不满足','不适用':'不适用','待确认':'待确认'};
export const SOURCE_ANNOTATION_CONCLUSIONS=Object.keys(conclusionLabels);
const operators={'<=':'≤','>=':'≥','=':'='};

export function selectSourceResponseAnnotations(rows=[], {responseRows=[],responsePreview,conclusions=SOURCE_ANNOTATION_CONCLUSIONS,currentOnly=false,activeId}={}) {
  const responses=new Map(responseRows.map(row=>[row.id,row]));
  return rows.filter(row=>!currentOnly||row.id===activeId).map(row=>({row,annotation:buildSourceResponseAnnotation(row,responsePreview?.id===row.id?responsePreview:responses.get(row.id))}))
    .filter(note=>conclusions.includes(note.annotation.conclusion));
}

export function buildSourceResponseAnnotation(row = {}, response = row) {
  const current = { ...row, ...response };
  const value = String(current.conclusion || '').trim();
  const conclusion = Object.hasOwn(conclusionLabels, value) ? value : '待确认';
  if (conclusion === 'Comply') return { kind: 'comply', label: 'Comply', conclusion, wording: '' };
  return {
    kind: 'recommendation', label: '推荐话术', conclusion,
    wording: generateRecommendedWording({ ...current, conclusion }),
  };
}

export function generateRecommendedWording(row = {}) {
  const conclusion = String(row.conclusion || '').trim();
  if (!['有条件 Comply', '不满足', '不适用', '待确认'].includes(conclusion)) return '';
  const text = (value) => String(value || '').trim().replace(/[。；;]+$/, '');
  const subject = `针对${row.clause ? `条款 ${row.clause} ` : ''}${row.title ? `“${row.title}”` : '本项要求'}`;
  const conditions = text(row.conditions), reason = text(row.reason);
  const context = [conditions && `适用条件：${conditions}。`, reason && `说明：${reason}。`];
  if (conclusion === '有条件 Comply') return [
    `${subject}，本项按有条件响应处理。`,
    ...context,
    !conditions && '具体适用条件尚待确认。',
    '请双方确认上述条件及实施范围后，再确定最终应答。',
  ].filter(Boolean).join('\n');
  if (conclusion === '不满足') return [
    `${subject}，当前方案无法满足本项要求。`,
    ...context,
    '建议双方进一步明确可接受的替代方案及其适用条件，以双方确认结果为准。',
  ].filter(Boolean).join('\n');
  if (conclusion === '不适用') return [
    `${subject}，本项拟按不适用处理。`,
    reason ? `不适用依据：${reason}。` : '具体不适用范围及依据尚待确认。',
    conditions && `适用范围说明：${conditions}。`,
    '如项目范围调整，需重新核对本项要求。',
  ].filter(Boolean).join('\n');
  return [
    `${subject}，本项尚待核实，暂不作出满足性承诺。`,
    ...context,
    '待相关信息与依据确认后，再提供正式答复。',
  ].filter(Boolean).join('\n');
}

// This is a display model. It never changes a person's saved answer or approval.
export function buildResponseAdvice(row={},suggestion={}, {check=null,retrieval='normal'}={}) {
  const pending=(reference,checks)=>({conclusion:'待确认',reference,evidence:'',checks});
  if(row.removedFromSource)return {conclusion:'不适用',reference:'客户新版已删除此条款',evidence:'',checks:['核对本轮应答范围并填写不适用依据']};
  if(row.sourceRevision||row.sourceCorrected)return pending('来源内容已变化',['按当前来源版本重新匹配并核对参考答复']);
  if(retrieval==='failed')return pending('本次检索未完成',['重新匹配后核对参考答复']);
  if(retrieval==='denied')return pending('暂无可访问的参考资料',['由具备资料访问权限的人员核对本条要求']);
  const source={standard:Number(row.score)>80?'标准回复':null,history:'历史应答',capability:'机型能力'}[row.matchLevel];
  if(!source)return pending('暂无可用参考依据',[row.reason?.trim()||`补充“${row.title||'本条要求'}”的能力证据或专业评审结论`]);
  const checks=[];
  if(check){
    const comparison=compareParameter(check);
    if(comparison.status!=='pass'&&Number.isFinite(comparison.normalizedCapability)){
      const gap=comparison.difference>0?`，差距 ${comparison.difference} ${check.requested.unit}`:'';
      checks.push(`${check.label}：要求 ${operators[check.requested.operator]||check.requested.operator}${check.requested.value} ${check.requested.unit}，当前能力 ${comparison.normalizedCapability} ${check.requested.unit}${gap}`);
    }else if(comparison.status!=='pass')checks.push(comparison.reason);
    if(check.contextMatches!==true&&check.conditions)checks.push(`确认适用条件：${check.conditions}`);
  }
  if(suggestion.conditions?.trim())checks.push(`确认适用条件：${suggestion.conditions.trim()}`);
  const references=new Map();
  for(const value of [suggestion.evidence,check?.evidence]){
    if(!value?.trim())continue;
    const text=value.trim(),identity=text.replace(/[；;]非真实[^；;]*/g,'').trim();
    if(!references.has(identity))references.set(identity,text);
  }
  const evidence=[...references.values()].join('；');
  if(!evidence)checks.push(`补充“${row.title||'本条要求'}”的证据编号、版本和定位`);
  return {
    conclusion:conclusionLabels[suggestion.conclusion]||'待确认',
    reference:`${source}${suggestion.version?` ${suggestion.version}`:''}`,
    evidence,
    checks:[...new Set(checks)],
  };
}
