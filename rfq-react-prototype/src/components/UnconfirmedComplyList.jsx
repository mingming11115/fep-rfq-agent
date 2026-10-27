import React from 'react';

export default function UnconfirmedComplyList({rows=[],onLocate,frozen=false}) {
  if(!rows.length)return null;
  return <section className="flow-unconfirmed-comply" aria-label="系统推荐Comply未人工确认">
    <div className="flow-unconfirmed-heading"><h3>系统推荐 Comply · 未人工确认</h3><span>{rows.length} 条</span></div>
    <p>{frozen?'以下条目在本轮发起时未逐条人工确认，请优先核对冻结的答复和依据。':'以下条目可直接送最终评审，请由本轮评审人员重点核对。其余条目须先完成人工确认。'}</p>
    <div className="flow-unconfirmed-rows">{rows.map(row=><article key={row.id} data-requirement-id={row.id}>
      <div><strong>{row.clause} {row.title}</strong><span className="badge warning">未人工确认</span></div>
      <p>{row.original}</p><dl><dt>当前答复</dt><dd>{row.draft}</dd><dt>参考依据</dt><dd>{row.evidence}</dd></dl>
      {onLocate&&<button className="text-link" onClick={()=>onLocate(row)}>定位核对</button>}
    </article>)}</div>
  </section>;
}
