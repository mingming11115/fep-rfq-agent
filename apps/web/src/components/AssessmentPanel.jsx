import { UiButton } from './AntContent';
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles, RefreshCw, Check } from "./icons";
import { makeRequirements } from '../data';
import { RESPONSE_CONCLUSIONS } from '../domain';
import { singleLineReply } from '../responseFields';
import { reviewEvidenceHref } from '../reviewRequest';
import { buildResponseAdvice } from '../responseAdvice';
import { Button, Input, Radio, Space } from 'antd';
export default function AssessmentPanel({ row, project, suggestion, retrieval, onOpenReference, sourceScope,
  recommendation, evidence, currentDraft, canEdit, onAdopt, conclusion, onConclusionChange, responseAnswer, liveAdvice, children }) {
  const [editedWording, setEditedWording] = useState(null);
  const [regenerateHint, setRegenerateHint] = useState('');
  const regenerateTimer = useRef(null);
  useEffect(() => () => clearTimeout(regenerateTimer.current), []);
  function regenerate() {
    if (!canEdit) { return; }
    setEditedWording(null);
    const hasRecommendation = !!String(recommendation || '').trim();
    setRegenerateHint(hasRecommendation ? '已重新生成推荐话术' : '当前结论暂无可生成的话术，请先选择应答结论');
    clearTimeout(regenerateTimer.current);
    regenerateTimer.current = setTimeout(() => setRegenerateHint(''), 3000);
  }
  const wording = editedWording ?? recommendation ?? '';
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
  const advice = liveAdvice ?? buildResponseAdvice(row, suggestion || {}, {check, retrieval});
  const suggested = advice.conclusion && advice.conclusion !== '待确认' ? advice.conclusion : '';
  const linkedEvidence = advice.evidence?.trim() || (liveAdvice ? String(evidence || '').trim() : '');
  const evidenceHref = /^https?:\/\//i.test(linkedEvidence) ? reviewEvidenceHref(linkedEvidence) : '';
  const replyToAdopt = singleLineReply(wording).trim();
  const adopted = !!replyToAdopt && replyToAdopt === singleLineReply(currentDraft).trim();
  const hasWording = typeof recommendation === 'string';
  return <section className="response-advice response-wide">
    {onConclusionChange && <>
      <header className="response-advice-heading"><h3>应答结论 <i className="response-required" aria-hidden="true">*</i></h3></header>
      <Radio.Group aria-label="应答结论" aria-required="true" className="rfq-conclusion-radio"
        value={conclusion} disabled={!canEdit} options={RESPONSE_CONCLUSIONS}
        onChange={event => onConclusionChange(event.target.value)}/>
    </>}
    {responseAnswer}
    <details className="response-reference-details" key={JSON.stringify([project.id,row.id,sourceScope?.fileId??row.sourceFileId??row.source,String(sourceScope?.sourceVersion??row.sourceVersion??'1')])}>
      <summary>
        <Sparkles size={14} aria-hidden="true"/>
        <strong>{suggested ? `AI 建议：${suggested}` : 'AI 暂无明确建议'}</strong>
        <span>查看依据</span><ChevronDown size={13} aria-hidden="true"/>
      </summary>
      <div className="response-reference-body">
        <dl>
          <dt>AI 建议来源</dt>
          <dd>{advice.reference || '暂无可用参考依据'}{advice.runId && ` · ${advice.runId}`}
            {advice.evidence && onOpenReference && <UiButton className="text-link response-advice-evidence" onClick={onOpenReference}>查看候选参考依据</UiButton>}
          </dd>
          {linkedEvidence && <>
            <dt>本条关联证据</dt>
            <dd aria-label="本条关联证据">{linkedEvidence}
              {evidenceHref && <a className="text-link" aria-label="打开本条关联证据" href={evidenceHref} target="_blank" rel="noopener noreferrer">查看来源 ↗</a>}
            </dd>
          </>}
        </dl>
        {row.parserNote && <p role="note">解析提示：{row.parserNote}</p>}
        {children}
      </div>
    </details>
    {hasWording && <section className="response-wording-inner" aria-label="AI 推荐话术">
      <h4 className="response-wording-heading"><Sparkles size={15} aria-hidden="true"/>AI 推荐话术</h4>
      <Input.TextArea aria-label="推荐话术" autoSize={{ minRows: 3, maxRows: 6 }} value={wording} readOnly={!canEdit}
        placeholder="选择应答结论后生成推荐话术" onChange={event => setEditedWording(event.target.value)}/>
      <div className="response-wording-footer">
        <Space size={8} wrap>
          <Button type="link" size="small" icon={<RefreshCw size={12}/>} disabled={!canEdit} onClick={regenerate}>重新生成</Button>
          <Button size="small" icon={<Check size={13}/>} disabled={!canEdit || !replyToAdopt || adopted} onClick={() => onAdopt?.(replyToAdopt)}>{adopted ? '已采用' : '采用话术'}</Button>
          {regenerateHint && <span className="response-regen-hint" role="status">{regenerateHint}</span>}
        </Space>
      </div>
    </section>}
    {row.previousOriginal&&<details><summary>查看变更前要求</summary><p>{row.previousOriginal}</p></details>}
  </section>;
}
