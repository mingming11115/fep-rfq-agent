import { makeSourceAnchor } from './documentAnchors.js';

export function officeRouteSource(state,route) {
  if(!['response','reviews'].includes(route.page))return;
  const projectId=route.projectId||state.activeProjectId;
  const row=state.requirementsByProject?.[projectId]?.find(item=>item.id===route.requirementId);
  if(!row)return;
  const anchor=makeSourceAnchor({...row,projectId});
  return {projectId,fileId:route.fileId||anchor.fileId,sourceVersion:route.sourceVersion||anchor.sourceVersion};
}

export function officeClauseTargets(source,rows) {
  return rows.filter(row=>row.projectId===source.projectId && (row.sourceFileId||row.source||'manual')===source.fileId && String(row.sourceVersion||'1')===String(source.sourceVersion))
    .map(row=>({id:row.id,no:row.clause||row.no||row.id,quote:row.sourceOriginal??row.original??'',tag:'rfq:'+row.id,anchor:makeSourceAnchor(row)}));
}

// A per-editor channel and WindowProxy bind messages to the current source session.
export function createOfficeClauseLink({origin,channel,source,onSelect=()=>{},onStatus=()=>{}}) {
  let plugin=null,targets=[],targetId='',requestId=0,alive=true,signature='';
  function send(){if(plugin&&alive){onStatus({status:'locating'});plugin.postMessage({type:'rfq:locate',channel,requestId,targets:targets.map(({anchor,...target})=>target),targetId},origin);}}
  return {
    update(rows,id){
      const next=officeClauseTargets(source,rows),nextSignature=JSON.stringify([id,next]);
      if(nextSignature===signature)return;
      signature=nextSignature;targets=next;targetId=id;requestId++;send();
    },
    receive(event){
      const message=event.data;
      if(!alive||event.origin!==origin||!event.source||!message||message.channel!==channel)return;
      if(message.type==='rfq:ready'&&!plugin){plugin=event.source;send();return;}
      if(event.source!==plugin)return;
      if(message.type==='rfq:located'&&message.requestId===requestId&&['matched','missing','ambiguous','unsupported'].includes(message.status))onStatus({status:message.status});
      if(message.type==='rfq:selected'&&message.requestId===requestId){
        const target=targets.find(item=>item.id===message.id);
        if(target&&target.id!==targetId&&onSelect(target.anchor)===false)send();
      }
    },
    locate:send,
    destroy(){alive=false;plugin=null;},
  };
}
