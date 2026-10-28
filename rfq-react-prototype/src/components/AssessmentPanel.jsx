import React from 'react';
import { makeRequirements } from '../data';
import { buildResponseAdvice } from '../responseAdvice';
export default function AssessmentPanel({ row, project, suggestion, retrieval, onOpenReference }) {
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
  const advice=buildResponseAdvice(row,suggestion,{check,retrieval});
  const candidateEvidence = suggestion.evidence?.trim() || '';
  const supportingEvidence = candidateEvidence && advice.evidence.startsWith(candidateEvidence)
    ? advice.evidence.slice(candidateEvidence.length).replace(/^；/, '')
    : advice.evidence;
  return <section className="response-advice" aria-label="应答建议">
    <h3>应答建议</h3>
    <dl>
      <dt>建议结论</dt><dd><strong>{advice.conclusion}</strong></dd>
      <dt>建议来源</dt><dd><div>{advice.reference}</div>{advice.evidence&&onOpenReference&&<button className="text-link response-advice-evidence" onClick={onOpenReference}>查看候选参考依据</button>}</dd>
      {supportingEvidence&&<><dt>核实资料</dt><dd>{supportingEvidence}</dd></>}
      {advice.checks.length>0&&<><dt>待核实</dt><dd><ul>{advice.checks.map(item=><li key={item}>{item}</li>)}</ul></dd></>}
    </dl>
    {row.previousOriginal&&<details><summary>查看变更前要求</summary><p>{row.previousOriginal}</p></details>}
  </section>;
}
