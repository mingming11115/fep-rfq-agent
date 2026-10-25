import {canPerform} from './permissions.js';
export const PROJECT_PAGES=['documents','response','reviews','export','versions','settings'];
export const ADMIN_PAGES=['admin','knowledge','capabilities','evidence','audit'];
const pages=['dashboard','tasks','projects','analysis',...PROJECT_PAGES,...ADMIN_PAGES];
const fields=['projectId','fileId','sourceVersion','requirementId','reviewId','snapshotId','taskId','returnKey','action'];
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
 return canPerform(role,'source:manage') ? {...next,action:'upload',returnKey:['response','settings','reviews','versions'].includes(route.page)?route.page:'response'} : next;
}
export function shouldOpenSourceUpload(route, role) {
 return route?.page==='documents'&&route.action==='upload'&&canPerform(role,'source:manage');
}
export function getSourceUploadExitRoute(route, submitted=false) {
 const origin=['response','settings','reviews','versions'].includes(route.returnKey)?route.returnKey:'documents';
 return {page:submitted?'documents':origin,projectId:route.projectId,returnKey:'projects'};
}
export function saveReturnContext(key,context,storage=globalThis.sessionStorage){try{storage?.setItem(`rfq.return:${key}`,JSON.stringify(context));}catch{}}
export function readReturnContext(key,storage=globalThis.sessionStorage){try{return JSON.parse(storage?.getItem(`rfq.return:${key}`)||'null');}catch{return null;}}
