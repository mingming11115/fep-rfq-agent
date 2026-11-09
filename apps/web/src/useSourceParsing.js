import {useEffect,useRef} from 'react';
import {canPerform} from './permissions.js';
import {parseRfqSource} from './rfqSourceClient.js';
import {importParsedRequirements} from './domain.js';
import {appendAnalysisRun} from './analysisDomain.js';

// Parsing belongs to the workspace, so changing pages cannot stop an upload's task.
export function useSourceParsing({state,stateRef,update,onReload,toast}){
 const running=useRef(new Set()),alive=useRef(true),needsReload=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  const latest=stateRef.current;
  for(const [projectId,files] of Object.entries(latest.documentsByProject||{})){
   if(!canPerform(latest.actorRole,'source:manage',{state:latest,actorId:latest.actorId,projectId}))continue;
   for(const file of files){
    const key=JSON.stringify([projectId,file.id]);
    if(file.demoParsePreview||!['排队中','处理中'].includes(file.status)||running.current.has(key))continue;
    running.current.add(key);
    const actorId=latest.actorId;
    const current=()=>alive.current&&stateRef.current.actorId===actorId&&stateRef.current.documentsByProject?.[projectId]?.some(row=>row.id===file.id);
    const patch=(s,changes)=>({...s,documentsByProject:{...s.documentsByProject,[projectId]:s.documentsByProject[projectId].map(row=>row.id===file.id?{...row,...changes}:row)}});
    update(s=>patch(s,{status:'处理中',parseStage:'extracting',error:''}));
    (async()=>{
     try{
      const {run,rows}=await parseRfqSource(projectId,file);
      if(!current())return;
      update(s=>{
       const next=patch(s,{status:run.status==='partial'?'待核对':'完成',parseStage:'completed',parsedCount:rows.length,lastRunId:run.id,parsedAt:new Date().toLocaleString('zh-CN',{hour12:false}),error:run.message||''});
       return {...next,requirementsByProject:{...next.requirementsByProject,[projectId]:importParsedRequirements(next.requirementsByProject[projectId]||[],rows)},analysisRuns:appendAnalysisRun(next.analysisRuns,{id:run.id,projectId,fileId:file.id,sourceVersion:file.version,type:'parse',status:run.status==='partial'?'待核对':'完成',startedAt:run.startedAt,endedAt:run.finishedAt,successCount:rows.length,failedCount:0,needsHumanCount:run.issueCount})};
      });
      if(stateRef.current.dataSource==='mysql')needsReload.current=true;
     }catch(error){if(current()){update(s=>patch(s,{status:'失败',error:error.message}));toast(error.message,'error');}}
     finally{
      running.current.delete(key);
      if(alive.current&&!running.current.size&&needsReload.current){needsReload.current=false;onReload?.();}
     }
    })();
   }
  }
 },[state.documentsByProject,state.actorId,state.actorRole]);
}
