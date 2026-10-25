import React from 'react';
import {canAccessPage,getRoleDescription} from '../permissions';
export default function AdminWorkspace({page,onNavigate,children,actorRole}) {
 return <div className="admin-workspace"><div className="page-heading"><div><h1>业务资料</h1><p>{getRoleDescription(actorRole)}</p></div></div><div className="tabs admin-tabs">{[['knowledge','标准回复与历史RFQ'],['capabilities','机型与能力'],['evidence','资料与证据'],['audit','审计记录'],['admin','系统配置']].filter(([key])=>canAccessPage(actorRole,key)).map(([key,label])=><button key={key} className={page===key?'active':''} onClick={()=>onNavigate(key)}>{label}</button>)}</div>{children}</div>;
}
