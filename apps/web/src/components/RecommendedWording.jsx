import { UiTextArea, UiButton } from './AntContent';
import React, { useState } from 'react';
import { Sparkles, RefreshCw, Check } from "./icons";

export default function RecommendedWording({ recommendation, currentDraft, canEdit, onAdopt }) {
  const [wording, setWording] = useState(recommendation);
  const adopted = !!wording.trim() && wording.trim() === (currentDraft || '').trim();
  return <section className="response-wording" aria-label="AI 推荐话术">
    <div className="response-wording-heading"><div className="response-advice-heading"><span className="response-advice-avatar"><Sparkles size={16} aria-hidden="true"/></span><h3>AI 推荐话术</h3></div><span>{adopted ? '已采用为应答草稿' : '根据当前结论模拟生成'}</span></div>
    <UiTextArea className="input" aria-label="推荐话术" value={wording} readOnly={!canEdit} onChange={event => setWording(event.target.value)}/>
    <div className="response-wording-footer"><div><UiButton type="button" className="text-link" disabled={!canEdit} onClick={() => setWording(recommendation)}><RefreshCw size={12}/>重新生成</UiButton><UiButton type="button" className="btn btn-sm" disabled={!canEdit || !wording.trim() || adopted} onClick={() => onAdopt(wording.trim())}><Check size={13}/>{adopted ? '已采用' : '采用话术'}</UiButton></div></div>
  </section>;
}
