import { BusinessTabs } from './AntContent';
import React, { useRef } from 'react';
import useContentTransition from './useContentTransition';
import {canAccessPage} from '../permissions';
export default function AdminWorkspace({page,onNavigate,children,actorRole,permissionContext}) {
 const contentRef=useRef(null);
 useContentTransition(contentRef,page,{kind:'tab',position:['knowledge','history','capabilities','admin','audit'].indexOf(page)});
 if(actorRole==='BU管理员'&&['bu-admin','audit'].includes(page))return children;
 const tabs=actorRole==='后台管理'?[['admin','系统配置'],['audit','审计记录']]:[['knowledge','标准回复库'],['history','历史 RFQ'],['capabilities','机型与能力']];
 return <div className="admin-workspace"><BusinessTabs className="tabs admin-tabs">{tabs.filter(([key])=>canAccessPage(actorRole,key,permissionContext)).map(([key,label])=><button key={key} className={page===key?'active':''} onClick={()=>onNavigate(key)}>{label}</button>)}</BusinessTabs><div ref={contentRef} className="rfq-admin-content">{children}</div></div>;
}
