import {assertPermission} from './permissions.js';
import {getPersonnelContext,canAccessProject,personName,getProjectOwnerCandidates,getEligiblePersonnel} from './personnelDomain.js';

const projectMaps=['requirementsByProject','reviewsByProject','snapshotsByProject','documentsByProject','exportScopesByProject','commentsByProject','membersByProject'];

export function createProjectPersonnel(state,{buId,ownerId,srId,technicalIds=[],technicalRepresentativeId=null,technicalMode='all'}) {
 if(!getProjectOwnerCandidates(state,{buId}).some(p=>p.userId===ownerId)) { throw new Error('请通过 @ 选择本BU有效SR作为负责人'); }
 createProjectReviewSettings(technicalMode);
 const srCandidates=getEligiblePersonnel(state,{buId,duty:'final-review',side:'sr'});
 const technicalCandidates=getEligiblePersonnel(state,{buId,duty:'final-review',side:'technical'});
 const selectedSrId=srId===undefined?(srCandidates.some(p=>p.userId===ownerId)?ownerId:''):srId;
 if(selectedSrId&&!srCandidates.some(p=>p.userId===selectedSrId)) { throw new Error('请选择本BU具有最终评审资格的SR评审人'); }
 if(!Array.isArray(technicalIds)||new Set(technicalIds).size!==technicalIds.length||technicalIds.some(id=>id===selectedSrId||!technicalCandidates.some(p=>p.userId===id))) { throw new Error('请选择本BU有效且不重复的技术组评审成员，SR评审人与技术组成员不能是同一账号'); }
 const representativeId=technicalMode==='representative'?technicalRepresentativeId||null:null;
 if(representativeId&&!technicalIds.includes(representativeId)) { throw new Error('请选择技术组内的负责人'); }
 const reviewers={srId:selectedSrId,technicalIds:[...technicalIds],technicalRepresentativeId:representativeId};
 return {ownerId,owner:personName(state,ownerId),participantIds:[...new Set([state.actorId,ownerId,selectedSrId,...technicalIds].filter(Boolean))],approvalConfig:{finalReviewers:reviewers}};
}

export function createProjectReviewSettings(technicalMode='all') {
 if(!['all','representative'].includes(technicalMode)) { throw new Error('无效的技术组评审方式'); }
 return {technicalMode,version:1};
}

export function handoverProject(state,{projectId,to,reason}) {
 assertPermission(state.actorRole,'project:handover',{state,actorId:state.actorId,projectId});
 if(!reason?.trim()) { throw new Error('请填写移交原因'); }
 const project=state.projects.find(p=>p.id===projectId),target=getPersonnelContext(state,to,project.buId);
 if(to===state.actorId||!target.enabled||!target.member.roles.includes('SR')||!canAccessProject(state,to,projectId)) { throw new Error('接收人必须是已获本项目授权的有效SR'); }
 return {...state,projects:state.projects.map(p=>p.id===projectId?{...p,ownerId:to,owner:personName(state,to),handoverHistory:[...(p.handoverHistory||[]),{from:state.actorId,to,reason,at:new Date().toISOString()}]}:p)};
}

export function updateProjectSettings(state,{projectId,patch,invalidateTechnical=false}) {
 assertPermission(state.actorRole,'project:manage',{state,actorId:state.actorId,projectId});
 if(Object.keys(patch).some(key=>!['name','customer','owner','ownerId','deadline','equipment','reason'].includes(key))) { throw new Error('人员与评审配置请使用项目人员分派入口'); }
 const project=state.projects.find(p=>p.id===projectId),ownerId=patch.ownerId||project.ownerId;
 const next=ownerId!==project.ownerId?handoverProject(state,{projectId,to:ownerId,reason:patch.reason}):state;
 const rows=state.requirementsByProject?.[projectId]||[];
 const invalidate=invalidateTechnical&&patch.equipment!==undefined&&patch.equipment!==project.equipment&&rows.some(row=>row.category==='技术');
 return {...next,projects:next.projects.map(p=>p.id===projectId?{...p,...patch,ownerId,owner:personName(next,ownerId),version:(p.version||1)+(invalidate?1:0)}:p),
  ...(invalidate?{requirementsByProject:{...next.requirementsByProject,[projectId]:rows.map(row=>row.category==='技术'?{...row,status:'待确认',version:(row.version||1)+1,reason:`设备配置基线变化：${patch.reason}`,confirmedAt:undefined,confirmedBy:undefined}:row)}}:{}),
 };
}

