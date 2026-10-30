import { PageHeading, BusinessTabs } from './AntContent';
import React from 'react';
import {canAccessPage,getRoleDescription} from '../permissions';
export default function AdminWorkspace({page,onNavigate,children,actorRole,permissionContext}) {
 if(actorRole==='BU管理员'&&['bu-admin','audit'].includes(page))return children;
 const tabs=actorRole==='后台管理'?[['admin','系统配置'],['audit','审计记录']]:[['knowledge','标准回复库'],['history','历史 RFQ'],['capabilities','机型与能力']];
 const description=getRoleDescription(actorRole);
 return <div className="admin-workspace"><PageHeading title={<>{actorRole==='后台管理'?'平台管理':actorRole==='BU管理员'?'知识管理':'知识库'}</>} description={description && <>{description}</>} actions={<></>} /><BusinessTabs className="tabs admin-tabs">{tabs.filter(([key])=>canAccessPage(actorRole,key,permissionContext)).map(([key,label])=><button key={key} className={page===key?'active':''} onClick={()=>onNavigate(key)}>{label}</button>)}</BusinessTabs>{children}</div>;
}
