import GroupPicker,{useKnowledgeGroup} from '../components/KnowledgeGroupContext';
import AdminPageHeader from '../components/AdminPageHeader';
import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {Alert,Button,Descriptions,Drawer,Empty,Input,Modal,Select,Space,Spin,Table,Tag} from 'antd';
import {UiButton} from '../components/AntContent';
import {Download,FileText,Plus,Upload as UploadIcon} from '../components/icons';
import {canPerform} from '../permissions';
import {personName} from '../personnelDomain';
import {applyHistoryMetadata,buildHistoryDocuments,clausesForDocument,filterHistoryDocuments,historyClauseIssues,materializeHistoryDocument,selectHistoryResources,syncHistoryRequirement,transitionHistoryClauses} from '../historyKnowledge';
import {readRequirementSpecification} from '../requirementSpecification';
import {historyJobRunning,readHistoryImports,readHistorySnapshot,retryHistoryParse,setHistoryImport,startHistoryUpload,subscribeHistoryImports,writeHistorySnapshot} from '../historyClient';
import {historyFiles} from '../historyFiles';
import './history-knowledge.css';
import HistoryVersionPanel from '../components/HistoryVersionPanel';
import HistoryOriginalPreview from '../components/HistoryOriginalPreview';
import {versionFamily} from '../historyVersions';
import {ALL_GROUPS} from '../groupResources';
import {createKnowledgeLibraryClient,libraryPermissions} from '../knowledgeLibraryClient';
import {useLibraryMutation} from '../useLibraryMutation';

const latestVersions=rows=>[...new Map([...rows].sort((a,b)=>a.version-b.version).map(row=>[row.id,row])).values()];
const parseLabel={parsing:'解析中',complete:'解析完成',partial:'部分待核对',failed:'解析失败',legacy:'历史记录',manual:'手工补录'};
const indexWriteTags=new Map([['queued',['processing','待写入']],['retrying',['warning','写入重试中']],['synced',['success','已写入']]]);
const indexDeleteTags=new Map([['queued',['processing','待移除']],['retrying',['warning','移除重试中']],['synced',['default','已移除']]]);
const date=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
const token=row=>`${row.id}:${row.version}`;
const labels={customer:'客户',projectName:'历史项目'};
const editableFields=['clauseNo','section','requirement','answer','conditions','modelOverride','configOverride','evidence','feedback','requirementAnchor','answerAnchor'];
const scrollToSource=anchor=>{if(anchor) { document.getElementById(`history-source-${anchor}`)?.scrollIntoView?.({block:'center',behavior:'smooth'}); }};

function SourceBlocks({sources=[],anchor,onLocate}){
 useEffect(()=>scrollToSource(anchor),[anchor]);
 sources=sources.filter(source=>Array.isArray(source.blocks));
 if(!sources.length) { return <Empty description="此记录尚无原件；可手工维护条款内容"/>; }
 return <div className="history-source-blocks">{sources.map(source=><section key={source.prefix}><h3>{source.name}</h3>{source.blocks.map(block=>block.type==='table'?<table className="history-source-table" key={block.anchor}><tbody>{block.tableRows.map((cells,index)=>{const id=`${source.prefix}${block.anchor}/r${index}`;return <tr id={`history-source-${id}`} key={id} className={anchor===id?'history-source-selected':''} onClick={()=>onLocate(id)}>{cells.map((cell,i)=><td key={i}>{cell}</td>)}</tr>;})}</tbody></table>:<div key={block.anchor} id={`history-source-${source.prefix}${block.anchor}`} className={`history-source-block ${anchor===source.prefix+block.anchor?'history-source-selected':''}`} onClick={()=>onLocate(source.prefix+block.anchor)}><small>{block.sectionPath||'正文'} · {block.anchor}</small><p>{block.text||block.issue||'图片待识别'}</p></div>)}</section>)}</div>;
}

