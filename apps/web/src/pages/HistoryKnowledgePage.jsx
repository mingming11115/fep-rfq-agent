import GroupPicker,{useKnowledgeGroup} from '../components/KnowledgeGroupContext';
import AdminPageHeader from '../components/AdminPageHeader';
import React,{useEffect,useState} from 'react';
import {Alert,Button,Descriptions,Drawer,Empty,Input,Modal,Select,Space,Table,Tag} from 'antd';
import {UiButton} from '../components/AntContent';
import {Download,FileText,Plus,Upload as UploadIcon} from '../components/icons';
import {canPerform} from '../permissions';
import {canAccessProject,personName} from '../personnelDomain';
import {applyHistoryMetadata,clausesForDocument,filterHistoryDocuments,historyClauseIssues,materializeHistoryDocument,selectHistoryResources,transitionHistoryClauses} from '../historyKnowledge';
import {historyJobRunning,readHistorySnapshot,retryHistoryParse,startHistoryUpload,writeHistorySnapshot} from '../historyClient';
import {historyFiles} from '../historyFiles';
import './history-knowledge.css';
import HistoryVersionPanel from '../components/HistoryVersionPanel';
import {versionFamily} from '../historyVersions';

const latestVersions=rows=>[...new Map([...rows].sort((a,b)=>a.version-b.version).map(row=>[row.id,row])).values()];
const parseLabel={parsing:'解析中',complete:'解析完成',partial:'部分待核对',failed:'解析失败',legacy:'历史记录',manual:'手工补录'};
const date=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
const token=row=>`${row.id}:${row.version}`;
const labels={customer:'客户',projectName:'历史项目',model:'适用机型',config:'默认配置',date:'项目日期'};
const editableFields=['clauseNo','section','requirement','answer','conditions','modelOverride','configOverride','evidence','feedback','requirementAnchor','answerAnchor'];

function SourceBlocks({sources=[],anchor,onLocate}){
 useEffect(()=>{if(anchor)document.getElementById(`history-source-${anchor}`)?.scrollIntoView?.({block:'center',behavior:'smooth'});},[anchor]);
 if(!sources.length)return <Empty description="此记录尚无原件；可手工维护条款内容"/>;
 return <div className="history-source-blocks">{sources.map(source=><section key={source.prefix}><h3>{source.name}</h3>{source.blocks.map(block=>block.type==='table'?<table className="history-source-table" key={block.anchor}><tbody>{block.tableRows.map((cells,index)=>{const id=`${source.prefix}${block.anchor}/r${index}`;return <tr id={`history-source-${id}`} key={id} className={anchor===id?'history-source-selected':''} onClick={()=>onLocate(id)}>{cells.map((cell,i)=><td key={i}>{cell}</td>)}</tr>;})}</tbody></table>:<div key={block.anchor} id={`history-source-${source.prefix}${block.anchor}`} className={`history-source-block ${anchor===source.prefix+block.anchor?'history-source-selected':''}`} onClick={()=>onLocate(source.prefix+block.anchor)}><small>{block.sectionPath||'正文'} · {block.anchor}</small><p>{block.text||block.issue||'图片待识别'}</p></div>)}</section>)}</div>;
}

