import {createKnowledgeLibraryClient,libraryPermissions} from '../knowledgeLibraryClient';
import {CAPABILITIES} from '../modelProcessSeeds';
import {resourceStorageKey,selectReadableResources} from '../resourceVisibility';
import React,{useEffect,useState,useRef} from 'react';
import useContentTransition from './useContentTransition';
import {Alert,Button,Card,Checkbox,Empty,Input,InputNumber,Modal,Select,Space,Tabs,Tag,Tooltip,Tree} from 'antd';
import AdminPageHeader from './AdminPageHeader';
import {KnowledgeGroupContext} from './KnowledgeGroupContext';
import {readRfqCatalog} from '../rfqProcessBinding';
import {catalogKey,nodeEnabled,nodePath,readGenericCatalog,saveNode,writeGenericCatalog,migrateCatalog} from '../genericCatalog';
import {canAccessPage,canPerform} from '../permissions';
import {ALL_GROUPS,matchesResourceGroup,resourceGroupIds,validateResourceGroups,UNGROUPED} from '../groupResources';
import './knowledge-group-workspace.css';
export default function KnowledgeGroupWorkspace({page,onNavigate,context,children,initialGroupId,actorRole,onSelectBu,onLibraryRefresh}){
 const role=context.state.actorRole||actorRole;
 const databaseBacked=context.state.dataSource==='mysql';
 const buId=context.buId,load=()=>context.state.dataSource==='mysql'?(context.state.resourcesByBuId?.[buId]?.catalog||migrateCatalog(buId)):readGenericCatalog(localStorage,buId,readRfqCatalog(localStorage,context),selectReadableResources(JSON.parse(localStorage.getItem(resourceStorageKey('rfq.reference.capabilities.v1',buId))||'null')||(buId==='BU-DEMO'?CAPABILITIES:[]),context,'capability'));
 const [catalog,setCatalog]=useState(()=>{try{return load();}catch(error){ console.error('初始化知识分组失败', error); return {buId,error:error.message,schema:{levels:[]},nodes:[],attachments:[]};}});
 const storageKey=`rfq.knowledge.selected-group:${buId}`;
 const validGroup=id=>id===UNGROUPED||databaseBacked&&id===ALL_GROUPS||catalog.nodes.some(node=>node.id===id);
 const [groupId,setGroupId]=useState(()=>{let saved;try{saved=sessionStorage.getItem(storageKey);}catch (error){ console.error('读取上次选中的知识分组失败', error); }return validGroup(initialGroupId)?initialGroupId:validGroup(saved)?saved:databaseBacked?ALL_GROUPS:catalog.nodes[0]?.id||UNGROUPED;});
 const [query,setQuery]=useState(''),[draft,setDraft]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const contentRef=useRef(null);useContentTransition(contentRef,`${buId}:${groupId}:${page}`,{kind:'tab',position:['knowledge','history','capabilities'].indexOf(page)});
 useEffect(()=>{const refresh=e=>{if(e?.key&&e.key!==catalogKey(buId)) { return; } try{setCatalog(load());}catch(cause){ console.error('刷新知识分组失败', cause); setError(cause.message);}};window.addEventListener('storage',refresh);return()=>window.removeEventListener('storage',refresh);},[buId]);
 useEffect(()=>{if(databaseBacked) { setCatalog(load()); }},[databaseBacked,context.state.resourcesByBuId?.[buId]?.catalog]);
 const selectGroup=id=>{setGroupId(id);try{sessionStorage.setItem(storageKey,id);}catch (error){ console.error('保存选中的知识分组失败', error); }onNavigate(page,null,{groupId:id,buId});};
 useEffect(()=>{if(validGroup(initialGroupId)) { setGroupId(initialGroupId); }},[initialGroupId,buId]);
 const canConfigure=databaseBacked?libraryPermissions(context,role,'reply').configure:canPerform(role,'model:configure',context);
 const selected=catalog.nodes.find(n=>n.id===groupId),title=selected?nodePath(catalog,selected.id):groupId===ALL_GROUPS?'全部资料':'未分组';
 const tree=parent=>catalog.nodes.filter(n=>(n.parentId||'')===parent).flatMap(n=>{const children=tree(n.id),match=!query||nodePath(catalog,n.id).toLowerCase().includes(query.toLowerCase());return match||children.length?[{key:n.id,title:<span className="kg-group-node"><span className="kg-group-node-name">{n.name}</span>{!nodeEnabled(catalog,n.id)&&<Tag className="kg-group-tag">停用</Tag>}</span>,children}]:[];});
 const scope={catalog,groupId,selectGroup,updateCatalog:setCatalog,defaultGroupIds:selected&&nodeEnabled(catalog,groupId)?[groupId]:[],matches:(kind,row)=>matchesResourceGroup(kind,row,groupId,catalog),groups:(kind,row)=>resourceGroupIds(kind,row,catalog),validate:(values,previous=[])=>validateResourceGroups(catalog,values,previous)};
 const levelsAfter=parentId=>{
  const parent=catalog.nodes.find(node=>node.id===parentId);
  const index=parent?catalog.schema.levels.findIndex(level=>level.id===parent.levelId):-1;
  return catalog.schema.levels.slice(index+1).filter(level=>level.enabled!==false);
 };
 const openNode=existing=>{
  setError('');
  const parentId=selected&&levelsAfter(selected.id).length?selected.id:'';
  setDraft(existing?structuredClone(existing):{id:crypto.randomUUID(),levelId:levelsAfter(parentId)[0]?.id,name:'',parentId,enabled:true,values:{}});
 };
 const save=async()=>{
  if(saving) { return; }
  setSaving(true);
  try{
   const next=saveNode(catalog,draft);
   const persisted=databaseBacked?await createKnowledgeLibraryClient(buId).saveCatalog(next):writeGenericCatalog(localStorage,context,next);
   setCatalog(persisted);selectGroup(draft.id);setDraft(null);
   await onLibraryRefresh?.(buId);
  }catch(cause){ console.error('保存知识分组失败', cause); setError(cause.message);}
  finally{setSaving(false);}
 };
 const level=catalog.schema.levels.find(l=>l.id===draft?.levelId);
 const bus=(context.state.businessUnits||[]).filter(b=>canAccessPage(role,'knowledge',{...context,buId:b.id}));
 const tabs=[['knowledge','回复库'],['history','历史 RFQ'],['capabilities','能力']].filter(([key])=>canAccessPage(role,key,context));
 if(catalog.error) { return <Alert type="error" message={catalog.error}/>; }
 return <KnowledgeGroupContext.Provider value={scope}><div className="knowledge-group-workspace"><AdminPageHeader title="知识库" actions={bus.length>1?<Select aria-label="知识库所属BU" value={buId} options={bus.map(b=>({value:b.id,label:b.name}))} onChange={id=>{onSelectBu?.(id);onNavigate(page,null,{buId:id,groupId:undefined});}}/>:null}/><div className="knowledge-group-layout"><Card className="knowledge-group-directory" title={<Tooltip title="比对按项目绑定的分组取范围：该分组及其全部上级（含根分组）挂载的资料参与比对，未分组资料对所有项目生效">分组</Tooltip>} extra={<Button type="link" disabled={!canConfigure} onClick={()=>openNode(null)}>新建</Button>}><Input.Search aria-label="搜索分组" placeholder="搜索分组" value={query} onChange={e=>setQuery(e.target.value)} allowClear/><Tree blockNode defaultExpandAll treeData={[...(databaseBacked?[{key:ALL_GROUPS,title:'全部资料'}]:[]),...tree(''),{key:UNGROUPED,title:'未分组'}]} selectedKeys={[groupId]} onSelect={keys=>{if(keys[0]) { selectGroup(keys[0]); }}}/>{!catalog.nodes.length&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分组，请由BU管理员新建"/>}{selected&&<Button block disabled={!canConfigure} onClick={()=>openNode(selected)}>编辑当前分组</Button>}</Card><div className="knowledge-group-content"><Card size="small" className="knowledge-group-tabs" title={<span>{title}</span>}><Tabs animated={{ inkBar:true, tabPane:false }} activeKey={page} onChange={key=>onNavigate(key,null,{groupId,buId})} items={tabs.map(([key,label])=>({key,label}))}/></Card><div ref={contentRef} key={`${buId}:${groupId}`}>{children}</div></div></div></div>
 <Modal title={catalog.nodes.some(n=>n.id===draft?.id)?'编辑分组':'新建分组'} open={!!draft} onCancel={()=>{if(!saving) { setDraft(null); }}} confirmLoading={saving} onOk={save} okText="保存" cancelText="取消" styles={{body:{maxHeight:'65vh',overflowY:'auto'}}}>{error&&<Alert type="error" message={error}/>}{draft&&<div className="knowledge-group-form"><label>分组名称<Input aria-label="分组名称" value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>上级分组<Select allowClear disabled={catalog.nodes.some(n=>n.id===draft.id)} value={draft.parentId||undefined} options={catalog.nodes.filter(n=>nodeEnabled(catalog,n.id)&&n.id!==draft.id&&levelsAfter(n.id).length>0).map(n=>({value:n.id,label:nodePath(catalog,n.id)}))} onChange={parentId=>setDraft({...draft,parentId:parentId||'',levelId:levelsAfter(parentId)[0]?.id,values:{}})}/></label><label>层级<Select aria-label="分组层级" value={draft.levelId}
  disabled={catalog.nodes.some(n=>n.id===draft.id)} options={levelsAfter(draft.parentId).map(level=>({value:level.id,label:level.name}))}
  onChange={levelId=>setDraft({...draft,levelId,values:{}})}/></label><Checkbox checked={draft.enabled!==false} onChange={e=>setDraft({...draft,enabled:e.target.checked})}>启用</Checkbox>{(level?.fields||[]).filter(f=>f.enabled!==false).map(f=><label key={f.id}>{f.name}{f.required?' *':''}{f.type==='number'?<InputNumber value={draft.values[f.id]} onChange={v=>setDraft({...draft,values:{...draft.values,[f.id]:v}})}/>:['select','multiselect'].includes(f.type)?<Select allowClear mode={f.type==='multiselect'?'multiple':undefined} value={draft.values[f.id]} options={(f.options||[]).map(value=>({value,label:value}))} onChange={v=>setDraft({...draft,values:{...draft.values,[f.id]:v}})}/>:<Input type={f.type==='date'?'date':'text'} value={draft.values[f.id]||''} onChange={e=>setDraft({...draft,values:{...draft.values,[f.id]:e.target.value}})}/>}</label>)}</div>}</Modal></KnowledgeGroupContext.Provider>;
}
