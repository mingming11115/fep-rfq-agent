import {canAccessProject,getPersonnelContext,personName} from './personnelDomain.js';
import {selectReadableResources} from './resourceVisibility.js';

export const KNOWLEDGE_SOURCE_TYPES = [
 {value:'history-document',label:'历史文档'},
 {value:'professional-confirmation',label:'专业人员确认'},
 {value:'enterprise-standard',label:'企业标准口径'},
];
const versionLabel=value=>value==null||value===''?'未标注版本':/^[vV]/.test(String(value))?String(value):`v${value}`;

export function buildKnowledgeSourceOptions(context,evidence=[]) {
 const {state,actorId,buId}=context||{};
 if(!state||!actorId||!buId) { return {documents:[],people:[]}; }
 const actor=getPersonnelContext(state,actorId,buId);
 const system=actor.account?.enabled&&actor.account.systemAdmin&&state.businessUnits?.some(b=>b.id===buId);
 if(!actor.enabled&&!actor.managed&&!system) { return {documents:[],people:[]}; }
 const documents=[];
 for(const project of state.projects||[]) {
  if(project.buId!==buId||!canAccessProject(state,actorId,project.id)) { continue; }
  for(const file of state.documentsByProject?.[project.id]||[]) {
   if(!file.id||!file.name||file.deleted||file.deletedAt) { continue; }
   documents.push({value:JSON.stringify(['project',project.id,file.id,String(file.version??'')]),name:file.name,projectId:project.id,
    label:`${file.name} · ${versionLabel(file.version)} · ${project.id} ${project.name}`});
  }
 }
 for(const file of selectReadableResources(evidence,context,'evidence')) {
  if(!file.id||!file.name||file.deleted||file.deletedAt) { continue; }
  documents.push({value:JSON.stringify(['reference',file.id,String(file.version??'')]),name:file.name,projectId:file.projectId,
   label:`${file.name} · ${versionLabel(file.version)} · 资料库`});
 }
 const people=(state.buPersonnelByBuId?.[buId]||[])
  .filter(member=>member.roles?.includes('技术')&&getPersonnelContext(state,member.userId,buId).enabled)
  .map(member=>({id:member.userId,name:personName(state,member.userId)}));
 return {documents:[...new Map(documents.map(doc=>[doc.value,doc])).values()],people};
}

export function changeKnowledgeSourceType(form,sourceType) {
 if(sourceType&&!KNOWLEDGE_SOURCE_TYPES.some(type=>type.value===sourceType)) { throw new Error('无效的知识来源类型'); }
 return {...form,sourceType:sourceType||'',source:'',sourceDocumentKey:'',sourcePersonId:'',sourcePersonName:'',sourceStandardText:'',sourceProjectId:undefined};
}

export function prepareKnowledgeSource(form,{documents=[],people=[]}) {
 if(!form.sourceType) { return {...form,source:form.source||''}; }
 const result={...changeKnowledgeSourceType(form,form.sourceType)};
 if(form.sourceType==='history-document') {
  const doc=documents.find(option=>option.value===form.sourceDocumentKey);
  if(form.sourceDocumentKey&&!doc) { throw new Error('请选择当前可访问的历史文档'); }
  return {...result,sourceDocumentKey:form.sourceDocumentKey||'',sourceProjectId:doc?.projectId,source:doc?`历史文档：${doc.label}`:''};
 }
 if(form.sourceType==='professional-confirmation') {
  const person=people.find(option=>option.id===form.sourcePersonId);
  if(form.sourcePersonId&&!person) { throw new Error('请选择本 BU 有效的专业人员'); }
  return {...result,sourcePersonId:person?.id||'',sourcePersonName:person?.name||'',source:person?`专业人员确认：${person.name}（${person.id}）`:''};
 }
 const sourceStandardText=form.sourceStandardText?.trim()||'';
 return {...result,sourceStandardText,source:sourceStandardText?`企业标准口径：${sourceStandardText}`:'企业标准口径'};
}
