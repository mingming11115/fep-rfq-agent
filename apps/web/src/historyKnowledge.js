import {selectReadableResources} from './resourceVisibility.js';

const text=value=>String(value??'').trim();
const now=()=>new Date().toISOString();
const uid=()=>`HK-${crypto.randomUUID()}`;
export const HISTORY_DOCUMENT_KEY='rfq.history.documents.v1';
export const HISTORY_KNOWLEDGE_KEY='rfq.reference.knowledge.v1';

export function clausesForDocument(document,clauses) {
 return clauses.filter(clause=>clause.type==='history'&&(document.legacy?document.legacyIds.includes(clause.id):clause.documentId===document.id));
}
export function buildHistoryDocuments(documents,clauses) {
 const legacy=clauses.filter(row=>row.type==='history'&&!row.documentId),groups=new Map();
 for(const row of legacy){const key=JSON.stringify([row.source||'手工历史知识',row.scope||'FEP 授权项目',row.sourceProjectId||row.projectId||'']);if(!groups.has(key)) { groups.set(key,[]); } groups.get(key).push(row);}
 return [...documents,...[...groups.entries()].map(([key,rows])=>({id:`legacy:${key}`,buId:rows[0].buId||'BU-DEMO',legacy:true,...(rows.some(r=>Array.isArray(r.groupIds)||r.groupId)?{groupIds:[...new Set(rows.flatMap(r=>Array.isArray(r.groupIds)?r.groupIds:r.groupId?[r.groupId]:[]))]}:{}),legacyIds:[...new Set(rows.map(row=>row.id))],name:rows[0].source||'手工历史知识',metadata:{},version:'—',parseStatus:'legacy',scope:rows[0].scope,projectId:rows[0].sourceProjectId||rows[0].projectId,createdAt:'',issues:[],sources:[]}))];
}
export function selectHistoryResources(snapshot,context){
 const documents=selectReadableResources(snapshot.documents.map(document=>({...document,status:'草稿'})),context,'knowledge');
 const ids=new Set(documents.map(document=>document.id));
 const clauses=selectReadableResources(snapshot.clauses,context,'knowledge').filter(row=>!row.documentId||ids.has(row.documentId));
 return {documents:buildHistoryDocuments(documents,clauses),clauses};
}
export function historyClauseIssues(clause) {
 return [...new Set([!text(clause.requirement)&&'缺少客户要求',!text(clause.answer)&&'缺少历史答复',clause.sourceMissing&&'本次解析未找到原条款',...(clause.issues||[]).filter(issue=>!['缺少客户要求','缺少历史答复'].includes(issue))].filter(Boolean))];
}
export function filterHistoryDocuments(documents,clauses,query='') {
 const search=text(query).toLowerCase();if(!search) { return documents; }
 return documents.filter(doc=>[doc.name,...Object.values(doc.metadata||{}),...clausesForDocument(doc,clauses).flatMap(row=>[row.clauseNo,row.section,row.requirement,row.answer,row.conditions])].join(' ').toLowerCase().includes(search));
}
export function applyHistoryMetadata(document,clauses) {
 return clauses.map(row=>row.documentId===document.id?{...row,...(Array.isArray(document.groupIds)?{groupIds:[...document.groupIds]}:{}),scope:document.scope,sourceProjectId:document.projectId||undefined,projectId:document.projectId||undefined,source:document.legacyImported&&row.source?row.source:`${document.name} · ${document.version||'未标注版本'}${row.clauseNo?` · 条款 ${row.clauseNo}`:''}`} : row);
}
export function materializeHistoryDocument(document,documents,clauses){
 if(!document.legacy) { return {document,documents,clauses}; }
 const real={...document,id:`HD-${crypto.randomUUID()}`,legacy:false,legacyImported:true,manual:true,parseStatus:'manual',createdAt:now()};
 delete real.legacyIds;
 return {document:real,documents:[real,...documents],clauses:clauses.map(row=>!row.documentId&&document.legacyIds.includes(row.id)?{...row,documentId:real.id}:row)};
}
export function mergeHistoryParse(document,existing,result,actor) {
 const current=existing.filter(row=>row.documentId===document.id),seen=new Set(),changes=[];
 const merged=(result.clauses||[]).map(parsed=>{
  seen.add(parsed.key);
  const versions=current.filter(row=>row.sourceKey===parsed.key).sort((a,b)=>b.version-a.version),previous=versions[0];
  if(previous&&previous.status!=='草稿'&&previous.status!=='退回') { return versions; }
  const incoming={...parsed,id:previous?.id||uid(),sourceKey:parsed.key,documentId:document.id,buId:document.buId,type:'history',title:parsed.requirement?.slice(0,40)||'待补录条款',version:previous?.version||1,status:previous?.status||'草稿',submitterId:previous?.submitterId||actor.id,submitterRole:actor.role,author:actor.name||actor.id,editedFields:previous?.editedFields||[],history:previous?.history||[{date:now(),text:'上传历史 RFQ 解析为草稿'}]};
  if(previous){for(const field of previous.editedFields||[])incoming[field]=previous[field];if(JSON.stringify(parsed)!==JSON.stringify(previous.parsedSnapshot)) { changes.push(parsed.key); }}
  incoming.parsedSnapshot=parsed;
  return [...versions.filter(row=>row!==previous),incoming];
 }).flat();
 for(const previous of current)if(!seen.has(previous.sourceKey)) { merged.push(previous.manual?previous:{...previous,sourceMissing:true}); }
 const metadata={...result.metadata,...Object.fromEntries(Object.entries(document.metadata||{}).filter(([,value])=>text(value)))};
 const nextDocument={...document,version:document.versionEdited?document.version:result.metadata?.fileVersion||document.version,metadata,sources:result.sources||[],issues:result.issues||[],parseStatus:(result.issues?.length||merged.some(row=>historyClauseIssues(row).length))?'partial':'complete',parsedAt:now(),error:'',changedKeys:changes};
 return {document:nextDocument,clauses:applyHistoryMetadata(nextDocument,merged)};
}
export function transitionHistoryClauses(clauses,ids,action,actor,reason='') {
 const selected=clauses.filter(row=>ids.includes(`${row.id}:${row.version}`)||ids.includes(row.id));
 if(!selected.length) { throw new Error('请先选择条款'); }
 if(action==='submit'?!actor.canEdit:!actor.canApprove) { throw new Error('当前身份无此操作权限'); }
 for(const row of selected){
  if(action==='submit'){
   if(!['草稿','退回'].includes(row.status)) { throw new Error('仅草稿或退回条款可以提交'); }
   if(!text(row.requirement)||!text(row.answer)) { throw new Error('请补齐客户要求和历史答复后提交'); }
   if(row.sourceMissing) { throw new Error('原文变化的条款需核对来源后提交'); }
  }else if(action==='approve'||action==='return'){
   if(row.status!=='待审核') { throw new Error('仅待审核条款可以审核'); }
   if(row.submitterId===actor.id) { throw new Error('同一版本不得自审，请由其他 BU 审核人员处理'); }
  }
 }
 if(action==='return'&&!text(reason)) { throw new Error('请填写退回原因'); }
 const states={submit:'待审核',approve:'已发布',return:'退回'};
 if(!states[action]) { throw new Error('无效的条款操作'); }
 const selectedKeys=new Set(selected.map(row=>`${row.id}:${row.version}`));
 return clauses.map(row=>selectedKeys.has(`${row.id}:${row.version}`)?{...row,status:states[action],validity:action==='approve'?'有效':'待核对',...(action==='submit'?{submitterId:actor.id,submitterRole:actor.role}:{}),history:[...(row.history||[]),{date:now(),text:`${actor.name||actor.id} ${states[action]}${reason?`：${reason}`:''}`}]}:row);
}
