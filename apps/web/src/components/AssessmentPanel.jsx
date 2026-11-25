import React from 'react';
import { ChevronDown, Sparkles } from "./icons";
import { RESPONSE_CONCLUSIONS } from '../domain';
import { buildResponseAdvice } from '../responseAdvice';
import { Radio } from 'antd';
export default function AssessmentPanel({ row, project, suggestion, retrieval, sourceScope,
  canEdit, conclusion, onConclusionChange, responseAnswer, liveAdvice, children }) {
  const advice = liveAdvice ?? buildResponseAdvice(row, suggestion || {}, {retrieval});
  const suggested = advice.conclusion && advice.conclusion !== '待确认' ? advice.conclusion : '';
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
        <strong>{suggested ? `AI 建议：${suggested}` : 'AI 建议：无'}</strong>
        <ChevronDown size={13} aria-hidden="true"/>
      </summary>
      <div className="response-reference-body">
        {suggested ? <p role="note">模型结论：{advice.conclusion}</p>
          : row.parserNote && <p role="note">解析提示：{row.parserNote}</p>}
        {children}
      </div>
    </details>
    {row.previousOriginal&&<details><summary>查看变更前要求</summary><p>{row.previousOriginal}</p></details>}
  </section>;
}