export default function HistoryKnowledgePage({toast,logEvent,actorId,actorRole='SR',permissionContext,seedKnowledge=[],onLibraryRefresh}){
 const groupScope=useKnowledgeGroup();
 const buId=permissionContext?.buId,legacy=buId==='BU-DEMO'?seedKnowledge:[];
 const databaseBacked=permissionContext?.state?.dataSource==='mysql';
 const rights=databaseBacked?libraryPermissions(permissionContext,actorRole,'history'):null;
 const library=createKnowledgeLibraryClient(buId);
 const refresh=()=>onLibraryRefresh?.(buId);
 const mutation=useLibraryMutation(refresh,toast);
 const actor={id:actorId,role:actorRole,name:personName(permissionContext?.state||{},actorId),canEdit:rights?.edit??canPerform(actorRole,'knowledge:edit',permissionContext),canApprove:rights?.approve??canPerform(actorRole,'resource:approve',permissionContext)};
 const resources=permissionContext?.state?.resourcesByBuId?.[buId];
 const load=()=>readHistorySnapshot(buId,legacy);
 const [localSnapshot,setSnapshot]=useState(()=>{try{return databaseBacked?null:load();}catch (error){ console.error('加载历史知识草稿失败', error); return {documents:[],clauses:[]};}});
 const snapshot=databaseBacked?{documents:resources?.historyDocuments||[],clauses:resources?.historyClauses||[]}:localSnapshot;
 const [error,setError]=useState(''),[query,setQuery]=useState(''),[activeId,setActiveId]=useState(null),[filter,setFilter]=useState('all'),[selected,setSelected]=useState([]),[uploading,setUploading]=useState(false),[files,setFiles]=useState({}),[busy,setBusy]=useState(false),[metadata,setMetadata]=useState(null),[editing,setEditing]=useState(null),[anchor,setAnchor]=useState(''),[review,setReview]=useState(null),[reason,setReason]=useState('');
 const [deleteTarget,setDeleteTarget]=useState(null);
 const [deleteDocumentTarget,setDeleteDocumentTarget]=useState(null);
 const [viewing,setViewing]=useState(null);
 useEffect(()=>{if(databaseBacked) { return; } const refresh=()=>{try{setSnapshot(load());}catch(cause){ console.error('刷新历史知识草稿失败', cause); setError(cause.message);}};refresh();window.addEventListener('rfq-history-change',refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener('rfq-history-change',refresh);window.removeEventListener('storage',refresh);};},[buId,databaseBacked]);
 useEffect(()=>setSelected([]),[query,filter,activeId]);
 useEffect(()=>{setActiveId(null);setEditing(null);setMetadata(null);setSelected([]);setQuery('');setUploading(false);setDeleteTarget(null);setDeleteDocumentTarget(null);setViewing(null);setError('');},[actorId,actorRole,buId]);
 const {documents:allDocuments,clauses:readableClauses}=databaseBacked
  ?{documents:buildHistoryDocuments(snapshot.documents,snapshot.clauses),clauses:snapshot.clauses}
  :selectHistoryResources(snapshot,permissionContext);
 const documents=allDocuments.filter(doc=>!groupScope||groupScope.matches('history',doc));
 const active=documents.find(doc=>doc.id===activeId);
 const viewerIdentity=JSON.stringify([buId,actorId,actorRole]);
 const imports=useSyncExternalStore(subscribeHistoryImports,readHistoryImports);
 const listDocuments=databaseBacked?[...imports.filter(job=>job.identity===viewerIdentity
  &&!allDocuments.some(doc=>doc.id===job.savedId)),...documents]:documents;
 const viewedDoc=viewing?.identity===viewerIdentity?documents.find(doc=>doc.id===viewing.documentId):null;
 const uploadParent=allDocuments.find(doc=>doc.id===files.previousDocumentId);
 const uploadProjectId=uploadParent?(uploadParent.projectId||uploadParent.sourceProjectId):files.projectId;
 useEffect(()=>{if(activeId&&!active){setEditing(null);setMetadata(null);setActiveId(null);setSelected([]);}},[activeId,!!active]);
 const rows=active?latestVersions(clausesForDocument(active,readableClauses)):[];
 const issues=row=>historyClauseIssues(row);
 const filteredRows=rows.filter(row=>(filter==='all'||filter==='missing'&&!row.answer?.trim()||filter==='review'&&issues(row).length||row.status===filter)&&[row.clauseNo,row.section,row.requirement,row.answer,row.conditions].join(' ').toLowerCase().includes(query.toLowerCase()));
 const notify=message=>{toast?.(message);logEvent?.(message);};
 const fail=cause=>{setError(cause.message);toast?.(cause.message,'error');};
 const persist=next=>{writeHistorySnapshot(buId,next);setSnapshot(next);};
 const openDoc=doc=>{const match=query&&latestVersions(clausesForDocument(doc,readableClauses)).find(row=>[row.clauseNo,row.requirement,row.answer].join(' ').toLowerCase().includes(query.toLowerCase()));setActiveId(doc.id);setQuery('');setFilter('all');setSelected([]);setError('');if(match) { editClause(match); }};
 function changePage(){setActiveId(null);setSelected([]);setFilter('all');setQuery('');}
 async function upload(){
  if(databaseBacked){
   setError('');
   const id=`history-import:${crypto.randomUUID()}`;
   const entry={identity:viewerIdentity,name:files.file.name,createdAt:new Date().toISOString(),
    uploadedBy:actor.name,metadata:uploadParent?.metadata,importState:'uploading'};
   return mutation.run(async()=>{
    setHistoryImport(id,entry);
    setUploading(false);setFiles({});changePage();
    if(groupScope&&!groupScope.matches('history',uploadParent||{})) { groupScope.selectGroup(ALL_GROUPS); }
    const result=await library.importHistory({...files,shareWithBu:!uploadProjectId,projectId:uploadProjectId,
     revision:uploadParent?.revision??(uploadParent?0:undefined)},{onUploadProgress:({percent})=>{
     setHistoryImport(id,{...entry,percent,importState:percent===100?'parsing':'uploading'});
    }});
    setHistoryImport(id,{...entry,savedId:result.document.id,importState:'parsing'});
    return result;
   },result=>{
    setHistoryImport(id,null);
    notify(result.duplicate?'已上传相同文件，列表显示原有文档':'原件已入库，条款草稿已生成');
   },cause=>{
    setHistoryImport(id,{...entry,importState:'failed',error:cause.message});
    fail(cause);
   });
  }
  setError('');setBusy(true);
  try{const result=await startHistoryUpload({...files,...(groupScope?{groupIds:groupScope.validate(files.groupIds||groupScope.defaultGroupIds,groupScope.groups('history',allDocuments.find(d=>d.id===files.previousDocumentId)||{}))}:{}),buId,actor,legacy,permissionContext});setUploading(false);setFiles({});changePage();notify(result.duplicate?'已上传相同文件，列表显示原有文档':'原件已保存，正在解析历史条款');}
  catch(cause){ console.error('上传历史 RFQ 原件失败', cause); fail(cause);}finally{setBusy(false);}
 }
 function saveMetadata(){
  if(databaseBacked){
   setError('');
   return mutation.run(()=>library.editHistoryDocument(metadata),saved=>{
    setMetadata(null);
    if(groupScope&&!groupScope.matches('history',saved)) { groupScope.selectGroup(ALL_GROUPS); }
    notify('文档信息已保存');
   },fail);
  }
  try{
   if(!actor.canEdit) { throw new Error('当前身份无编辑权限'); }
   const fresh=load();let current=selectHistoryResources(fresh,permissionContext).documents.find(doc=>doc.id===metadata.id);
   if(current?.legacy){const migrated=materializeHistoryDocument({...current,buId},fresh.documents,fresh.clauses);current=migrated.document;fresh.documents=migrated.documents;fresh.clauses=migrated.clauses;}
   if(!current) { throw new Error('文档范围已变化或无权访问，请重新打开'); }
   if(!metadata.version?.trim()) { throw new Error('请填写文件版本'); }
   if(fresh.documents.some(doc=>doc.id!==current.id&&versionFamily(doc)===versionFamily(current)&&doc.version===metadata.version.trim())) { throw new Error('该 RFQ 已有相同版本标识'); }
   const updated={...current,...(groupScope?{groupIds:groupScope.validate(metadata.groupIds||[],groupScope.groups('history',current))}:{}),metadata:{...current.metadata,...metadata.metadata},version:metadata.version,versionEdited:current.versionEdited||metadata.version!==current.version};
   persist({documents:fresh.documents.map(doc=>doc.id===updated.id?updated:doc),clauses:applyHistoryMetadata(updated,fresh.clauses)});setMetadata(null);setActiveId(updated.id);notify('文档信息已保存，关联条款同步更新');
  }catch(cause){ console.error('保存历史 RFQ 元数据失败', cause); fail(cause);}
 }
 function editClause(row){setEditing({...row});setAnchor(row.requirementAnchor||row.answerAnchor||'');setError('');}
 function viewOriginal(doc,row){
  setViewing({identity:viewerIdentity,documentId:doc.id,row,anchor:row?.requirementAnchor||row?.answerAnchor||''});
 }
 function manual(){
  if(!actor.canEdit) { return; }
  const id=`HK-${crypto.randomUUID()}`;
  setEditing({id,version:1,type:'history',documentId:active?.id,buId,sourceKey:`manual:${id}`,manual:true,newManual:true,clauseNo:'',section:'',requirement:'',answer:'',conditions:'',status:'草稿',scope:active?.scope||'FEP 授权项目',submitterId:actor.id,issues:[]});setAnchor('');
 }
 function saveClause(){
  if(databaseBacked){
   if(!editing.requirement?.trim()) { return fail(new Error('请填写客户要求')); }
   setError('');
   const row={...editing,title:editing.title||editing.requirement.slice(0,200)};
   if(row.newManual&&!row.documentId&&!row.documentName?.trim()){
    return fail(new Error('请填写文档名称'));
   }
   return mutation.run(()=>row.newManual
    ? row.documentId?library.addHistoryClause(row):library.createHistoryDocument(row)
    : library.saveHistoryClause(row),saved=>{
    setEditing(null);
    if(saved.document){
     if(groupScope&&!groupScope.matches('history',saved.document)) { groupScope.selectGroup(ALL_GROUPS); }
     else { openDoc(saved.document); }
    }
    notify('条款草稿已保存');
   },fail);
  }
  try{
   if(!actor.canEdit) { throw new Error('当前身份无编辑权限'); }
   if(!editing.requirement?.trim()) { throw new Error('请填写客户要求'); }
   const fresh=load(),previous=fresh.clauses.find(row=>token(row)===token(editing));
   const accessible=selectHistoryResources(fresh,permissionContext);
   if(previous&&!accessible.clauses.some(row=>token(row)===token(previous))) { throw new Error('条款范围已变化或无权访问，请重新打开'); }
   if(previous&&['待审核','已发布','已撤销'].includes(previous.status)&&!editing.newVersion) { throw new Error('该版本已提交，请修订新版本'); }
   const changed=editableFields.filter(field=>(editing[field]||'')!==(previous?.[field]||''));
   const parentId=editing.documentId||activeId;
   let doc=parentId?accessible.documents.find(row=>row.id===parentId):null;
   if(parentId&&!doc) { throw new Error('文档范围已变化或无权访问，请重新打开'); }
   if(doc?.legacy){const migrated=materializeHistoryDocument({...doc,buId},fresh.documents,fresh.clauses);doc=migrated.document;fresh.documents=migrated.documents;fresh.clauses=migrated.clauses;}
   if(!doc){doc={...(groupScope?{groupIds:groupScope.defaultGroupIds}:{}),id:`HD-${crypto.randomUUID()}`,buId,name:'手工补录历史知识',version:'V1',metadata:{},scope:editing.scope||'FEP 授权项目',projectId:editing.sourceProjectId||editing.projectId,parseStatus:'manual',sources:[],issues:[],createdAt:new Date().toISOString()};fresh.documents=[doc,...fresh.documents];}
   const item=syncHistoryRequirement({...editing,documentId:doc.id,title:editing.title||editing.requirement.slice(0,40),status:'草稿',submitterId:actor.id,submitterRole:actor.role,author:actor.name,editedFields:[...new Set([...(previous?.editedFields||[]),...changed])],history:[...(editing.history||[]),{date:new Date().toISOString(),text:`${actor.name} 保存历史知识草稿`}]});delete item.newVersion;
   const clauses=previous?fresh.clauses.map(row=>token(row)===token(item)?item:row):[...fresh.clauses,item];
   persist({...fresh,clauses:applyHistoryMetadata(doc,clauses)});setEditing(null);setActiveId(doc.id);notify('条款草稿已保存');
  }catch(cause){ console.error('保存历史 RFQ 条款失败', cause); fail(cause);}
 }
 function transition(action,reviewReason=''){
  if(databaseBacked){
   const rows=selected.map(id=>readableClauses.find(row=>token(row)===id));
   const allowed=action==='submit'?['草稿','退回']:action==='revoke'?['已发布']:['待审核'];
   if(!rows.length||rows.some(row=>!row||!allowed.includes(row.status)||row.validity==='被替代')) { return fail(new Error('请选择符合该操作状态的条款')); }
   if(['return','revoke'].includes(action)&&!reviewReason.trim()) { return fail(new Error('请填写操作原因')); }
   setError('');
   return mutation.run(async()=>{
    const succeeded=[],errors=[];
    for(const row of rows){
     try{await library.transition('history',row,action==='approve'?'publish':action,reviewReason);succeeded.push(token(row));}
     catch(cause){ console.error('更新历史条款审核状态失败', cause); errors.push(`${row.clauseNo||row.id} · ${cause.message}`);}
    }
    return {succeeded,errors};
   },({succeeded,errors})=>{
    setSelected(selected.filter(id=>!succeeded.includes(id)));
    if(errors.length) { fail(new Error(`成功 ${succeeded.length} 条。${errors.join('；')}`)); }
    else{setReview(null);setReason('');notify(`已处理 ${succeeded.length} 条历史条款`);}
   },fail);
  }
  try{const fresh=load(),readable=new Set(selectHistoryResources(fresh,permissionContext).clauses.map(token));if(selected.some(id=>!readable.has(id))) { throw new Error('所选条款已变化或无权访问'); } persist({...fresh,clauses:transitionHistoryClauses(fresh.clauses,selected,action,actor,reviewReason)});setSelected([]);setReview(null);setReason('');notify(action==='submit'?'所选条款已提交审核':action==='approve'?'所选条款已批准发布':'所选条款已退回');}catch(cause){ console.error('提交历史条款审核操作失败', cause); fail(cause);}
 }
 function reviseClause(){
  if(!databaseBacked){
   setEditing(value=>({...value,version:Math.max(...snapshot.clauses.filter(row=>row.id===value.id).map(row=>row.version))+1,status:'草稿',newVersion:true}));
   return;
  }
  setError('');
  mutation.run(()=>library.transition('history',editing,'revise'),saved=>{editClause(saved);notify('已生成新版本草稿');},fail);
 }
 function deleteClause(){
  if(!deleteTarget||!actor.canEdit) { return; }
  setError('');
  const key=token(deleteTarget);
  const finish=()=>{
   setDeleteTarget(null);
   setSelected(current=>current.filter(id=>id!==key));
   setEditing(current=>current&&token(current)===key?null:current);
   notify('已删除历史 RFQ 条款');
  };
  if(databaseBacked){
   return mutation.run(()=>library.transition('history',deleteTarget,'delete'),finish,fail);
  }
  try{
   const fresh=load();
   if(!selectHistoryResources(fresh,permissionContext).clauses.some(row=>token(row)===key)){
    throw new Error('条款已变化或无权访问，请重新打开');
   }
   persist({...fresh,clauses:transitionHistoryClauses(fresh.clauses,[key],'delete',actor)});
   finish();
  }catch(cause){ console.error('删除历史 RFQ 条款失败',cause); fail(cause); }
 }
 function deleteDocument(){
  if(!deleteDocumentTarget||!actor.canEdit) { return; }
  setError('');
  const target=deleteDocumentTarget;
  const finish=()=>{
   setDeleteDocumentTarget(null);
   if(activeId===target.id) { changePage(); }
   notify('已删除历史 RFQ 文档');
  };
  if(databaseBacked) { return mutation.run(()=>library.deleteHistoryDocument(target),finish,fail); }
  try{
   const fresh=load();
   const current=selectHistoryResources(fresh,permissionContext).documents.find(doc=>doc.id===target.id&&!doc.legacy);
   if(!current||historyJobRunning(buId,target.id)) { throw new Error('文档已变化或正在解析，请刷新后重试'); }
   if(clausesForDocument(current,fresh.clauses).some(row=>row.status==='待审核'||row.status==='已发布'&&row.validity!=='被替代')){
    throw new Error('请先退回待审核条款，并撤销当前已发布条款，再删除文档');
   }
   persist({...fresh,documents:fresh.documents.map(doc=>doc.id===target.id?{...doc,status:'已删除'}:doc)});
   finish();
  }catch(cause){ console.error('删除历史 RFQ 文档失败',cause); fail(cause); }
 }
 function documentDeleteButton(doc){
  return actor.canEdit&&!doc.legacy&&<Button type="link" danger disabled={saving||historyJobRunning(buId,doc.id)}
   onClick={()=>{setError('');setDeleteDocumentTarget(doc);}}>删除文档</Button>;
 }
 async function download(){try{
  if(databaseBacked){
   const parts=active.responseName?['main','answer']:['main'];
   for(const part of parts){
    const {filename,blob}=await library.historyOriginal(active.id,part);
    const url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   }
   return;
  }if(!selectHistoryResources(load(),permissionContext).documents.some(doc=>doc.id===active.id)) { throw new Error('文档范围已变化或无权访问'); } const originals=await historyFiles.get(buId,active.id);if(!originals?.file) { throw new Error('此记录没有可下载的原件'); } for(const file of [originals.file,originals.responseFile].filter(Boolean)){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name||active.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}catch(cause){ console.error('下载历史 RFQ 原件失败', cause); fail(cause);}}
 function reparse(){
  setError('');
  return mutation.run(()=>library.reparseHistory(active),saved=>{
   openDoc(saved.document);notify('重新解析已生成新文档版本和条款草稿');
  },fail);
 }
 const pending=active?.parseStatus==='parsing'&&historyJobRunning(buId,active.id);
 const interrupted=active?.parseStatus==='parsing'&&!pending;
 const editReadonly=editing&&(!actor.canEdit||['待审核','已发布','已撤销'].includes(editing.status));
 const saving=busy||mutation.busy;
 const pendingIndex=databaseBacked&&!saving&&rows.some(row=>row.indexStatus==='queued'||row.indexStatus==='retrying');
 useEffect(()=>{
  if(!pendingIndex||!onLibraryRefresh) { return; }
  let refreshing=false;
  const timer=setInterval(async()=>{
   if(refreshing||document.hidden) { return; }
   refreshing=true;
   try { await onLibraryRefresh(buId); }
   catch(error) { console.error('刷新历史 RFQ 向量库状态失败',error); }
   finally { refreshing=false; }
  },5000);
  return ()=>clearInterval(timer);
 },[activeId,buId,onLibraryRefresh,pendingIndex]);
 const panelIndex=editing?rows.findIndex(row=>token(row)===token(editing)):-1;
 const documentColumns=[
  {title:'文档名称',dataIndex:'name',width:260,render:(value,doc)=><div>
   {doc.importState?<span>{value}</span>:<Button type="link" onClick={()=>openDoc(doc)}>{value}</Button>}
   <small className="history-subtext">{doc.uploadedBy||'历史知识'} · {date(doc.createdAt)}</small>
  </div>},
  {title:'客户／项目',key:'project',render:(_,doc)=><>{doc.metadata?.customer||'待补充'}<small className="history-subtext">{doc.metadata?.projectName||'—'}</small></>},
  {title:'文件版本',dataIndex:'version',width:100,render:value=>value||'—'},
  {title:'解析状态',width:150,render:(_,doc)=>{
   if(doc.importState==='failed'){
    return <><Tag color="error">导入失败</Tag><small className="history-missing">{doc.error}</small></>;
   }
   const parsing=doc.importState==='parsing'||doc.parseStatus==='parsing'&&historyJobRunning(buId,doc.id);
   if(doc.importState==='uploading'||parsing){
    const progress=doc.percent==null?'':` ${Math.floor(doc.percent)}%`;
    return <Space size={6} role="status"><Spin size="small"/>{parsing?'解析中':`上传中${progress}`}</Space>;
   }
   return <Tag color={doc.parseStatus==='failed'?'error':doc.parseStatus==='complete'?'success':'default'}>
    {doc.parseStatus==='parsing'?'解析中断':parseLabel[doc.parseStatus]}
   </Tag>;
  }},
  {title:'条款数',width:90,render:(_,doc)=>doc.importState?'—':latestVersions(clausesForDocument(doc,readableClauses)).length},
  {title:'操作',width:190,render:(_,doc)=>doc.importState
   ? doc.importState==='failed'?<Button type="link" onClick={()=>setHistoryImport(doc.id,null)}>移除记录</Button>:null
   : <Space size={0}><Button type="link" onClick={()=>viewOriginal(doc)}>查看</Button><Button type="link" onClick={()=>openDoc(doc)}>条款</Button>{documentDeleteButton(doc)}</Space>},
 ];
 const clauseColumns=[{title:'客户要求',dataIndex:'requirement',render:value=><p className="history-clause-excerpt">{value||'待补充'}</p>},{title:'历史答复',dataIndex:'answer',render:value=><p className="history-clause-excerpt">{value||<span className="history-missing">未识别到答复</span>}</p>},
  {title:'向量库状态',width:140,render:(_,row)=>{
   const tags=row.indexOperation==='delete'?indexDeleteTags:indexWriteTags;
   const [color,label]=tags.get(row.indexStatus)||['default','未写入'];
   return <Tag color={color}>{label}</Tag>;
  }},
  {title:'操作',width:180,render:(_,row)=><Space size={0}>
   <Button type="link" onClick={()=>viewOriginal(active,row)}>查看</Button>
   <Button type="link" onClick={()=>editClause(row)}>条款详情</Button>
   {actor.canEdit&&['草稿','退回'].includes(row.status)&&<Button type="link" danger disabled={saving} onClick={()=>{setError('');setDeleteTarget(row);}}>删除</Button>}
  </Space>}];
 return <div className="history-knowledge-page">
  <Drawer open={Boolean(viewedDoc)} title={`原文 · ${viewedDoc?.name||''}`} width="min(1100px, 100vw)"
   onClose={()=>setViewing(null)} afterOpenChange={open=>{if(open) { scrollToSource(viewing?.anchor); }}}
   footer={<Button onClick={()=>setViewing(null)}>关闭原文</Button>}>
   {viewedDoc&&(databaseBacked&&viewedDoc.sourceType==='history-upload'
    ?<HistoryOriginalPreview key={`${viewedDoc.id}:${viewing.row?token(viewing.row):''}`} buId={buId} documentId={viewedDoc.id} row={viewing.row}/>
    :<SourceBlocks sources={viewedDoc.sources} anchor={viewing.anchor} onLocate={source=>setViewing(current=>current&&({...current,anchor:source}))}/>)}
  </Drawer>
  <AdminPageHeader title={active?active.name:'历史 RFQ'} description={active?'文档信息统一维护，逐条核对历史要求与答复。':'上传历史 RFQ，提取要求与答复，沉淀可追溯的项目经验。'} actions={<Space wrap>{active?<UiButton onClick={changePage}>返回文档列表</UiButton>:<UiButton disabled={!actor.canEdit} onClick={manual}><Plus size={15}/>手工补录</UiButton>}<UiButton className="btn-primary" disabled={!actor.canEdit} onClick={()=>{setFiles(databaseBacked?{projectId:active?.projectId}:active&&!active.legacy?{previousDocumentId:active.id}:{});setUploading(true);setError('');}}><UploadIcon size={16}/>上传历史 RFQ</UiButton></Space>}/>
  {error&&<Alert type="error" showIcon closable onClose={()=>setError('')} message={error}/>}
  {!active?<section className="panel history-document-panel"><div className="history-toolbar"><Input.Search aria-label="搜索历史文档和条款" placeholder="搜索文档、客户、项目、要求或历史答复" value={query} onChange={event=>setQuery(event.target.value)} allowClear/><span>共 {listDocuments.length} 份文档</span></div><Table columns={documentColumns} dataSource={filterHistoryDocuments(listDocuments,readableClauses,query)} rowKey="id" scroll={{x:1050}} pagination={{pageSize:10,showSizeChanger:true}} locale={{emptyText:<Empty description="暂无历史 RFQ，上传文件后自动解析为条款草稿"/>}}/></section>:<>
   <HistoryVersionPanel key={active.id} active={active} documents={documents} clauses={readableClauses} onLocate={(doc,row)=>{setActiveId(doc.id);setQuery('');setFilter('all');if(row) { editClause(row); } else { setEditing(null); }}}/>
   <section className="panel history-metadata-panel"><div className="history-section-heading"><h2>文档信息</h2><Space>{<Button disabled={!actor.canEdit} onClick={()=>{setMetadata({...structuredClone(active),version:active.version||'V1',groupIds:groupScope?.groups('history',active)||active.groupIds||[]});setError('');}}>编辑文档信息</Button>}{(databaseBacked?active.sourceType==='history-upload':!active.legacy&&!active.manual)&&<Button onClick={download}><Download size={14}/>下载原件</Button>}</Space></div><Descriptions column={{xs:1,sm:2,lg:3}} items={[...Object.entries(labels).map(([key,label])=>({key,label,children:active.metadata?.[key]||'待补充'})),{key:'version',label:'文件版本',children:active.version||'—'}]}/></section>
   {!databaseBacked&&(pending||interrupted||active.parseStatus==='failed')&&<Alert type={pending?'info':'warning'} showIcon message={pending?'正在读取文件并解析条款，可以离开此页面，稍后返回查看。':interrupted?'上次解析未完成，原件已保留，可以重试。':active.error||'解析失败，请重试'} action={!pending&&<Button disabled={!actor.canEdit} onClick={()=>retryHistoryParse(active,actor,{legacy}).catch(error => { console.error('重试历史 RFQ 解析失败', error); return fail(error); })}>重试解析</Button>}/>}
   <div className="history-counts">{[{key:'all',label:'全部条款',count:rows.length},{key:'missing',label:'缺少答复',count:rows.filter(row=>!row.answer?.trim()).length},{key:'review',label:'需核对',count:rows.filter(row=>issues(row).length).length},{key:'待审核',label:'待审核',count:rows.filter(row=>row.status==='待审核').length},{key:'已发布',label:'已发布',count:rows.filter(row=>row.status==='已发布').length}].map(item=><button key={item.key} className={filter===item.key?'active':''} onClick={()=>{setFilter(item.key);setSelected([]);}}><span>{item.label}</span><strong>{item.count}</strong></button>)}</div>
   <section className="panel history-clause-panel"><div className="history-toolbar"><Input.Search aria-label="搜索文档内条款" placeholder="搜索编号、要求或历史答复" value={query} onChange={event=>setQuery(event.target.value)} allowClear/><Space wrap><Button disabled={!actor.canEdit||saving} onClick={manual}>补录条款</Button>
    {databaseBacked ? active.sourceType==='history-upload'&&!allDocuments.some(doc=>versionFamily(doc)===versionFamily(active)&&doc.versionNumber>active.versionNumber)&&
      <Button disabled={!actor.canEdit||saving} onClick={reparse}>重新解析为新版</Button>
      : !active.legacy&&!active.manual&&<Button disabled={!actor.canEdit||pending} onClick={()=>retryHistoryParse(active,actor,{legacy}).catch(error => { console.error('重新解析历史 RFQ 失败', error); return fail(error); })}>重新解析</Button>}
   </Space></div><div className="history-batch-bar"><span>已选择 {selected.length} 条</span><Space wrap><Button type="primary" disabled={saving||!selected.length||!actor.canEdit} onClick={()=>transition('submit')}>提交审核</Button>{actor.canApprove&&<><Button disabled={saving||!selected.length} onClick={()=>transition('approve')}>批准发布</Button><Button disabled={saving||!selected.length} onClick={()=>{setReview('return');setReason('');}}>退回</Button>{databaseBacked&&<Button danger disabled={saving||!selected.length} onClick={()=>{setReview('revoke');setReason('');}}>撤销发布</Button>}</>}</Space></div><Table columns={clauseColumns} dataSource={filteredRows} rowKey={token} rowSelection={{selectedRowKeys:selected,onChange:setSelected,preserveSelectedRowKeys:false}} scroll={{x:1000}} pagination={{pageSize:20,showSizeChanger:true}} locale={{emptyText:<Empty description={pending?'正在解析，完成后条款将显示在这里':'当前没有符合条件的条款'}/>}}/></section>
  </>}
  <Modal open={uploading} title="上传历史 RFQ" onCancel={()=>{if(!saving){setUploading(false);setFiles({});}}} footer={<><Button disabled={saving} onClick={()=>setUploading(false)}>取消</Button><Button type="primary" loading={saving} disabled={!files.file} onClick={upload}>上传并开始解析</Button></>}>
   {databaseBacked?<Space direction="vertical" style={{width:'100%'}}>
    <label>关联上一版（可选）</label><Select aria-label="关联上一版" allowClear style={{width:'100%'}} value={files.previousDocumentId}
      options={allDocuments.filter(doc=>!allDocuments.some(newer=>newer.previousDocumentId===doc.id))
       .map(doc=>({value:doc.id,label:`${doc.name} · ${doc.version}`}))}
      onChange={previousDocumentId=>setFiles(current=>({...current,previousDocumentId}))}/>
    {uploadParent&&<Input.TextArea aria-label="变更说明" value={files.changeNote||''} onChange={event=>setFiles(current=>({...current,changeNote:event.target.value}))}/>}
   </Space>:<>
   <GroupPicker value={files.groupIds||groupScope?.defaultGroupIds||[]} onChange={groupIds=>setFiles({...files,groupIds})}/><Space direction="vertical" style={{width:'100%',marginBottom:16}}>
    <label>上传方式</label><Select aria-label="上传方式" style={{width:'100%'}} value={files.previousDocumentId?'revision':'new'} options={[{value:'new',label:'新增历史 RFQ'},{value:'revision',label:'已有 RFQ 的新版本',disabled:!documents.some(doc=>!doc.legacy)}]} onChange={value=>setFiles(current=>({...current,previousDocumentId:value==='revision'?documents.find(doc=>!doc.legacy)?.id:undefined}))}/>
    {files.previousDocumentId&&<><label>关联历史 RFQ</label><Select aria-label="关联历史 RFQ" style={{width:'100%'}} value={files.previousDocumentId} options={documents.filter(doc=>!doc.legacy).map(doc=>({value:doc.id,label:doc.name+' · '+doc.version}))} onChange={previousDocumentId=>setFiles(current=>({...current,previousDocumentId}))}/><Alert type="info" message="新版本独立保存，旧版本与原件保留。"/></>}
    <label>客户版本标识（可选，留空自动编号）</label><Input aria-label="客户版本标识" value={files.versionLabel||''} onChange={event=>setFiles(current=>({...current,versionLabel:event.target.value}))}/>
    <label>变更说明</label><Input.TextArea aria-label="变更说明" value={files.changeNote||''} onChange={event=>setFiles(current=>({...current,changeNote:event.target.value}))}/>
   </Space></>}
   <p className="history-upload-intro">选择已完成应答的历史文件。</p>
   <label className="history-file-label">历史 RFQ 文件 *</label>
   <div className="history-upload-drop" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();setFiles(value=>({...value,file:event.dataTransfer.files[0]}));}}>
    <FileText size={30}/><p>拖入文件，或点击选择</p>
    <input aria-label="历史 RFQ 文件" type="file" accept=".docx,.pdf" onChange={event=>setFiles(value=>({...value,file:event.target.files[0]}))}/>
    {files.file&&<strong>{files.file.name}</strong>}<small>DOCX / PDF，文件不超过 30 MiB</small>
   </div>
   {error&&<Alert type="error" message={error}/>}
  </Modal>
  <Modal open={!!metadata} title="编辑文档信息" onCancel={()=>setMetadata(null)} onOk={saveMetadata} okText="保存文档信息" width={720}>
   {metadata&&<div className="history-metadata-form"><GroupPicker value={metadata.groupIds||[]} onChange={groupIds=>setMetadata({...metadata,groupIds})}/>{Object.entries(labels).map(([key,label])=><label key={key}><span>{label}</span><Input aria-label={label} value={metadata.metadata?.[key]||''} onChange={event=>setMetadata(value=>({...value,metadata:{...value.metadata,[key]:event.target.value}}))}/></label>)}<label><span>文件版本</span><Input aria-label="文件版本" disabled={databaseBacked} value={metadata.version} onChange={event=>setMetadata(value=>({...value,version:event.target.value}))}/></label></div>}{error&&<Alert type="error" message={error}/>}
  </Modal>
  <Drawer open={!!editing} width="min(1320px, 96vw)" title={editing?`条款核对 · ${editing.clauseNo||'补录'}`:''}
   onClose={()=>{if(!saving) { setEditing(null); }}} extra={<Space><Button disabled={saving||panelIndex<=0} onClick={()=>editClause(rows[panelIndex-1])}>上一条</Button><Button disabled={saving||panelIndex<0||panelIndex>=rows.length-1} onClick={()=>editClause(rows[panelIndex+1])}>下一条</Button></Space>}
   footer={<Space><Button disabled={saving} onClick={()=>setEditing(null)}>关闭</Button>
    {editing&&(editing.status==='已发布'||databaseBacked&&editing.status==='已撤销')?
     <Button loading={saving} disabled={!actor.canEdit||databaseBacked&&panelIndex<0} onClick={reviseClause}>修订新版本</Button>:
     <Button type="primary" loading={saving} disabled={!actor.canEdit||editReadonly} onClick={saveClause}>保存草稿</Button>}
   </Space>}>
   {editing&&<div className="history-review-layout"><section className="history-original"><div className="history-section-heading"><h3>原文</h3>{!databaseBacked&&<Tag>点击段落或表格行选择来源</Tag>}</div>{databaseBacked?<Space direction="vertical">
      {active?.sourceType==='history-upload'&&<Button onClick={download}>下载原件核对</Button>}
      <span>要求定位 · {editing.requirementAnchor||'—'}</span><span>答复定位 · {editing.answerAnchor||'—'}</span>
     </Space>:<SourceBlocks sources={active?.sources} anchor={anchor} onLocate={setAnchor}/>}</section><section className="history-clause-form">{error&&<Alert type="error" message={error}/>}{editReadonly&&<Alert type="info" message={editing.status==='已发布'?'已发布版本只读，修订后需重新审核':'此版本已提交审核，审核后继续维护'}/>}
    <div className="history-field-pair"><label><span>原条款编号</span><Input aria-label="原条款编号" disabled={databaseBacked&&!editing.newManual||editReadonly} value={editing.clauseNo||''} onChange={event=>setEditing({...editing,clauseNo:event.target.value})}/></label><label><span>原章节</span><Input aria-label="原章节" disabled={databaseBacked&&!editing.newManual||editReadonly} value={editing.section||''} onChange={event=>setEditing({...editing,section:event.target.value})}/></label></div>
    {databaseBacked&&editing.newManual&&!editing.documentId&&
     <label><span>历史文档名称</span><Input aria-label="历史文档名称" value={editing.documentName||''}
       onChange={event=>setEditing({...editing,documentName:event.target.value})}/></label>
    }
    {(databaseBacked||editing.originalText!=null)&&<label><span>项目／条款标题</span><Input aria-label="条款标题" disabled={!databaseBacked||editReadonly} value={editing.title||''} onChange={event=>setEditing({...editing,title:event.target.value})}/></label>}
    {editing.originalText!=null&&<>
     <label><span>客户要求原文</span><Input.TextArea aria-label="客户要求原文" readOnly value={editing.originalText} rows={3}/></label>
     <label><span>规格</span><Input aria-label="规格" readOnly value={readRequirementSpecification(editing.metricsJson)||''}/></label>
     {editing.conditionsText&&<label><span>客户要求条件</span><Input aria-label="客户要求条件" readOnly value={editing.conditionsText}/></label>}
    </>}
    {[['requirement','客户要求',4],['answer','历史答复',5],['conditions','适用条件与限制',3]].map(([key,label,height])=><label key={key}><span>{label}{!databaseBacked&&['requirement','answer'].includes(key)&&<Button type="link" size="small" disabled={!editing[`${key}Anchor`]} onClick={()=>setAnchor(editing[`${key}Anchor`])}>定位原文</Button>}</span><Input.TextArea aria-label={label} disabled={editReadonly} value={editing[key]||''} rows={height} placeholder={key==='answer'?'原文没有答复时留空，可先保存草稿':'按原文填写'} onChange={event=>setEditing({...editing,[key]:event.target.value})}/></label>)}
    {!databaseBacked&&anchor&&!editReadonly&&<Space wrap><Button size="small" onClick={()=>setEditing({...editing,requirementAnchor:anchor,sourceMissing:false})}>设为要求来源</Button><Button size="small" onClick={()=>setEditing({...editing,answerAnchor:anchor})}>设为答复来源</Button></Space>}
    <details><summary>特殊机型／配置、证据与反馈</summary>{[['modelOverride','条款特殊机型'],['configOverride','条款特殊配置'],['evidence','证据引用'],['feedback','客户反馈／验收结果']].map(([key,label])=><label key={key}><span>{label}</span><Input.TextArea aria-label={label} disabled={databaseBacked||editReadonly} rows={2} value={editing[key]||''} onChange={event=>setEditing({...editing,[key]:event.target.value})}/></label>)}</details>
    {editing.history?.length>0&&<details><summary>版本与审核记录</summary>{readableClauses.filter(row=>row.id===editing.id).sort((a,b)=>b.version-a.version).map(row=><Button type="link" key={row.version} onClick={()=>editClause(row)}>v{row.version} · {row.status}</Button>)}{editing.history.map((item,index)=><p key={index}><small>{item.date}</small> {item.text}</p>)}</details>}
   </section></div>}
  </Drawer>
  <Modal open={!!deleteTarget} title="删除历史 RFQ 条款" confirmLoading={saving}
   onCancel={()=>{if(!saving){setDeleteTarget(null);}}} onOk={deleteClause} okText="确认删除" cancelText="取消" okButtonProps={{danger:true}}>
   {deleteTarget&&<p>将从条款清单移除「{deleteTarget.clauseNo||deleteTarget.title||'无编号条款'}」的 v{deleteTarget.version}。历史 RFQ 原件仍可查阅。</p>}
   {error&&<Alert type="error" message={error}/>}
  </Modal>
  <Modal open={!!deleteDocumentTarget} title="删除历史 RFQ 文档" confirmLoading={saving}
   onCancel={()=>{if(!saving){setDeleteDocumentTarget(null);}}} onOk={deleteDocument} okText="确认删除文档" cancelText="取消" okButtonProps={{danger:true}}>
   {deleteDocumentTarget&&<p>「{deleteDocumentTarget.name}」和该文档版本下的条款将从历史 RFQ 库移除。</p>}
   {error&&<Alert type="error" message={error}/>}
  </Modal>
  <Modal open={!!review} title={review==='revoke'?'撤销所选条款':'退回所选条款'} confirmLoading={saving} onCancel={()=>{if(!saving) { setReview(null); }}} onOk={()=>transition(review,reason)} okText="确认"><Input.TextArea aria-label={review==='revoke'?'撤销原因':'退回原因'} placeholder="填写需要补充或修正的内容" value={reason} onChange={event=>setReason(event.target.value)}/>{error&&<Alert type="error" message={error}/>}</Modal>
 </div>;
}
