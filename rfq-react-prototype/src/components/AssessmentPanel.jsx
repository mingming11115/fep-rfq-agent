import React from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { makeRequirements } from '../data';
import { compareParameter } from '../rfqWorkflow';
const operator = { '<=': '≤', '>=': '≥', '=': '=' };
export default function AssessmentPanel({ row, project, onReview, onOpenEvidence }) {
  const original = makeRequirements(project.id).find((item) => item.id === row.id);
  const unchangedSource = !row.sourceRevision && !row.sourceCorrected && original?.original === row.original;
  const fixtures = {
    '2.2': { label: '最大切缝宽度', requested: { value: 50, unit: 'μm', operator: '<=' }, capability: { value: 0.06, unit: 'mm' }, contextMatches: false, conditions: '能力样例基于硅材料；客户材料与选配 X 尚未明确', evidence: '模拟测试报告 CUT-060 V1 · 第 4 页' },
    '4.1': { label: '交货周期', requested: { value: 8, unit: '周', operator: '<=' }, capability: { value: 12, unit: '周' }, contextMatches: true, conditions: '双方均以合同生效日为起算点；模拟排产基线', evidence: '模拟排产基线 SCH-2026-10 V1' },
  };
  const bhelFixtures = {
    'BHEL-REQ-029': { label: '最大切缝宽度', requested: { value: 50, unit: 'μm', operator: '<=' }, capability: { value: 0.06, unit: 'mm' }, contextMatches: false, conditions: '客户要求为真实值；60 μm为模拟能力，1.2 mm硅晶圆验证尚未完成', evidence: '模拟试切记录 DEMO-YAG-060；非真实能力证明' },
    'BHEL-REQ-003': { label: '设备交付周期', requested: { value: 12, unit: '周', operator: '<=' }, capability: { value: 16, unit: '周' }, contextMatches: true, conditions: '均以BHEL采购订单日期起算；16周为模拟排产', evidence: '模拟排产基线 DEMO-SCH-016；非真实交期承诺' },
  };
  const check = unchangedSource ? (row.realSource ? bhelFixtures[row.id] : fixtures[row.clause]) : null;
  const result = check ? compareParameter(check) : { status: 'pending', label: row.removedFromSource ? '来源已删除' : '待专业核对', reason: row.sourceRevision || row.sourceCorrected ? '客户条款已变化，原匹配不能沿用，需重新核对能力依据' : '当前条款无结构化数值规则，请结合右侧依据核对范围与条件' };
  return <section className={`rfq-assessment ${result.status}`} aria-label="条目差距与依据"><div className="rfq-section-title"><ShieldCheck size={15}/><strong>条目差距与依据</strong><span className={`rfq-result ${result.status}`}>{result.label}</span></div>{check && <><div className="rfq-metric-grid"><div><small>客户要求 · {check.label}</small><b>{operator[check.requested.operator]}{check.requested.value} {check.requested.unit}</b></div><div><small>当前能力</small><b>{check.capability.value} {check.capability.unit}</b><small>折算 {result.normalizedCapability} {check.requested.unit}</small></div></div>{result.difference > 0 && <p className="rfq-gap">数值差距 {result.difference} {result.unit}{result.status === 'pending' ? '，条件尚未一致，暂不判定满足或不满足' : ''}</p>}<p><b>适用条件：</b>{check.conditions}</p><button className="text-link rfq-evidence" onClick={onOpenEvidence}>{check.evidence}</button><small className="rfq-demo-note">结构化演示数据，用于展示单位换算与条件判断。</small></>}<p className="rfq-assessment-reason"><AlertCircle size={13}/>{result.reason}</p>{row.previousOriginal && <details><summary>查看变更前要求</summary><p>{row.previousOriginal}</p></details>}{onReview && <button className="text-link" onClick={onReview}>补证 / 发起专业评审</button>}</section>;
}
