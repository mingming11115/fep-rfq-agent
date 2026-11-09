import KnowledgeGroupWorkspace from './KnowledgeGroupWorkspace';
import React,{useRef} from 'react';
import {Card,Tabs} from 'antd';
import useContentTransition from './useContentTransition';
import {canAccessPage} from '../permissions';
import './admin-management.css';
export default function AdminWorkspace({page,onNavigate,children,actorRole,permissionContext,route,onSelectBu,onLibraryRefresh}){
 const contentRef=useRef(null);
 useContentTransition(contentRef,page,{kind:'tab',position:['knowledge','history','capabilities','admin','audit'].indexOf(page)});
 if(actorRole==='BU管理员'&&['bu-admin','audit'].includes(page))return children;
 if(['knowledge','history','capabilities'].includes(page))return <div className="admin-knowledge-workspace"><KnowledgeGroupWorkspace key={`${permissionContext.buId}:${permissionContext.actorId}`} page={page} onNavigate={onNavigate} context={permissionContext} actorRole={actorRole} onSelectBu={onSelectBu} onLibraryRefresh={onLibraryRefresh} initialGroupId={route?.groupId}>{children}</KnowledgeGroupWorkspace></div>;
 const platform=actorRole==='后台管理'&&['admin','audit'].includes(page);
 const tabs=platform?[['admin','系统配置'],['audit','审计记录']]:[['knowledge','标准回复库'],['history','历史 RFQ'],['capabilities','分组与能力配置']];
 return <div className="admin-workspace admin-knowledge-workspace"><Card className="admin-knowledge-navigation" size="small"><Tabs animated={{ inkBar:true, tabPane:false }} type="line" activeKey={page} onChange={onNavigate} items={tabs.filter(([key])=>canAccessPage(actorRole,key,permissionContext)).map(([key,label])=>({key,label}))}/></Card><div ref={contentRef} className="rfq-admin-content">{children}</div></div>;
}
