import {officeRequest, officeSourceKey} from './officeClient.js';

export const supportsCraft=name=>/\.(docx|pdf)$/i.test(name||'');
export const craftSourceKey=officeSourceKey;

export function assertCraftSource(meta,source){
  if(!meta||['projectId','fileId','sourceVersion'].some(key=>String(meta[key]??'')!==String(source[key]??'')))throw new Error('文件来源与当前项目、条款文件或版本不一致，请重新关联原件');
  return meta;
}

export async function craftRequest(path,reference,options={}){
  const {binary,...request}=options;
  const headers=new Headers(request.headers);
  if(reference?.access)headers.set('X-Craft-Access',reference.access);
  let response;
  try{response=await fetch('/api/craft'+path,{...request,headers});}
  catch(error){if(error.name==='AbortError')throw error;throw new Error('无法连接文档服务，请检查 RFQ 后端是否启动');}
  if(binary&&response.ok)return response.blob();
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.code!==0){const error=new Error(body?.msg||'文件操作未完成，请保留当前修改后重试');error.status=response.status;throw error;}
  return body.data;
}

export async function uploadCraftFile(file,source,{review,signal}={}){
  const body=new FormData();body.append('file',file);
  if(review)body.append('review',review,file.name);
  for(const key of ['projectId','fileId','sourceVersion'])body.append(key,String(source[key]??''));
  return craftRequest('/documents',null,{method:'POST',body,signal});
}

export function saveCraftReview(reference,bytes,revision,signal){
  if(!Number.isSafeInteger(revision)||revision<0)return Promise.reject(new Error('当前文件版本无效，请重新打开文件'));
  return craftRequest(`/documents/${encodeURIComponent(reference.id)}/review`,reference,{method:'PUT',
    headers:{'Content-Type':'application/octet-stream','If-Match':`"${revision}"`},body:bytes,signal});
}

export async function importOfficeReview(reference,source,signal){
  const meta=assertCraftSource(await officeRequest(`/documents/${encodeURIComponent(reference.id)}`,reference,{signal}),source);
  const original=await officeRequest(`/documents/${encodeURIComponent(reference.id)}/download?kind=original`,reference,{binary:true,signal});
  const review=await officeRequest(`/documents/${encodeURIComponent(reference.id)}/download?kind=review`,reference,{binary:true,signal});
  return uploadCraftFile(new File([original],meta.name||reference.name,{type:original.type}),source,{review,signal});
}

const demoAssets={
  'RFQ-001-DEMO-FILE-CLAUSE-STATUSES:V1.0':'/onlyoffice-demo/RFQ-review-example.docx',
  'RFQ-001-DEMO-FILE-BIZ-2:V1.1':'/craft-demo/business-clauses.docx',
  'RFQ-001-DEMO-FILE-TECH-3:V2.0':'/craft-demo/technical-requirements.docx',
  'RFQ-001-DEMO-FILE-RESPONSE-MATRIX:V1.0':'/craft-demo/response-matrix.docx',
};
export const craftDemoAsset=source=>source?.projectId==='RFQ-001'?demoAssets[`${source.fileId}:${source.sourceVersion}`]||null:null;

export async function loadCraftDemo(source,signal){
  const url=craftDemoAsset(source);if(!url)throw new Error('此来源没有内置原件，请上传对应文件');
  const response=await fetch(url,{signal});if(!response.ok)throw new Error('示例原件读取失败，请重试');
  return uploadCraftFile(new File([await response.blob()],'RFQ批阅示例.docx'),source,{signal});
}

export async function downloadCraftFile(reference,kind='review'){
  const blob=await craftRequest(`/documents/${encodeURIComponent(reference.id)}/download?kind=${kind}`,reference,{binary:true});
  downloadCraftBlob(blob,kind==='original'?reference.name:reference.name.replace(/(\.[^.]+)$/,'-批阅版$1'));
}

export function downloadCraftBlob(blob,name){
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

// Serialize saves from the native keyboard, toolbar and host. Each queued write starts with
// the revision confirmed by the preceding write; a rejection leaves that revision unchanged.
export function createCraftSaveQueue({reference,revision=0,persist=saveCraftReview,getGeneration=()=>0,onSaved=()=>{}}){
  let tail=Promise.resolve(),currentRevision=revision,alive=true;
  return {
    enqueue(bytes,generation,details={}){
      const run=async()=>{
        if(!alive)throw new DOMException('编辑器已关闭','AbortError');
        const meta=await persist(reference,bytes,currentRevision);
        if(alive){currentRevision=meta.revision;await onSaved(meta,{...details,generation,clean:generation===getGeneration()});}
        return meta;
      };
      const job=tail.then(run,run);tail=job.then(()=>{},()=>{});return job;
    },
    dispose(){alive=false;},
  };
}
