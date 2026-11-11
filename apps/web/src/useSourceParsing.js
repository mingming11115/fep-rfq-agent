import {useEffect,useRef} from 'react';
import {canPerform} from './permissions.js';
import {parseRfqSource} from './rfqSourceClient.js';
import {importParsedRequirements} from './domain.js';
import {appendAnalysisRun} from './analysisDomain.js';
import {getProjectSourceSummary} from './projectSelectors.js';

export const isSourceParsing=file=>['排队中','处理中'].includes(file.status);

export function getReparseSources(state,projectId){
 const project=state.projects.find(row=>row.id===projectId);
 if(!project||project.archived||project.backendStage==='CANCELLED'||
    !canPerform(state.actorRole,'source:reparse',{state,actorId:state.actorId,projectId})) { return []; }
 return getProjectSourceSummary(state,projectId).files.filter(file=>file.backendDocumentId&&!file.demoParsePreview&&!file.retired);
}

// Parsing belongs to the workspace, so changing pages cannot stop an upload's task.
export function useSourceParsing({state,stateRef,update,onReload,toast}){
 const running=useRef(new Set()),alive=useRef(true),needsReload=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function runSource(projectId,file,{manual=false,historyDocumentIds,onReparsed}={}){
  const key=JSON.stringify([projectId,file.id]);
  if(running.current.has(key)){
   if(manual) { throw new Error('该文件正在解析'); }
   return;
  }
  running.current.add(key);
  const actorId=stateRef.current.actorId;
  const current=()=>alive.current&&stateRef.current.actorId===actorId&&stateRef.current.documentsByProject?.[projectId]?.some(row=>row.id===file.id);
  const patch=(s,changes)=>({...s,documentsByProject:{...s.documentsByProject,[projectId]:s.documentsByProject[projectId].map(row=>row.id===file.id?{...row,...changes}:row)}});
  if(!manual) { update(s=>patch(s,{status:'处理中',parseStage:'extracting',error:''})); }
  try{
   const {run,rows}=await parseRfqSource(projectId,file,undefined,historyDocumentIds);
   if(!current()) { return; }
   const status=run.status==='partial'?'待核对':'完成';
   update(s=>{
    const next=patch(s,{status,parseStage:'completed',parsedCount:rows.length,lastRunId:run.id,parsedAt:new Date().toLocaleString('zh-CN',{hour12:false}),error:run.message||'',...(historyDocumentIds!==undefined?{historyDocumentIds}:{})});
    const otherRows=(next.requirementsByProject[projectId]||[]).filter(row=>row.sourceFileId!==file.id);
    const parsedRows=rows.map(row=>({...row,activeForApproval:file.activeForApproval!==false}));
    return {...next,requirementsByProject:{...next.requirementsByProject,[projectId]:importParsedRequirements(otherRows,parsedRows)},analysisRuns:appendAnalysisRun(next.analysisRuns,{id:run.id,projectId,fileId:file.id,sourceVersion:file.version,type:'parse',status,startedAt:run.startedAt,endedAt:run.finishedAt,successCount:rows.length,failedCount:0,needsHumanCount:run.issueCount})};
   });
   if(stateRef.current.dataSource==='mysql') { needsReload.current=true; }
   if(manual){
    onReparsed?.(file,rows[0]);
    toast(`${file.name} 重新解析${status==='完成'?'完成':'后有条款待核对'}`,status==='完成'?'success':'warning');
   }
  }catch(error){
   console.error('解析项目原件失败', error);
   const failedRun=error.run?.status==='failed';
   if(error.run&&!failedRun&&current()&&stateRef.current.dataSource==='mysql'&&onReload){
    needsReload.current=true;
    onReparsed?.(file);
    toast(error.message,'warning');
    return;
   }
   if(current()&&(!manual||failedRun)){
    update(s=>patch(s,{status:'失败',error:error.message}));
    if(!manual) { toast(error.message,'error'); }
   }
   if(manual) { throw error; }
  }finally{
   running.current.delete(key);
   if(alive.current&&!running.current.size&&needsReload.current){
    needsReload.current=false;
    const {actorId,actorRole,activeBuId}=stateRef.current;
    onReload?.({actorId,actorRole,activeBuId});
   }
  }
 }
 useEffect(()=>{
  const latest=stateRef.current;
  for(const [projectId,files] of Object.entries(latest.documentsByProject||{})){
   if(!canPerform(latest.actorRole,'source:manage',{state:latest,actorId:latest.actorId,projectId})) { continue; }
   for(const file of files){
    if(!file.demoParsePreview&&isSourceParsing(file)) { void runSource(projectId,file); }
   }
  }
 },[state.documentsByProject,state.actorId,state.actorRole]);
 function reparse(projectId,fileId,historyDocumentIds,onReparsed){
  const file=getReparseSources(stateRef.current,projectId).find(row=>row.id===fileId);
  if(!file||isSourceParsing(file)) { throw new Error('该文件当前不可重新解析，请刷新后重试'); }
  return runSource(projectId,file,{manual:true,historyDocumentIds,onReparsed});
 }
 function retry(projectId,fileIds){
  for(const file of getReparseSources(stateRef.current,projectId)){
   if(fileIds.includes(file.id)&&!isSourceParsing(file)) { void runSource(projectId,file); }
  }
 }
 return {reparse,retry};
}
