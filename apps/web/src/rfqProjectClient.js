import {api as defaultApi,readSession} from './authClient.js';

function backendBu(project,user){
 const allowed=[...new Set((user?.roles||[]).filter(row=>['SR','BU_ADMIN'].includes(row.role)).map(row=>row.buId))];
 if(allowed.includes(project.buId)||user?.systemAdmin&&user.bus?.some(bu=>bu.id===project.buId))return project.buId;
 // The original browser-only demo uses BU-DEMO. Resolve this legacy alias only
 // when the authenticated account has exactly one eligible backend BU.
 if(project.buId==='BU-DEMO'&&allowed.length===1)return allowed[0];
 throw new Error('当前项目 BU 与登录账号的后端授权不一致，请选择已授权的 BU');
}

export async function createBackendProject(project,api=defaultApi,user=readSession()?.user){
 return api.post('/projects',{code:project.code||project.id,name:project.name.trim(),customer:project.customer||'',ownerId:project.ownerId,buId:backendBu(project,user),deadline:project.deadline,groupId:project.groupId});
}

export function deleteBackendProject(project,api=defaultApi){
 const id=encodeURIComponent(project.backendProjectId||project.id);
 return api.delete(`/projects/${id}?version=${encodeURIComponent(project.version)}`);
}

export function restoreBackendProject(project,reason,api=defaultApi){
 const id=encodeURIComponent(project.backendProjectId||project.id);
 return api.post(`/projects/${id}/restorations`,{version:project.version,reason:reason.trim()});
}

export async function ensureBackendProject(project,api=defaultApi,user=readSession()?.user){
 try{return await api.get(`/projects/${encodeURIComponent(project.backendProjectId||project.id)}`);}
 catch(error){if(error.status!==404||project.backendProjectId)throw error;}
 const code=project.code||project.id,buId=backendBu(project,user);
 const result=await api.get(`/projects?keyword=${encodeURIComponent(code)}&size=100`);
 const saved=(result.list||[]).find(row=>row.code===code);
 if(saved){
  if(saved.buId!==buId||saved.name!==project.name.trim()||saved.ownerId!==project.ownerId)throw new Error('后端已有同编号的其他项目，请核对项目编号后重试');
  return saved;
 }
 return createBackendProject(project,api,user);
}