export function addProjectSources(state,projectId,files) {
 if(!state.projects.some(p=>p.id===projectId)) { throw new Error('项目不存在或已删除，无法上传资料'); }
 assertPermission(state.actorRole,'source:manage',state.accountsById?{state,actorId:state.actorId,projectId}:undefined);
 if(!state.projects.some(project=>project.id===projectId)) { throw new Error('项目不存在或已删除，无法上传资料'); }
 return {...state,documentsByProject:{...state.documentsByProject,[projectId]:[...(state.documentsByProject?.[projectId]||[]),...files]}};
}

export function removeProject(state,projectId) {
 if(!state.projects.some(p=>p.id===projectId)) { throw new Error('项目不存在，请刷新后重试'); }
 assertPermission(state.actorRole,'project:manage',state.accountsById?{state,actorId:state.actorId,projectId}:undefined);
 const index=state.projects.findIndex(p=>p.id===projectId);
 if(index<0) { throw new Error('项目不存在，请刷新后重试'); }
 const backup={project:structuredClone(state.projects[index]),index,maps:{},tasksById:{},analysisRuns:[],deletedAt:new Date().toISOString(),deletedBy:state.actorId};
 const next={...state,projects:state.projects.filter(p=>p.id!==projectId)};
 for(const key of projectMaps){
  if(state[key]?.[projectId]!==undefined) { backup.maps[key]=structuredClone(state[key][projectId]); }
  next[key]={...state[key]};delete next[key][projectId];
 }
 backup.tasksById=Object.fromEntries(Object.entries(state.tasksById||{}).filter(([,task])=>task.projectId===projectId));
 next.tasksById=Object.fromEntries(Object.entries(state.tasksById||{}).filter(([,task])=>task.projectId!==projectId));
 backup.analysisRuns=(state.analysisRuns||[]).map((run,index)=>({run,index})).filter(({run})=>run.projectId===projectId);
 next.analysisRuns=(state.analysisRuns||[]).filter(run=>run.projectId!==projectId);
 next.deletedProjectsById={...state.deletedProjectsById,[projectId]:backup};
 if(state.activeProjectId===projectId) { next.activeProjectId=next.projects[0]?.id||null; }
 return next;
}

export function restoreProject(state,projectId) {
 const record=state.deletedProjectsById?.[projectId];
 const permissionState=record?{...state,projects:[...state.projects,record.project]}:state;
 assertPermission(state.actorRole,'project:manage',state.accountsById?{state:permissionState,actorId:state.actorId,projectId}:undefined);
 const backup=state.deletedProjectsById?.[projectId];
 if(!backup) { throw new Error('没有可恢复的项目记录'); }
 if(state.projects.some(p=>p.id===projectId)) { throw new Error('同编号项目已存在，无法重复恢复'); }
 const next={...state,projects:[...state.projects],tasksById:{...state.tasksById,...structuredClone(backup.tasksById)},analysisRuns:[...(state.analysisRuns||[])],deletedProjectsById:{...state.deletedProjectsById}};
 next.projects.splice(Math.min(backup.index,next.projects.length),0,structuredClone(backup.project));
 for(const [key,value]of Object.entries(backup.maps))next[key]={...state[key],[projectId]:structuredClone(value)};
 for(const {run,index}of backup.analysisRuns)next.analysisRuns.splice(Math.min(index,next.analysisRuns.length),0,structuredClone(run));
 if(!next.activeProjectId) { next.activeProjectId=projectId; }
 delete next.deletedProjectsById[projectId];
 return next;
}
