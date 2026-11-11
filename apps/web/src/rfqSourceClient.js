import {api as defaultApi} from './authClient.js';
import {ensureBackendProject} from './rfqProjectClient.js';
import {readRequirementSpecification} from './requirementSpecification.js';
import {selectionSource} from './documentAnchors.js';

export async function uploadRfqSource(projectId,original,file,api=defaultApi,project,options={}){
 let backendProjectId=projectId;
 try{const saved=project?await ensureBackendProject(project,api):await api.get(`/projects/${encodeURIComponent(projectId)}`);backendProjectId=saved.id;}catch(error){ console.error('查询原件上传目标项目失败', error); throw new Error(`无法上传到当前后端项目：${error.message}。请确认项目已在后端创建且当前账号有权限。`);}
 const body=new FormData();body.append('file',original,file.name);
 for(const id of file.historyDocumentIds??[]) { body.append('historyDocumentIds',id); }
 if(options.signal?.aborted) { throw new DOMException('请求已取消','AbortError'); }
 const saved=await api.upload(`/projects/${encodeURIComponent(backendProjectId)}/documents`,body,options);
 return {...file,historyDocumentIds:saved.historyDocumentIds??[],sourceProjectId:projectId,backendDocumentId:saved.id,backendProjectId,backendVersion:saved.version,status:'排队中'};
}
export async function parseRfqSource(projectId,file,api=defaultApi,historyDocumentIds){
 if(!file.backendDocumentId) { throw new Error('此文件尚未关联后端原件，请重新上传后解析'); }
 if((file.sourceProjectId||file.backendProjectId)&&(file.sourceProjectId||file.backendProjectId)!==projectId) { throw new Error('文件所属项目不一致'); }
 const scope=historyDocumentIds===undefined?undefined:{historyDocumentIds};
 const run=await api.post(`/documents/${encodeURIComponent(file.backendDocumentId)}/parse-runs`,scope);
 if(run.status==='failed') { throw Object.assign(new Error(run.message||'解析失败，请重试'),{run}); }
 if(!['completed','partial'].includes(run.status)) { throw new Error(run.message||'解析未完成，请重试'); }
 try {
  return {run,rows:await readParsedRows(projectId,file,run,api)};
 } catch (cause) {
  console.error('读取已解析条款失败', cause);
  throw Object.assign(new Error('解析已完成，但读取新条款失败，请刷新页面查看结果',{cause}),{run});
 }
}

async function readParsedRows(projectId,file,run,api){
 const rows=[];
 for(let page=1,total=1;page<=total;page++){
  const result=await api.get(`/projects/${encodeURIComponent(file.backendProjectId||projectId)}/requirements?page=${page}&size=100`);
  total=result.totalPages||1;
  for(const row of result.list||[])if(row.documentId===file.backendDocumentId) { rows.push({
   id:row.id,backendDocumentId:row.documentId,clause:row.customerClauseNo||'',title:row.title||'',
   original:row.originalText,requirementText:row.requirementText,sourceOriginal:row.originalText,sourceRefs:row.sourceRefs,
   ...selectionSource(row),
   specification:readRequirementSpecification(row.metricsJson),
   source:file.name,sourceFileId:file.id,sourceVersion:file.version,sectionPath:row.sectionPath?[row.sectionPath]:[],
   category:'技术',status:'待确认',conclusion:'',draft:'',matchLevel:'none',score:0,evidence:'',
   parserNote:row.reviewReasons||'',version:row.version,backendVersion:row.version,
  }); }
 }
 const generated=rows.filter(row=>!selectionSource(row)).length;
 if(generated!==run.requirementCount) { throw new Error('条款查询数量与解析结果不一致，请刷新后重试'); }
 return rows;
}
