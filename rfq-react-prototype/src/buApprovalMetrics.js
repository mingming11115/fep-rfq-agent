import {getRequiredFinalReviewers,personName} from './personnelDomain.js';
import {latestSnapshot} from './snapshotDomain.js';

const hour=3600000,day=24*hour;
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
function timestamp(value){
 if(typeof value!=='string'||!value.trim())return null;
 const text=value.trim().replaceAll('/','-').replace(' ','T');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text))return null;
 const parsed=Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)?text:`${text}+08:00`);
 return Number.isFinite(parsed)?parsed:null;
}
function deadlineTime(value){
 return /^\d{4}-\d{2}-\d{2}$/.test(value||'')?timestamp(`${value}T23:59:59.999+08:00`):timestamp(value);
}
function summarize(records){
 const dated=records.filter(r=>r.deadline!==null);
 return {count:records.length,approved:records.filter(r=>r.status==='已批准').length,rejected:records.filter(r=>r.status==='已退回').length,
  averageHours:mean(records.map(r=>r.hours)),datedCount:dated.length,onTimeRate:dated.length?Math.round(dated.filter(r=>r.end<=r.deadline).length/dated.length*100):null};
}

// Called only after the dashboard selector authorizes and scopes the BU projects.
// Return timing metadata, never response content or reviewers' written opinions.
export function getBuApprovalMetrics(state,projects,{now=new Date(),periodDays=30,dataMode='auto'}={}){
 const period=[7,30,90].includes(periodDays)?periodDays:30,nowMs=now.getTime(),start=nowMs-period*day,previousStart=start-period*day;
 const snapshots=projects.flatMap(p=>state.snapshotsByProject?.[p.id]||[]);
 const mode=['actual','sample'].includes(dataMode)?dataMode:snapshots.some(s=>!s.sample)?'actual':snapshots.some(s=>s.sample)?'sample':'actual';
 const matches=s=>(mode==='sample')===!!s.sample;
 const completed=[],pending=[],byProject={};let incompleteRecords=0;
 for(const project of projects){
  const scoped=(state.snapshotsByProject?.[project.id]||[]).filter(matches),latest=latestSnapshot(scoped),seen=new Set();
  for(const snapshot of scoped){
   if(seen.has(snapshot.id))continue;seen.add(snapshot.id);
   if(snapshot.stale||!['已批准','已退回','审批中'].includes(snapshot.status)){
    if(snapshot===latest)byProject[project.id]={status:snapshot.stale?'已失效':snapshot.status,hours:null};
    continue;
   }
   const submitted=timestamp(snapshot.createdAt);if(submitted!==null&&submitted>nowMs)continue;
   let required;
   try{required=getRequiredFinalReviewers(snapshot.finalReview);}catch{incompleteRecords++;continue;}
   const votes=required.map(({actorId,side})=>{
    const vote=side==='sr'?snapshot.finalReview.decisions?.sr:snapshot.finalReview.decisions?.technicalByActorId?.[actorId];
    if(!vote)return null;
    const at=timestamp(vote.at);
    return {side,result:vote.result,at,valid:vote.actorId===actorId&&['approved','rejected'].includes(vote.result)&&at!==null&&at<=nowMs&&(submitted===null||at>=submitted)};
   });
   if(votes.some(v=>v&&!v.valid)){incompleteRecords++;continue;}
   const rejected=votes.filter(v=>v?.result==='rejected');
   if(snapshot.status==='审批中'){
    if(snapshot!==latest)continue;
    if(rejected.length||votes.every(Boolean)){incompleteRecords++;continue;}
    if(submitted===null)incompleteRecords++;
    const waitingSides=[...new Set(required.filter((_,index)=>!votes[index]).map(r=>r.side==='sr'?'SR':'技术组'))];
    const hours=submitted===null?null:(nowMs-submitted)/hour;
    const row={projectId:project.id,projectName:project.name,ownerName:project.ownerId?personName(state,project.ownerId):project.owner||'未分派',snapshotId:snapshot.id,submittedAt:submitted===null?null:new Date(submitted).toISOString(),hours,waitingSides};
    pending.push(row);byProject[project.id]={status:'审批中',hours,waitingSides};continue;
   }
   const approved=snapshot.status==='已批准'&&votes.every(v=>v?.result==='approved');
   if(submitted===null||(!approved&&!rejected.length)||snapshot.status==='已批准'&&!approved){incompleteRecords++;continue;}
   const end=approved?Math.max(...votes.map(v=>v.at)):Math.min(...rejected.map(v=>v.at));
   const sr=votes.find(v=>v?.side==='sr'&&v.at<=end);
   const technical=votes.filter((_,index)=>required[index].side==='technical');
   const technicalRejection=technical.filter(v=>v?.result==='rejected'&&v.at<=end);
   const technicalEnd=technicalRejection.length?Math.min(...technicalRejection.map(v=>v.at)):technical.every(v=>v?.result==='approved'&&v.at<=end)?Math.max(...technical.map(v=>v.at)):null;
   const record={projectId:project.id,snapshotId:snapshot.id,status:snapshot.status,end,hours:(end-submitted)/hour,deadline:deadlineTime(project.deadline),srHours:sr?(sr.at-submitted)/hour:null,technicalHours:technicalEnd===null?null:(technicalEnd-submitted)/hour};
   completed.push(record);
   if(snapshot===latest)byProject[project.id]={status:snapshot.status,hours:record.hours};
  }
 }
 const currentRecords=completed.filter(r=>r.end>=start&&r.end<=nowMs),previousRecords=completed.filter(r=>r.end>=previousStart&&r.end<start);
 const current=summarize(currentRecords),previous=summarize(previousRecords);
 const improvementPercent=current.averageHours!==null&&previous.averageHours>0?Math.round((previous.averageHours-current.averageHours)/previous.averageHours*1000)/10:null;
 pending.sort((a,b)=>(b.hours??-1)-(a.hours??-1)||a.projectId.localeCompare(b.projectId));
 return {periodDays:period,mode,current,previous,improvementPercent,incompleteRecords,byProject,
  pending:{count:pending.length,longestHours:pending.some(r=>r.hours!==null)?Math.max(...pending.filter(r=>r.hours!==null).map(r=>r.hours)):null,rows:pending},
  phases:[['sr','SR方评审','srHours'],['technical','技术组评审','technicalHours']].map(([key,label,field])=>{
   const durations=currentRecords.map(r=>r[field]).filter(value=>value!==null);return {key,label,count:durations.length,averageHours:mean(durations)};
  }),
 };
}
