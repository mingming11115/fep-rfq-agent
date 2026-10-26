import React, { useState } from 'react';
import { MessageSquareText, RefreshCw, Check } from 'lucide-react';

export default function RecommendedWording({ recommendation, currentDraft, canEdit, onAdopt }) {
  const [wording, setWording] = useState(recommendation);
  const adopted = !!wording.trim() && wording.trim() === (currentDraft || '').trim();
  return <section className="response-wording" aria-label="推荐话术建议">
    <div className="response-wording-heading"><h3><MessageSquareText size={15}/>推荐话术</h3><span>{adopted ? '已采用为应答草稿' : '根据当前结论生成'}</span></div>
    <textarea className="input" aria-label="推荐话术" value={wording} readOnly={!canEdit} onChange={event => setWording(event.target.value)}/>
    <div className="response-wording-footer"><small>可结合适用条件和备注修改，采用后随应答提交保存。</small><div><button type="button" className="text-link" disabled={!canEdit} onClick={() => setWording(recommendation)}><RefreshCw size={12}/>重新生成</button><button type="button" className="btn btn-sm" disabled={!canEdit || !wording.trim() || adopted} onClick={() => onAdopt(wording.trim())}><Check size={13}/>{adopted ? '已采用' : '采用话术'}</button></div></div>
  </section>;
}