export default function HistoryKnowledgePage({toast,logEvent,actorId,actorRole='SR',permissionContext,seedKnowledge=[]}){
 const groupScope=useKnowledgeGroup();
 const buId=permissionContext?.buId,legacy=buId==='BU-DEMO'?seedKnowledge:[];
 const actor={id:actorId,role:actorRole,name:personName(permissionContext?.state||{},actorId),canEdit:canPerform(actorRole,'knowledge:edit',permissionContext),canApprove:canPerform(actorRole,'resource:approve',permissionContext)};
 const load=()=>readHistorySnapshot(buId,legacy);
 const [snapshot,setSnapshot]=useState(()=>{try{return load();}catch{return {documents:[],clauses:[]};}});
 const [error,setError]=useState(''),[query,setQuery]=useState(''),[activeId,setActiveId]=useState(null),[filter,setFilter]=useState('all'),[selected,setSelected]=useState([]),[uploading,setUploading]=useState(false),[files,setFiles]=useState({}),[busy,setBusy]=useState(false),[metadata,setMetadata]=useState(null),[editing,setEditing]=useState(null),[anchor,setAnchor]=useState(''),[review,setReview]=useState(null),[reason,setReason]=useState('');
 useEffect(()=>{const refresh=()=>{try{setSnapshot(load());}catch(cause){setError(cause.message);}};refresh();window.addEventListener('rfq-history-change',refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener('rfq-history-change',refresh);window.removeEventListener('storage',refresh);};},[buId]);
 useEffect(()=>setSelected([]),[query,filter,activeId]);
 useEffect(()=>{setActiveId(null);setEditing(null);setMetadata(null);setSelected([]);setQuery('');setUploading(false);setError('');},[actorId,actorRole,buId]);
 const {documents:allDocuments,clauses:readableClauses}=selectHistoryResources(snapshot,permissionContext);
 const documents=allDocuments.filter(doc=>!groupScope||groupScope.matches('history',doc));
 const active=documents.find(doc=>doc.id===activeId);
 useEffect(()=>{if(activeId&&!active){setEditing(null);setMetadata(null);setActiveId(null);setSelected([]);}},[activeId,!!active]);
 const rows=active?latestVersions(clausesForDocument(active,readableClauses)):[];
 const issues=row=>historyClauseIssues(row);
 const filteredRows=rows.filter(row=>(filter==='all'||filter==='missing'&&!row.answer?.trim()||filter==='review'&&issues(row).length||row.status===filter)&&[row.clauseNo,row.section,row.requirement,row.answer,row.conditions].join(' ').toLowerCase().includes(query.toLowerCase()));
 const projects=(permissionContext?.state?.projects||[]).filter(project=>project.buId===buId&&canAccessProject(permissionContext.state,actorId,project.id));
 const notify=message=>{toast?.(message);logEvent?.(message);};
 const fail=cause=>{setError(cause.message);toast?.(cause.message,'error');};
 const persist=next=>{writeHistorySnapshot(buId,next);setSnapshot(next);};
 const openDoc=doc=>{const match=query&&latestVersions(clausesForDocument(doc,readableClauses)).find(row=>[row.clauseNo,row.requirement,row.answer].join(' ').toLowerCase().includes(query.toLowerCase()));setActiveId(doc.id);setQuery('');setFilter('all');setSelected([]);setError('');if(match)editClause(match);};
 function changePage(){setActiveId(null);setSelected([]);setFilter('all');setQuery('');}
 async function upload(){
  setError('');setBusy(true);
  try{const result=await startHistoryUpload({...files,...(groupScope?{groupIds:groupScope.validate(files.groupIds||groupScope.defaultGroupIds,groupScope.groups('history',allDocuments.find(d=>d.id===files.previousDocumentId)||{}))}:{}),buId,actor,legacy,permissionContext});setUploading(false);setFiles({});setQuery('');openDoc(result.document);notify(result.duplicate?'已上传相同文件，已打开现有文档':'原件已保存，正在解析历史条款');}
  catch(cause){fail(cause);}finally{setBusy(false);}
 }
 function saveMetadata(){
  try{
   if(!actor.canEdit)throw new Error('当前身份无编辑权限');
   if(metadata.scope==='仅当前项目'&&!projects.some(project=>project.id===metadata.projectId))throw new Error('请关联一个有权访问的项目');
   const fresh=load();let current=selectHistoryResources(fresh,permissionContext).documents.find(doc=>doc.id===metadata.id);
   if(current?.legacy){const migrated=materializeHistoryDocument({...current,buId},fresh.documents,fresh.clauses);current=migrated.document;fresh.documents=migrated.documents;fresh.clauses=migrated.clauses;}
   if(!current)throw new Error('文档范围已变化或无权访问，请重新打开');
   if(!metadata.version?.trim())throw new Error('请填写文件版本');
   if(fresh.documents.some(doc=>doc.id!==current.id&&versionFamily(doc)===versionFamily(current)&&doc.version===metadata.version.trim()))throw new Error('该 RFQ 已有相同版本标识');
   const updated={...current,...(groupScope?{groupIds:groupScope.validate(metadata.groupIds||[],groupScope.groups('history',current))}:{}),metadata:{...current.metadata,...metadata.metadata},scope:metadata.scope,projectId:metadata.projectId,version:metadata.version,versionEdited:current.versionEdited||metadata.version!==current.version};
   persist({documents:fresh.documents.map(doc=>doc.id===updated.id?updated:doc),clauses:applyHistoryMetadata(updated,fresh.clauses)});setMetadata(null);setActiveId(updated.id);notify('文档信息已保存，关联条款同步更新');
  }catch(cause){fail(cause);}
 }
 function editClause(row){setEditing({...row});setAnchor(row.requirementAnchor||row.answerAnchor||'');setError('');}
 function manual(){
  if(!actor.canEdit)return;
  const id=`HK-${crypto.randomUUID()}`;
  setEditing({id,version:1,type:'history',documentId:active?.id,buId,sourceKey:`manual:${id}`,manual:true,clauseNo:'',section:'',requirement:'',answer:'',conditions:'',status:'草稿',scope:active?.scope||'FEP 授权项目',submitterId:actor.id,issues:[]});setAnchor('');
 }
 function saveClause(){
  try{
   if(!actor.canEdit)throw new Error('当前身份无编辑权限');
   if(!editing.requirement?.trim())throw new Error('请填写客户要求');
   const fresh=load(),previous=fresh.clauses.find(row=>token(row)===token(editing));
   const accessible=selectHistoryResources(fresh,permissionContext);
   if(previous&&!accessible.clauses.some(row=>token(row)===token(previous)))throw new Error('条款范围已变化或无权访问，请重新打开');
   if(previous&&['待审核','已发布','已撤销'].includes(previous.status)&&!editing.newVersion)throw new Error('该版本已提交，请修订新版本');
   const changed=editableFields.filter(field=>(editing[field]||'')!==(previous?.[field]||''));
   const parentId=editing.documentId||activeId;
   let doc=parentId?accessible.documents.find(row=>row.id===parentId):null;
   if(parentId&&!doc)throw new Error('文档范围已变化或无权访问，请重新打开');
   if(doc?.legacy){const migrated=materializeHistoryDocument({...doc,buId},fresh.documents,fresh.clauses);doc=migrated.document;fresh.documents=migrated.documents;fresh.clauses=migrated.clauses;}
   if(!doc){doc={...(groupScope?{groupIds:groupScope.defaultGroupIds}:{}),id:`HD-${crypto.randomUUID()}`,buId,name:'手工补录历史知识',version:'V1',metadata:{},scope:editing.scope||'FEP 授权项目',projectId:editing.sourceProjectId||editing.projectId,parseStatus:'manual',sources:[],issues:[],createdAt:new Date().toISOString()};fresh.documents=[doc,...fresh.documents];}
   const item={...editing,documentId:doc.id,title:editing.requirement.slice(0,40),status:'草稿',submitterId:actor.id,submitterRole:actor.role,author:actor.name,editedFields:[...new Set([...(previous?.editedFields||[]),...changed])],history:[...(editing.history||[]),{date:new Date().toISOString(),text:`${actor.name} 保存历史知识草稿`}]};delete item.newVersion;
   const clauses=previous?fresh.clauses.map(row=>token(row)===token(item)?item:row):[...fresh.clauses,item];
   persist({...fresh,clauses:applyHistoryMetadata(doc,clauses)});setEditing(null);setActiveId(doc.id);notify('条款草稿已保存');
  }catch(cause){fail(cause);}
 }
 function transition(action,reviewReason=''){
  try{const fresh=load(),readable=new Set(selectHistoryResources(fresh,permissionContext).clauses.map(token));if(selected.some(id=>!readable.has(id)))throw new Error('所选条款已变化或无权访问');persist({...fresh,clauses:transitionHistoryClauses(fresh.clauses,selected,action,actor,reviewReason)});setSelected([]);setReview(null);setReason('');notify(action==='submit'?'所选条款已提交审核':action==='approve'?'所选条款已批准发布':'所选条款已退回');}catch(cause){fail(cause);}
 }
 async function download(){try{if(!selectHistoryResources(load(),permissionContext).documents.some(doc=>doc.id===active.id))throw new Error('文档范围已变化或无权访问');const originals=await historyFiles.get(buId,active.id);if(!originals?.file)throw new Error('此记录没有可下载的原件');for(const file of [originals.file,originals.responseFile].filter(Boolean)){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name||active.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}catch(cause){fail(cause);}}
 const pending=active?.parseStatus==='parsing'&&historyJobRunning(buId,active.id);
 const interrupted=active?.parseStatus==='parsing'&&!pending;
 const editReadonly=editing&&['待审核','已发布','已撤销'].includes(editing.status);
 const panelIndex=editing?rows.findIndex(row=>token(row)===token(editing)):-1;
 const documentColumns=[{title:'文档名称',dataIndex:'name',width:260,render:(value,doc)=><div><Button type="link" onClick={()=>openDoc(doc)}>{value}</Button><small className="history-subtext">{doc.uploadedBy||'历史知识'} · {date(doc.createdAt)}</small></div>},{title:'客户／项目',key:'project',render:(_,doc)=><>{doc.metadata?.customer||'待补充'}<small className="history-subtext">{doc.metadata?.projectName||'—'}</small></>},{title:'机型',render:(_,doc)=>doc.metadata?.model||'—'},{title:'文件版本',dataIndex:'version',width:100},{title:'解析状态',width:130,render:(_,doc)=><Tag color={doc.parseStatus==='failed'?'error':doc.parseStatus==='complete'?'success':'default'}>{doc.parseStatus==='parsing'&&!historyJobRunning(buId,doc.id)?'解析中断':parseLabel[doc.parseStatus]}</Tag>},{title:'条款数',width:90,render:(_,doc)=>latestVersions(clausesForDocument(doc,readableClauses)).length},{title:'操作',width:90,render:(_,doc)=><Button type="link" onClick={()=>openDoc(doc)}>查看</Button>}];
 const clauseColumns=[{title:'原编号／章节',width:150,render:(_,row)=><><strong>{row.clauseNo||'无编号'}</strong><small className="history-subtext">{row.section||'正文'}</small></>},{title:'客户要求',dataIndex:'requirement',render:value=><p className="history-clause-excerpt">{value||'待补充'}</p>},{title:'历史答复',dataIndex:'answer',render:value=><p className="history-clause-excerpt">{value||<span className="history-missing">未识别到答复</span>}</p>},{title:'状态／核对提示',width:180,render:(_,row)=><><Tag color={row.status==='已发布'?'success':row.status==='待审核'?'processing':'default'}>{row.status} · v{row.version}</Tag>{issues(row).slice(0,2).map(issue=><small className="history-missing" key={issue}>{issue}</small>)}</>},{title:'操作',width:130,render:(_,row)=><Button type="link" onClick={()=>editClause(row)}>查看／编辑</Button>}];
 return <div className="history-knowledge-page">
  <AdminPageHeader title={active?active.name:'历史 RFQ'} description={active?'文档信息统一维护，逐条核对历史要求与答复。':'上传历史 RFQ，提取要求与答复，沉淀可追溯的项目经验。'} actions={<Space wrap>{active?<UiButton onClick={changePage}>返回文档列表</UiButton>:<UiButton disabled={!actor.canEdit} onClick={manual}><Plus size={15}/>手工补录</UiButton>}<UiButton className="btn-primary" disabled={!actor.canEdit} onClick={()=>{setFiles(active&&!active.legacy?{previousDocumentId:active.id}:{});setUploading(true);setError('');}}><UploadIcon size={16}/>上传历史 RFQ</UiButton></Space>}/>
  {error&&<Alert type="error" showIcon closable onClose={()=>setError('')} message={error}/>}
  {!active?<section className="panel history-document-panel"><div className="history-toolbar"><Input.Search aria-label="搜索历史文档和条款" placeholder="搜索文档、客户、项目、要求或历史答复" value={query} onChange={event=>setQuery(event.target.value)} allowClear/><span>共 {documents.length} 份文档</span></div><Table columns={documentColumns} dataSource={filterHistoryDocuments(documents,readableClauses,query)} rowKey="id" scroll={{x:1050}} pagination={{pageSize:10,showSizeChanger:true}} locale={{emptyText:<Empty description="暂无历史 RFQ，上传文件后自动解析为条款草稿"/>}}/></section>:<>
   <HistoryVersionPanel key={active.id} active={active} documents={documents} clauses={readableClauses} onLocate={(doc,row)=>{setActiveId(doc.id);setQuery('');setFilter('all');if(row)editClause(row);else setEditing(null);}}/>
   <section className="panel history-metadata-panel"><div className="history-section-heading"><h2>文档信息</h2><Space>{<Button disabled={!actor.canEdit} onClick={()=>{setMetadata({...structuredClone(active),version:active.version||'V1',groupIds:groupScope?.groups('history',active)||active.groupIds||[]});setError('');}}>编辑文档信息</Button>}{!active.legacy&&!active.manual&&<Button onClick={download}><Download size={14}/>下载原件</Button>}</Space></div><Descriptions column={{xs:1,sm:2,lg:3}} items={[...Object.entries(labels).map(([key,label])=>({key,label,children:active.metadata?.[key]||'待补充'})),{key:'version',label:'文件版本',children:active.version||'—'},{key:'scope',label:'可见范围',children:active.scope||'FEP 授权项目'},{key:'response',label:'配套答复文件',children:active.responseName||'—'}]}/></section>
   {(pending||interrupted||active.parseStatus==='failed')&&<Alert type={pending?'info':'warning'} showIcon message={pending?'正在读取文件并解析条款，可以离开此页面，稍后返回查看。':interrupted?'上次解析未完成，原件已保留，可以重试。':active.error||'解析失败，请重试'} action={!pending&&<Button disabled={!actor.canEdit} onClick={()=>retryHistoryParse(active,actor,{legacy}).catch(fail)}>重试解析</Button>}/>}
   <div className="history-counts">{[{key:'all',label:'全部条款',count:rows.length},{key:'missing',label:'缺少答复',count:rows.filter(row=>!row.answer?.trim()).length},{key:'review',label:'需核对',count:rows.filter(row=>issues(row).length).length},{key:'待审核',label:'待审核',count:rows.filter(row=>row.status==='待审核').length},{key:'已发布',label:'已发布',count:rows.filter(row=>row.status==='已发布').length}].map(item=><button key={item.key} className={filter===item.key?'active':''} onClick={()=>{setFilter(item.key);setSelected([]);}}><span>{item.label}</span><strong>{item.count}</strong></button>)}</div>
   {active.issues?.length>0&&<details className="panel history-issues"><summary>有 {active.issues.length} 处原文需要人工核对</summary><p>未归入条款的内容仍保留在原文中，可定位后补录。</p>{active.issues.map((issue,index)=><div key={index}><span>{issue}</span><Button type="link" onClick={()=>{manual();setAnchor(issue.split('：')[0]);}}>定位并补录</Button></div>)}</details>}
   <section className="panel history-clause-panel"><div className="history-toolbar"><Input.Search aria-label="搜索文档内条款" placeholder="搜索编号、要求或历史答复" value={query} onChange={event=>setQuery(event.target.value)} allowClear/><Space wrap><Button disabled={!actor.canEdit} onClick={manual}>补录条款</Button>{!active.legacy&&!active.manual&&<Button disabled={!actor.canEdit||pending} onClick={()=>retryHistoryParse(active,actor,{legacy}).catch(fail)}>重新解析</Button>}</Space></div><div className="history-batch-bar"><span>已选择 {selected.length} 条</span><Space wrap><Button type="primary" disabled={!selected.length||!actor.canEdit} onClick={()=>transition('submit')}>提交审核</Button>{actor.canApprove&&<><Button disabled={!selected.length} onClick={()=>transition('approve')}>批准发布</Button><Button disabled={!selected.length} onClick={()=>{setReview('return');setReason('');}}>退回</Button></>}</Space></div><Table columns={clauseColumns} dataSource={filteredRows} rowKey={token} rowSelection={{selectedRowKeys:selected,onChange:setSelected,preserveSelectedRowKeys:false}} scroll={{x:1000}} pagination={{pageSize:20,showSizeChanger:true}} locale={{emptyText:<Empty description={pending?'正在解析，完成后条款将显示在这里':'当前没有符合条件的条款'}/>}}/></section>
  </>}
  <Modal open={uploading} title="上传历史 RFQ" onCancel={()=>{if(!busy){setUploading(false);setFiles({});}}} footer={<><Button disabled={busy} onClick={()=>setUploading(false)}>取消</Button><Button type="primary" loading={busy} disabled={!files.file} onClick={upload}>上传并开始解析</Button></>}>
   <GroupPicker value={files.groupIds||groupScope?.defaultGroupIds||[]} onChange={groupIds=>setFiles({...files,groupIds})}/><Space direction="vertical" style={{width:'100%',marginBottom:16}}>
    <label>上传方式</label><Select aria-label="上传方式" style={{width:'100%'}} value={files.previousDocumentId?'revision':'new'} options={[{value:'new',label:'新增历史 RFQ'},{value:'revision',label:'已有 RFQ 的新版本',disabled:!documents.some(doc=>!doc.legacy)}]} onChange={value=>setFiles(current=>({...current,previousDocumentId:value==='revision'?documents.find(doc=>!doc.legacy)?.id:undefined}))}/>
    {files.previousDocumentId&&<><label>关联历史 RFQ</label><Select aria-label="关联历史 RFQ" style={{width:'100%'}} value={files.previousDocumentId} options={documents.filter(doc=>!doc.legacy).map(doc=>({value:doc.id,label:doc.name+' · '+doc.version}))} onChange={previousDocumentId=>setFiles(current=>({...current,previousDocumentId}))}/><Alert type="info" message="新版本独立保存，继承关联文档的可见范围；旧版本与原件保留。"/></>}
    <label>客户版本标识（可选，留空自动编号）</label><Input aria-label="客户版本标识" value={files.versionLabel||''} onChange={event=>setFiles(current=>({...current,versionLabel:event.target.value}))}/>
    <label>变更说明</label><Input.TextArea aria-label="变更说明" value={files.changeNote||''} onChange={event=>setFiles(current=>({...current,changeNote:event.target.value}))}/>
   </Space>
   <p className="history-upload-intro">选择已完成应答的历史文件。客户要求和答复分开保存时，可追加配套答复文件。</p><label className="history-file-label">历史 RFQ 文件 *</label><div className="history-upload-drop" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();setFiles(value=>({...value,file:event.dataTransfer.files[0]}));}}><FileText size={30}/><p>拖入文件，或点击选择</p><input aria-label="历史 RFQ 文件" type="file" accept=".docx,.pdf" onChange={event=>setFiles(value=>({...value,file:event.target.files[0]}))}/>{files.file&&<strong>{files.file.name}</strong>}<small>DOCX / PDF，每个文件不超过 30 MiB</small></div><label className="history-file-label">配套答复文件（可选）</label><input aria-label="配套答复文件" type="file" accept=".docx,.pdf" onChange={event=>setFiles(value=>({...value,responseFile:event.target.files[0]}))}/>{error&&<Alert type="error" message={error}/>}
  </Modal>
  <Modal open={!!metadata} title="编辑文档信息" onCancel={()=>setMetadata(null)} onOk={saveMetadata} okText="保存文档信息" width={720}>
   {metadata&&<div className="history-metadata-form"><GroupPicker value={metadata.groupIds||[]} onChange={groupIds=>setMetadata({...metadata,groupIds})}/>{Object.entries(labels).map(([key,label])=><label key={key}><span>{label}</span><Input aria-label={label} value={metadata.metadata?.[key]||''} onChange={event=>setMetadata(value=>({...value,metadata:{...value.metadata,[key]:event.target.value}}))}/></label>)}<label><span>文件版本</span><Input aria-label="文件版本" value={metadata.version} onChange={event=>setMetadata(value=>({...value,version:event.target.value}))}/></label><label><span>可见范围</span><Select aria-label="可见范围" value={metadata.scope} options={['FEP 授权项目','仅当前项目','授权专业人员'].map(value=>({value,label:value}))} onChange={scope=>setMetadata(value=>({...value,scope}))}/></label>{metadata.scope==='仅当前项目'&&<label><span>关联项目 *</span><Select aria-label="关联项目" value={metadata.projectId} options={projects.map(project=>({value:project.id,label:project.name}))} onChange={projectId=>setMetadata(value=>({...value,projectId}))}/></label>}</div>}{error&&<Alert type="error" message={error}/>}
  </Modal>
  <Drawer open={!!editing} width="min(1320px, 96vw)" title={editing?`条款核对 · ${editing.clauseNo||'补录'}`:''} onClose={()=>{if(!busy)setEditing(null);}} extra={<Space><Button disabled={panelIndex<=0} onClick={()=>editClause(rows[panelIndex-1])}>上一条</Button><Button disabled={panelIndex<0||panelIndex>=rows.length-1} onClick={()=>editClause(rows[panelIndex+1])}>下一条</Button></Space>} footer={<Space><Button onClick={()=>setEditing(null)}>关闭</Button>{editing?.status==='已发布'?<Button disabled={!actor.canEdit} onClick={()=>setEditing(value=>({...value,version:Math.max(...snapshot.clauses.filter(row=>row.id===value.id).map(row=>row.version))+1,status:'草稿',newVersion:true}))}>修订新版本</Button>:<Button type="primary" disabled={!actor.canEdit||editReadonly} onClick={saveClause}>保存草稿</Button>}</Space>}>
   {editing&&<div className="history-review-layout"><section className="history-original"><div className="history-section-heading"><h3>原文</h3><Tag>点击段落或表格行选择来源</Tag></div><SourceBlocks sources={active?.sources} anchor={anchor} onLocate={setAnchor}/></section><section className="history-clause-form">{error&&<Alert type="error" message={error}/>}{editReadonly&&<Alert type="info" message={editing.status==='已发布'?'已发布版本只读，修订后需重新审核':'此版本已提交审核，审核后继续维护'}/>}
    <div className="history-field-pair"><label><span>原条款编号</span><Input aria-label="原条款编号" disabled={editReadonly} value={editing.clauseNo||''} onChange={event=>setEditing({...editing,clauseNo:event.target.value})}/></label><label><span>原章节</span><Input aria-label="原章节" disabled={editReadonly} value={editing.section||''} onChange={event=>setEditing({...editing,section:event.target.value})}/></label></div>
    {[['requirement','客户要求',4],['answer','历史答复',5],['conditions','适用条件与限制',3]].map(([key,label,height])=><label key={key}><span>{label}{['requirement','answer'].includes(key)&&<Button type="link" size="small" disabled={!editing[`${key}Anchor`]} onClick={()=>setAnchor(editing[`${key}Anchor`])}>定位原文</Button>}</span><Input.TextArea aria-label={label} disabled={editReadonly} value={editing[key]||''} rows={height} placeholder={key==='answer'?'原文没有答复时留空，可先保存草稿':'按原文填写'} onChange={event=>setEditing({...editing,[key]:event.target.value})}/></label>)}
    {anchor&&!editReadonly&&<Space wrap><Button size="small" onClick={()=>setEditing({...editing,requirementAnchor:anchor,sourceMissing:false})}>设为要求来源</Button><Button size="small" onClick={()=>setEditing({...editing,answerAnchor:anchor})}>设为答复来源</Button></Space>}
    <details><summary>特殊机型／配置、证据与反馈</summary>{[['modelOverride','条款特殊机型'],['configOverride','条款特殊配置'],['evidence','证据引用'],['feedback','客户反馈／验收结果']].map(([key,label])=><label key={key}><span>{label}</span><Input.TextArea aria-label={label} disabled={editReadonly} rows={2} value={editing[key]||''} onChange={event=>setEditing({...editing,[key]:event.target.value})}/></label>)}</details>
    {editing.history?.length>0&&<details><summary>版本与审核记录</summary>{snapshot.clauses.filter(row=>row.id===editing.id).sort((a,b)=>b.version-a.version).map(row=><Button type="link" key={row.version} onClick={()=>editClause(row)}>v{row.version} · {row.status}</Button>)}{editing.history.map((item,index)=><p key={index}><small>{item.date}</small> {item.text}</p>)}</details>}
   </section></div>}
  </Drawer>
  <Modal open={!!review} title="退回所选条款" onCancel={()=>setReview(null)} onOk={()=>transition('return',reason)} okText="确认退回"><Input.TextArea aria-label="退回原因" placeholder="填写需要补充或修正的内容" value={reason} onChange={event=>setReason(event.target.value)}/>{error&&<Alert type="error" message={error}/>}</Modal>
 </div>;
}
