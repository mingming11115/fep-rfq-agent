import {assertPermission} from './permissions.js';

const projectMaps=['requirementsByProject','reviewsByProject','snapshotsByProject','documentsByProject','exportScopesByProject','commentsByProject','membersByProject'];

export function addProjectSources(state,projectId,files) {
 assertPermission(state.actorRole,'source:manage');
 if(!state.projects.some(project=>project.id===projectId))throw new Error('项目不存在或已删除，无法上传资料');
 return {...state,documentsByProject:{...state.documentsByProject,[projectId]:[...(state.documentsByProject?.[projectId]||[]),...files]}};
}

export function removeProject(state,projectId) {
 assertPermission(state.actorRole,'project:manage');
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
 assertPermission(state.actorRole,'project:manage');
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
