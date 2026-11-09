import {canPerform} from './permissions.js';
export const PROJECT_PAGES=['response','reviews','export','versions','settings'];
export const ADMIN_PAGES=['bu-admin','admin','knowledge','history','capabilities','audit'];
export function getWorkspaceContentKey({actorId,actorRole,buId,projectId,page}){
 const workspace=PROJECT_PAGES.includes(page)?'project':['knowledge','history','capabilities'].includes(page)?'knowledge':['admin','audit'].includes(page)?'platform':page;
 return JSON.stringify([actorId,actorRole,buId,workspace,projectId]);
}
export function getProjectEntryPage(state,projectId,destination='response') {
 return destination==='documents'?'response':destination;
}
const pages=['dashboard','tasks','projects','analysis',...PROJECT_PAGES,...ADMIN_PAGES];
const fields=['projectId','fileId','sourceVersion','requirementId','reviewId','snapshotId','taskId','returnKey','action','upload','buId','modelId','groupId'];
export function parseWorkRoute(hash='') {
 const [path,query='']=hash.replace(/^#\/?/,'').split('?');const route={page:path==='documents'?'response':pages.includes(path)?path:'dashboard'};
 const params=new URLSearchParams(query);for(const key of fields)if(params.has(key)) { route[key]=params.get(key); }
 return route;
}
export function buildWorkRoute(route) {
 const params=new URLSearchParams();for(const key of fields)if(route[key]!=null&&route[key]!=='') { params.set(key,route[key]); }
 return `#/${route.page==='documents'?'response':pages.includes(route.page)?route.page:'dashboard'}${params.size?'?'+params:''}`;
}
export function getSourceUploadRoute(route, role) {
 const next={page:'response',projectId:route.projectId};
 if(!canPerform(role,'source:manage')) { return next; }
 return ['response','settings','reviews','versions'].includes(route.page)?{...route,upload:'true'}:{...next,upload:'true'};
}
export function shouldOpenSourceUpload(route, role) {
 return canPerform(role,'source:manage')&&((['response','settings','reviews','versions'].includes(route?.page)&&route.upload==='true')||(route?.page==='documents'&&route.action==='upload'));
}
export function getSourceUploadExitRoute(route, submitted=false) {
 if(route.upload==='true'&&!submitted){const next={...route};delete next.upload;return next;}
 const origin=['response','settings','reviews','versions'].includes(route.returnKey)?route.returnKey:'response';
 return {page:submitted?'response':origin,projectId:route.projectId,returnKey:'projects'};
}
export function saveReturnContext(key,context,storage=globalThis.sessionStorage){try{storage?.setItem(`rfq.return:${key}`,JSON.stringify(context));}catch (error){ console.error('保存返回页面上下文失败', error); }}
export function readReturnContext(key,storage=globalThis.sessionStorage){try{return JSON.parse(storage?.getItem(`rfq.return:${key}`)||'null');}catch{ console.error('读取返回页面上下文失败'); return null;}}

