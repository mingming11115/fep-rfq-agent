import React from 'react';
import {canAccessPage,getRoleDescription} from '../permissions';
export default function AdminWorkspace({page,onNavigate,children,actorRole,permissionContext}) {
 return <div className="admin-workspace"><div className="page-heading"><div><h1>{actorRole==='BU管理员'?'BU管理与知识库':actorRole==='后台管理'?'平台管理':'知识库'}</h1><p>{getRoleDescription(actorRole)}</p></div></div><div className="tabs admin-tabs">{[['bu-admin','BU人员与规则'],['knowledge','标准回复库'],['history','历史 RFQ'],['capabilities','机型与能力'],['audit','审计记录'],['admin','系统配置']].filter(([key])=>canAccessPage(actorRole,key,permissionContext)).map(([key,label])=><button key={key} className={page===key?'active':''} onClick={()=>onNavigate(key)}>{label}</button>)}</div>{children}</div>;
}
