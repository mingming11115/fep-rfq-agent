import {canPerform} from './permissions.js';
export const PROJECT_PAGES=['documents','response','reviews','export','versions','settings'];
export const ADMIN_PAGES=['bu-admin','admin','knowledge','history','capabilities','audit'];
export function getProjectEntryPage(state,projectId,destination='response') {
 return destination;
}
const pages=['dashboard','tasks','projects','analysis',...PROJECT_PAGES,...ADMIN_PAGES];
const fields=['projectId','fileId','sourceVersion','requirementId','reviewId','snapshotId','taskId','returnKey','action','upload','buId','modelId','groupId'];
export function parseWorkRoute(hash='') {
 const [path,query='']=hash.replace(/^#\/?/,'').split('?');const route={page:pages.includes(path)?path:'dashboard'};
 const params=new URLSearchParams(query);for(const key of fields)if(params.has(key))route[key]=params.get(key);
 return route;
}
export function buildWorkRoute(route) {
 const params=new URLSearchParams();for(const key of fields)if(route[key]!=null&&route[key]!=='')params.set(key,route[key]);
 return `#/${pages.includes(route.page)?route.page:'dashboard'}${params.size?'?'+params:''}`;
}
export function getSourceUploadRoute(route, role) {
 const next={page:'documents',projectId:route.projectId};
 if(!canPerform(role,'source:manage'))return next;
 return ['response','settings','reviews','versions'].includes(route.page)?{...route,upload:'true'}:{...next,action:'upload'};
}
export function shouldOpenSourceUpload(route, role) {
 return canPerform(role,'source:manage')&&((['response','settings','reviews','versions'].includes(route?.page)&&route.upload==='true')||(route?.page==='documents'&&route.action==='upload'));
}
export function getSourceUploadExitRoute(route, submitted=false) {
 if(route.upload==='true'&&!submitted){const next={...route};delete next.upload;return next;}
 const origin=['response','settings','reviews','versions'].includes(route.returnKey)?route.returnKey:'documents';
 return {page:submitted?'documents':origin,projectId:route.projectId,returnKey:'projects'};
}
export function saveReturnContext(key,context,storage=globalThis.sessionStorage){try{storage?.setItem(`rfq.return:${key}`,JSON.stringify(context));}catch{}}
export function readReturnContext(key,storage=globalThis.sessionStorage){try{return JSON.parse(storage?.getItem(`rfq.return:${key}`)||'null');}catch{return null;}}

