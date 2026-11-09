import {canAccessProject,getPersonnelContext} from './personnelDomain.js';

export const resourceStorageKey=(base,buId)=>buId==='BU-DEMO'?base:`${base}:${buId||'unassigned'}`;
const projectOrigin=row=>row.projectId||row.sourceProjectId||[row.source,row.sourceLocation,row.conditions,...(row.refs||[]).map(r=>r.title)].join(' ').match(/RFQ-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/)?.[0];
export function selectReadableResources(rows,context,kind='knowledge') {
 if(!context?.state||!context.actorId||!context.buId) { return []; }
 const {state,actorId,buId}=context,c=getPersonnelContext(state,actorId,buId);
 const sharedKnowledgeAdmin=c.account?.enabled&&c.account.systemAdmin&&state.businessUnits?.some(b=>b.id===buId)&&['knowledge','evidence'].includes(kind);
 if(!c.enabled&&!c.managed&&!sharedKnowledgeAdmin) { return []; }
 return rows.filter(row=>{
  if((row.buId||'BU-DEMO')!==buId) { return false; }
  if(kind==='catalog') { return true; }
  const origin=projectOrigin(row);
  if(row.scope==='仅当前项目') { return !!origin&&canAccessProject(state,actorId,origin); }
  const draft=['草稿','待审核','退回','候选'].includes(row.status);
  if(draft&&origin&&!canAccessProject(state,actorId,origin)) { return c.managed&&c.member?.enabled&&c.member.resourceQualifications?.includes(kind==='capability'?'capability-publish':'knowledge-publish')&&kind!=='evidence'; }
  return true;
 });
}
