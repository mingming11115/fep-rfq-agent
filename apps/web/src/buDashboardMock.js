import {createDemoState} from './data.js';
import {canManageBu,getProjectFinalReview,getRequiredFinalReviewers} from './personnelDomain.js';
import {currentProjectScope,snapshotFingerprint} from './snapshotDomain.js';
import {selectBuDashboard} from './buDashboardSelectors.js';

const hour=3600000,day=24*hour;
const date=value=>new Date(value).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});

// An in-memory demonstration only. Never merge these records into saved app state.
export function selectBuDashboardMock(state,{now=new Date(),referenceTime=now,buId=state.activeBuId||state.businessUnits?.find(b=>canManageBu(state,state.actorId,b.id))?.id,approvalPeriodDays=30}={}){
 if(state.actorRole!=='BU管理员'||!canManageBu(state,state.actorId,buId)) { return null; }
 const demo=createDemoState(),base=referenceTime.getTime(),bu=state.businessUnits.find(b=>b.id===buId);
 demo.actorId=state.actorId;demo.actorRole='BU管理员';demo.activeBuId=buId;
 demo.businessUnits=[{...bu}];
 demo.accountsById[state.actorId]={id:state.actorId,name:'BU管理员',enabled:true,managedBuIds:[buId]};
 demo.buPersonnelByBuId={[buId]:demo.buPersonnelByBuId['BU-DEMO']};
 demo.buReviewSettingsByBuId={[buId]:demo.buReviewSettingsByBuId['BU-DEMO']};
 demo.projects.forEach((project,index)=>{
  project.buId=buId;project.sample=true;
  project.deadline=date(base+[-2,10,-4,8,-5][index]*day);
 });
 // Use synthetic customer metadata throughout this view, including the parsing example.
 demo.projects[2].name='晶圆检测设备';demo.projects[2].customer='华东晶圆客户（模拟）';
 for(const reviews of Object.values(demo.reviewsByProject))reviews.forEach((review,index)=>{review.deadline=date(base+(index-1)*day);});

 function round(project,id,end,hours,{status='已批准',exported=false}={}){
  const finalReview=getProjectFinalReview(demo,project.id),start=end-hours*hour;
  const snapshot={id,projectId:project.id,sample:true,status,createdAt:new Date(start).toISOString(),finalReview};
  const required=getRequiredFinalReviewers(finalReview);
  for(const reviewer of required){
   if(status==='审批中'&&reviewer.side==='technical') { continue; }
   if(status==='已退回'&&reviewer.side!=='sr') { continue; }
   const vote={actorId:reviewer.actorId,result:status==='已退回'?'rejected':'approved',at:new Date(reviewer.side==='sr'&&status!=='已退回'?start+hours*.35*hour:end).toISOString()};
   if(reviewer.side==='sr') { finalReview.decisions.sr=vote; } else { finalReview.decisions.technicalByActorId[reviewer.actorId]=vote; }
  }
  snapshot.approvalScope=currentProjectScope(demo,project.id,snapshot);
  snapshot.approvalFingerprint=snapshotFingerprint(snapshot.approvalScope);
  if(exported) { snapshot.exportedAt=new Date(end+.25*hour).toISOString(); }
  return snapshot;
 }
 const completed=demo.projects.filter(p=>['RFQ-002','RFQ-003'].includes(p.id));
 completed.forEach(project=>{demo.snapshotsByProject[project.id]=[];});
 // One round per day for two adjacent 90-day periods, with faster recent rounds.
 for(let index=0;index<180;index++){
  const project=completed[index%2],hours=[2,4,6,8,12,18,28,36][index%8]*(1+index/90);
  demo.snapshotsByProject[project.id].push(round(project,`MOCK-ROUND-${index}`,base-(index+.5)*day,hours,{status:index%5===0?'已退回':'已批准'}));
 }
 for(const project of completed){
  demo.snapshotsByProject[project.id].push(round(project,`MOCK-LATEST-${project.id}`,base-hour,4,{exported:project.id==='RFQ-003'}));
 }
 const waiting=demo.projects[0];
 demo.snapshotsByProject[waiting.id]=[round(waiting,'MOCK-PENDING',base,36,{status:'审批中'})];
 const kinds=['draft','confirm','recheck','review-process','review-approve','final-approve'];
 const people=['demo-sales','demo-technical','demo-technical-2','demo-technical-3','demo-approver'];
 // Pending tasks belong to the project in review; finished projects have none.
 demo.tasksById=Object.fromEntries(Array.from({length:18},(_,index)=>{
  const task={id:`MOCK-TASK-${index}`,projectId:waiting.id,kind:kinds[index%kinds.length],assigneeId:people[index%people.length],status:index%3?'待处理':'处理中',dueAt:date(base+(index%4-1)*day)};
  return [task.id,task];
 }));
 return selectBuDashboard(demo,{buId,now,approvalPeriodDays,approvalDataMode:'sample'});
}
