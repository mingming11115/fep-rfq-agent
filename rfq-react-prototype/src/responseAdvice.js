import {compareParameter} from './rfqWorkflow.js';

const conclusionLabels={Comply:'满足','有条件 Comply':'有条件满足','不满足':'不满足','不适用':'不适用','待确认':'待确认'};
const operators={'<=':'≤','>=':'≥','=':'='};

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
