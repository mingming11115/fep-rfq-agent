import React from 'react';
export default function AdminWorkspace({page,onNavigate,children}) {
 return <div className="admin-workspace"><div className="page-heading"><div><h1>管理后台</h1><p>业务资源与系统配置分区维护，演示身份用于体验职责差异。</p></div></div><div className="tabs admin-tabs">{[['knowledge','标准回复与历史RFQ'],['capabilities','机型与能力'],['evidence','资料与证据'],['audit','审计记录'],['admin','系统配置']].map(([key,label])=><button key={key} className={page===key?'active':''} onClick={()=>onNavigate(key)}>{label}</button>)}</div>{children}</div>;
}
