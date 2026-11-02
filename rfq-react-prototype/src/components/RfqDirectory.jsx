import React,{useId,useState} from 'react';
import {X} from './icons';

export default function RfqDirectory({children,documentOutline,onNavigateHeading,onClose}){
  const [tab,setTab]=useState('clauses');
  const id=useId(),outline=documentOutline||{},headings=outline.items||[];
  const tabs=[['clauses','条款'],['headings','文档标题']];
  function navigateTabs(event){
    const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(event.key))return;
    event.preventDefault();const index=tabs.findIndex(([key])=>key===tab);
    const next=event.key==='Home'?0:event.key==='End'?1:(index+(event.key==='ArrowRight'?1:-1)+2)%2;
    setTab(tabs[next][0]);event.currentTarget.querySelectorAll('[role="tab"]')[next]?.focus();
  }
  return <aside className="detail-outline" aria-label="文件目录">
    <div className="detail-outline-heading"><strong>文件目录</strong><button type="button" className="icon-btn" aria-label="关闭文档目录" onClick={onClose}><X size={15}/></button></div>
    <div className="rfq-directory-tabs" role="tablist" aria-label="目录视图" onKeyDown={navigateTabs}>
      {tabs.map(([key,label])=><button type="button" key={key} id={`${id}-${key}-tab`} role="tab" aria-controls={`${id}-${key}`} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)}>{label}</button>)}
    </div>
    <div className="rfq-directory-content" role="tabpanel" id={`${id}-clauses`} aria-labelledby={`${id}-clauses-tab`} hidden={tab!=='clauses'}>{children}</div>
    <div className="rfq-directory-content" role="tabpanel" id={`${id}-headings`} aria-labelledby={`${id}-headings-tab`} hidden={tab!=='headings'}>
      {!outline.ready?<p className="rfq-directory-empty" role="status">正在读取文档标题…</p>:outline.supported===false?<p className="rfq-directory-empty">当前文件不提供文档标题，可切换到“条款”导航。</p>:!headings.length?<p className="rfq-directory-empty">没有可导航的文档标题，可切换到“条款”导航。</p>:<nav className="rfq-document-headings" aria-label="文档标题导航">{headings.map(item=><button type="button" key={item.index} data-document-heading={item.index} style={{paddingInlineStart:12+Math.min(8,Math.max(0,item.level))*14}} onClick={()=>onNavigateHeading?.({document:outline.document,revision:outline.revision,index:item.index})}>{item.text}</button>)}</nav>}
    </div>
  </aside>;
}
