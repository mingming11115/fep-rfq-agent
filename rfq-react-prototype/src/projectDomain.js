import {assertPermission} from './permissions.js';
import {getPersonnelContext,canAccessProject,personName} from './personnelDomain.js';

const projectMaps=['requirementsByProject','reviewsByProject','snapshotsByProject','documentsByProject','exportScopesByProject','commentsByProject','membersByProject'];

export function createProjectReviewSettings(technicalMode='all') {
 if(!['all','representative'].includes(technicalMode))throw new Error('无效的技术组评审方式');
 return {technicalMode,version:1};
}

export function handoverProject(state,{projectId,to,reason}) {
 assertPermission(state.actorRole,'project:handover',{state,actorId:state.actorId,projectId});
 if(!reason?.trim())throw new Error('请填写移交原因');
 const project=state.projects.find(p=>p.id===projectId),target=getPersonnelContext(state,to,project.buId);
 if(to===state.actorId||!target.enabled||!target.member.roles.includes('SR')||!canAccessProject(state,to,projectId))throw new Error('接收人必须是已获本项目授权的有效SR');
 return {...state,projects:state.projects.map(p=>p.id===projectId?{...p,ownerId:to,owner:personName(state,to),handoverHistory:[...(p.handoverHistory||[]),{from:state.actorId,to,reason,at:new Date().toISOString()}]}:p)};
}

export function addProjectSources(state,projectId,files) {
 if(!state.projects.some(p=>p.id===projectId))throw new Error('项目不存在或已删除，无法上传资料');
 assertPermission(state.actorRole,'source:manage',state.accountsById?{state,actorId:state.actorId,projectId}:undefined);
 if(!state.projects.some(project=>project.id===projectId))throw new Error('项目不存在或已删除，无法上传资料');
 return {...state,documentsByProject:{...state.documentsByProject,[projectId]:[...(state.documentsByProject?.[projectId]||[]),...files]}};
}

export function removeProject(state,projectId) {
 if(!state.projects.some(p=>p.id===projectId))throw new Error('项目不存在，请刷新后重试');
 assertPermission(state.actorRole,'project:manage',state.accountsById?{state,actorId:state.actorId,projectId}:undefined);
 const index=state.projects.findIndex(p=>p.id===projectId);
 if(index<0)throw new Error('项目不存在，请刷新后重试');
 const backup={project:structuredClone(state.projects[index]),index,maps:{},tasksById:{},analysisRuns:[],deletedAt:new Date().toISOString(),deletedBy:state.actorId};
 const next={...state,projects:state.projects.filter(p=>p.id!==projectId)};
 for(const key of projectMaps){
  if(state[key]?.[projectId]!==undefined)backup.maps[key]=structuredClone(state[key][projectId]);
  next[key]={...state[key]};delete next[key][projectId];
 }
 backup.tasksById=Object.fromEntries(Object.entries(state.tasksById||{}).filter(([,task])=>task.projectId===projectId));
 next.tasksById=Object.fromEntries(Object.entries(state.tasksById||{}).filter(([,task])=>task.projectId!==projectId));
 backup.analysisRuns=(state.analysisRuns||[]).map((run,index)=>({run,index})).filter(({run})=>run.projectId===projectId);
 next.analysisRuns=(state.analysisRuns||[]).filter(run=>run.projectId!==projectId);
 next.deletedProjectsById={...state.deletedProjectsById,[projectId]:backup};
 if(state.activeProjectId===projectId)next.activeProjectId=next.projects[0]?.id||null;
 return next;
}

export function restoreProject(state,projectId) {
 const record=state.deletedProjectsById?.[projectId];
 const permissionState=record?{...state,projects:[...state.projects,record.project]}:state;
 assertPermission(state.actorRole,'project:manage',state.accountsById?{state:permissionState,actorId:state.actorId,projectId}:undefined);
 const backup=state.deletedProjectsById?.[projectId];
 if(!backup)throw new Error('没有可恢复的项目记录');
 if(state.projects.some(p=>p.id===projectId))throw new Error('同编号项目已存在，无法重复恢复');
 const next={...state,projects:[...state.projects],tasksById:{...state.tasksById,...structuredClone(backup.tasksById)},analysisRuns:[...(state.analysisRuns||[])],deletedProjectsById:{...state.deletedProjectsById}};
 next.projects.splice(Math.min(backup.index,next.projects.length),0,structuredClone(backup.project));
 for(const [key,value]of Object.entries(backup.maps))next[key]={...state[key],[projectId]:structuredClone(value)};
 for(const {run,index}of backup.analysisRuns)next.analysisRuns.splice(Math.min(index,next.analysisRuns.length),0,structuredClone(run));
 if(!next.activeProjectId)next.activeProjectId=projectId;
 delete next.deletedProjectsById[projectId];
 return next;
}
