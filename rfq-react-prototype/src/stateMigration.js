import {normalizeTaskStatus} from './taskStatus.js';
import {makeDocumentDemo} from './documentMocks.js';
import {initializePersonnel,getEligiblePersonnel} from './personnelDomain.js';
export const actorIdForRole = role => ['SR','销售负责人'].includes(role) ? 'demo-sales' : role==='BU管理员'?'demo-bu-admin':role==='后台管理'?'demo-system-admin':/最终|批准人/.test(role || '') ? 'demo-approver' : 'demo-technical';
export function getActor(state) { return { id: state.actorId || actorIdForRole(state.actorRole), role: state.actorRole || '销售负责人' }; }
export function upgradePrototypeState(previous, demo, {now=new Date()}={}) {
  const state = structuredClone(Array.isArray(previous?.projects) ? previous : demo);
  seedProjectStageExamples(state, demo);
  state.schemaVersion = 3;
  state.actorRole ||= '销售负责人';
  state.actorId ||= actorIdForRole(state.actorRole);
  state.tasksById ||= {};
  for(const task of Object.values(state.tasksById))task.status=normalizeTaskStatus(task.status);
  state.documentsByProject ||= {};
  state.analysisRuns ||= [];
  state.commentsByProject ||= {};
  state.navigationContext ||= {};
  state.members ||= structuredClone(demo.members || []);
  state.audit ||= [];
  state.membersByProject ||= {};
  for (const key of ['requirementsByProject', 'reviewsByProject', 'snapshotsByProject']) {
    state[key] ||= {};
    for (const project of state.projects) state[key][project.id] ||= [];
  }
  for (const project of state.projects) {
    // Project stages are derived by getProjectSummary, never restored from a cached label.
    delete project.stage;
    state.commentsByProject[project.id] ||= [];
    const reviews=state.reviewsByProject[project.id],counts=new Map();
    for (const row of state.requirementsByProject[project.id]) {
      if (row.status !== '待复核') continue;
      row.status = reviews.some(review => review.requirementId === row.id && !['已关闭', '已取消'].includes(review.status)) ? '评审中' : '待确认';
      row.needsReview = true;
      row.confirmationReason ||= '评审结果或来源内容已变化，请重新确认应答。';
      delete row.confirmedAt;
      delete row.confirmedBy;
    }
    for(const review of reviews)counts.set(review.id,(counts.get(review.id)||0)+1);
    const used=new Set(reviews.filter(r=>counts.get(r.id)===1).map(r=>r.id));
    reviews.forEach((review,index)=>{
      if(counts.get(review.id)<2)return;
      const legacyId=review.id;let id=`${legacyId}--${review.requirementId||'item'}-${index+1}`;
      while(used.has(id))id+='-copy';used.add(id);
      review.id=id;review.legacyId=legacyId;
    });
    for(const comment of state.commentsByProject[project.id])for(const [kind,id]of Object.entries(comment.linkedIssues||{})){
      const review=reviews.find(r=>r.legacyId===id&&r.requirementId===comment.anchor?.requirementId&&(r.kind||'review')===kind);
      if(review)comment.linkedIssues[kind]=review.id;
    }
    for(const row of state.requirementsByProject[project.id])if(row.pendingReviewProposal){const review=reviews.find(r=>r.legacyId===row.pendingReviewProposal.reviewId&&r.requirementId===row.id);if(review)row.pendingReviewProposal.reviewId=review.id;}
    state.membersByProject[project.id] ||= structuredClone(state.members);
    const trustedDemo=demo.projects?.some(example=>example.id===project.id&&example.customer===project.customer);
    if(trustedDemo){project.createdById ||= 'demo-sales';project.ownerId ||= 'demo-sales';project.participantIds ||= ['demo-sales','demo-technical','demo-approver'];}
    else project.participantIds ||= project.ownerId?[project.ownerId]:[];
    seedClauseStatusExamples(state, project);
    seedTaskDeadlineExamples(state, project, now);
  }
  return migrateResponseReviews(mergeLegacyFollowups(migrateProjectReviewSettings(initializePersonnel(state)),now));
}

function migrateProjectReviewSettings(state){
 for(const project of [...state.projects,...Object.values(state.deletedProjectsById||{}).map(backup=>backup.project)]){
  const previous=state.buReviewSettingsByBuId?.[project.buId];
  if(!project.technicalReviewSettings&&previous)project.technicalReviewSettings=structuredClone(previous);
 }
 return state;
}

function mergeLegacyFollowups(state,now){
 for(const project of state.projects){
  for(const review of state.reviewsByProject[project.id]||[]){
   if(review.customerCommunication==='待客户澄清')review.customerCommunication='待客户反馈';
   if(review.type==='客户澄清')review.type='条件待核对';
   if(review.kind!=='clarification')continue;
   review.legacyKind=review.kind;review.kind='review';
   if(review.status==='跟进中')review.status='处理中';
   const previousOwnerId=review.ownerId;
   const people=getEligiblePersonnel(state,{buId:project.buId,projectId:project.id,duty:'confirm'}).filter(m=>m.roles.includes('技术'));
   review.ownerId=people.find(m=>m.userId===review.ownerId)?.userId||people[0]?.userId||null;
   review.reviewerIds=review.ownerId?[review.ownerId]:[];
   review.owner=review.ownerId?state.accountsById[review.ownerId]?.name||review.ownerId:'待分派';
   review.history=[...(review.history||[]),{action:'并入评审',actor:'系统',previousOwnerId,time:now.toISOString(),reason:'统一按评审流程处理，原有回复和处理记录保留。'}];
   delete project.responseReviewSchemaVersion;
  }
  for(const comment of state.commentsByProject[project.id]||[]){if(comment.linkedIssues?.clarification&&!comment.linkedIssues.review)comment.linkedIssues.review=comment.linkedIssues.clarification;}
  for(const row of state.requirementsByProject[project.id]||[]){
   if(row.pendingReviewProposal?.kind==='clarification')row.pendingReviewProposal.kind='review';
   if(row.confirmationReason?.startsWith('客户澄清已完成'))row.confirmationReason='评审已完成，请核对结果并确认应答。';
  }
 }
 return state;
}

function migrateResponseReviews(state){
 if(state.responseReviewSchemaVersion&&state.projects.every(p=>p.responseReviewSchemaVersion))return state;
 state.implicitConfirmationIdsByProject ||= {};
 for(const project of state.projects){
  if(state.responseReviewSchemaVersion&&project.responseReviewSchemaVersion)continue;
  for(const row of state.requirementsByProject[project.id]||[]){
   const ambiguousLegacyAudit=(state.audit||[]).some(e=>e.action==='分派条款确认人'&&!e.projectId&&!e.requirementId&&(e.buId===project.buId||e.object===project.buId)&&e.after===row.confirmationAssigneeId);
   const explicit=ambiguousLegacyAudit||row.confirmationAssignmentSource==='explicit'||Object.values(state.tasksById||{}).some(t=>t.projectId===project.id&&t.objectType==='requirement'&&t.objectId===row.id&&(t.history||[]).some(h=>h.action==='transfer'&&h.to===row.confirmationAssigneeId))||(state.audit||[]).some(e=>e.action==='分派条款确认人'&&e.projectId===project.id&&e.requirementId===row.id&&e.after===row.confirmationAssigneeId);
   if(ambiguousLegacyAudit&&row.confirmationAssignmentSource!=='explicit'){state.confirmationMigrationNotesByProject ||= {};state.confirmationMigrationNotesByProject[project.id] ||= {};state.confirmationMigrationNotesByProject[project.id][row.id]='旧分派记录未包含具体条款，已保留现有确认人；可选择默认SR恢复默认分工。';}
   if(row.confirmationAssigneeId==='demo-technical'&&!explicit){
    if(row.status==='已确认'){state.implicitConfirmationIdsByProject[project.id] ||= [];if(!state.implicitConfirmationIdsByProject[project.id].includes(row.id))state.implicitConfirmationIdsByProject[project.id].push(row.id);}
    else delete row.confirmationAssigneeId;
   }
  }
  for(const review of state.reviewsByProject[project.id]||[]){
   if(review.kind==='clarification')continue;
   review.reviewerIds ||= review.ownerId?[review.ownerId]:[];
   review.confirmations ||= {};
   review.legacyApproval ||= review.approverId?{approverId:review.approverId,status:review.status,approvedById:review.approvedById}:undefined;
   delete review.approverId;
   if(['待审批','待批准'].includes(review.status)){review.status='待处理';review.version=(review.version||1)+1;}
   review.owner=review.reviewerIds.map(id=>state.accountsById[id]?.name||id).join('、');
   const row=state.requirementsByProject[project.id]?.find(r=>r.id===review.requirementId);
   if(row&&review.status!=='已取消'&&(row.pendingReviewProposal?.reviewId===review.id||row.status!=='已确认'&&review.status==='已关闭')){row.status='评审中';review.status='待处理';}
  }
  project.responseReviewSchemaVersion=1;
 }
 state.responseReviewSchemaVersion=1;return state;
}

function seedTaskDeadlineExamples(state, project, now) {
  // Refresh only untouched synthetic dates once; later loads must let tasks age normally.
  const today=new Date(now.getTime()+8*60*60*1000).toISOString().slice(0,10);
  const dateAfter=days=>new Date(Date.parse(`${today}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);
  function scheduleObject(type,id,legacyDate,days){
    const objects=type==='requirement'?state.requirementsByProject[project.id]:state.reviewsByProject[project.id];
    const object=objects.find(o=>o.id===id);
    if(!object||object.demoTaskDeadlinesVersion===1||(object.version||1)!==1||(object.round||1)!==1||object.deadline&&object.deadline!==legacyDate)return;
    object.deadline=dateAfter(days);object.demoTaskDeadlinesVersion=1;
    for(const task of Object.values(state.tasksById)){
      if(task.projectId===project.id&&task.objectType===type&&task.objectId===id&&task.objectVersion===1&&task.round===1&&task.dueAt===legacyDate&&['待处理','处理中'].includes(normalizeTaskStatus(task.status)))task.dueAt=object.deadline;
    }
  }
  if(project.id==='RFQ-BHEL-2018'&&project.historicalDemo&&project.customer==='BHEL Electronics Division · Bangalore'&&project.deadline==='2018-01-31'){
    // The sourced procurement date stays historical; these are internal demo work deadlines.
    for(const [index,row]of state.requirementsByProject[project.id].entries())if(row.realSource&&/^BHEL-REQ-\d{3}$/.test(row.id))scheduleObject('requirement',row.id,'2018-01-31',2+index%5);
    for(const [index,review]of state.reviewsByProject[project.id].entries())if(/^BHEL-DEV-0[1-4]$/.test(review.id))scheduleObject('review',review.id,'2026-10-25',2+index);
    return;
  }
  if(project.id!=='RFQ-001'||project.customer!=='华东新能源客户（模拟）'||project.demoTaskDeadlinesVersion===1||project.deadline!=='2026-10-25')return;
  const schedule=[
    ['requirement','req-21','2026-10-25',-1],
    ['requirement','req-26','2026-10-25',0],
    ['requirement','req-28','2026-10-25',1],
    ['requirement','req-30','2026-10-25',3],
    ['requirement','req-32','2026-10-25',5],
    ['requirement','RFQ-001-DOC-EXAMPLE-6','2026-10-25',1],
    ['review','DEV-001','2026-10-22',-1],
    ['review','DEV-002','2026-10-23',0],
    ['review','DEV-003','2026-10-22',1],
    ['review','RFQ-001-DEMO-REVIEW-CLAUSE-STATUS','2026-10-25',3],
  ];
  for(const [type,id,legacyDate,days]of schedule)scheduleObject(type,id,legacyDate,days);
  project.deadline=dateAfter(7);
  project.demoTaskDeadlinesVersion=1;
}

function seedProjectStageExamples(state,demo) {
  // Existing rows, files and signatures are never replaced by freshly generated examples.
  state.demoProjectStagesVersion ||= demo.demoProjectStagesVersion;
  if(state.demoParsingExampleVersion===1)return;
  if(!state.projects.some(project=>demo.projects?.some(example=>example.id===project.id&&example.customer===project.customer)))return;
  const id='RFQ-DEMO-PARSING';
  if(!state.projects.some(project=>project.id===id)&&!state.deletedProjectsById?.[id]){
    state.projects.push({id,name:'解析中示例 · 智能应答对比',customer:'演示客户（模拟）',equipment:'DEMO-CUT 300 · V2.1',owner:'林晓',ownerId:'demo-sales',createdById:'demo-sales',participantIds:['demo-sales','demo-technical','demo-approver'],buId:'BU-DEMO',deadline:'2026-11-10',sample:true});
    for(const key of ['requirementsByProject','reviewsByProject','snapshotsByProject']){
      state[key] ||= {};
      state[key][id]=[];
    }
    state.documentsByProject ||= {};
    state.documentsByProject[id]=[{id:`${id}-FILE`,name:'智能应答对比_客户技术要求.docx',purpose:'要求来源',version:'V1.0',status:'处理中',parseStage:'comparing',demoParsePreview:true,sample:true,size:1482000,visibility:'项目成员可见',createdAt:'2026/10/27 09:00:00'}];
  }
  state.demoParsingExampleVersion=1;
}

function seedClauseStatusExamples(state, project) {
  // Curated workflow examples are separate from parsing, which always imports unconfirmed rows.
  if (project.id !== 'RFQ-001' || project.customer !== '华东新能源客户（模拟）' || project.clauseStatusExamplesVersion === 2) return;
  const rows = state.requirementsByProject[project.id], reviews = state.reviewsByProject[project.id];
  const examples = makeDocumentDemo(project.id).parsed.filter(row => row.sourceFileId === `${project.id}-DEMO-FILE-CLAUSE-STATUSES`);
  const answers = [
    { status: '待确认', conclusion: 'Comply', draft: '配置门禁联锁；防护门打开时停止危险运动，复位确认后方可恢复。', evidence: '模拟安全方案 SAF-001 V1，第 2 页', readyForConfirmation: true },
    { status: '评审中', conclusion: '有条件 Comply', draft: '按最终配置提供电力、冷却水与排风接口表，额定值及允许范围待双方核对。', conditions: '客户现场公用设施参数与最终接口表一致后实施。', evidence: '模拟接口表 FAC-001 V1（评审稿）' },
    { status: '已确认', conclusion: 'Comply', draft: '按双方确认的布局附件预留设备维护空间，并在安装前核对现场尺寸。', evidence: '模拟布局附件 LAYOUT-001 V1，第 5 页', confirmedAt: '2026-10-24T01:00:00.000Z', confirmedBy: '技术确认人' },
  ];
  examples.forEach((example, index) => {
    const current = rows.find(row => row.id === example.id);
    if (current) return;
    const seeded = { ...example, category: '技术', ...answers[index], demoStatusExample: true };
    rows.push(seeded);
    if (seeded.status === '评审中') reviews.push({
      id: `${project.id}-DEMO-REVIEW-CLAUSE-STATUS`, requirementId: seeded.id, kind: 'review', title: '公用设施接口参数核对', type: '条件差异', source: '示例流程',
      status: '处理中', owner: '技术确认人',ownerId:'demo-technical',approverId:'demo-approver', deadline: project.deadline, version: 1, round: 1, requirementVersion: seeded.version,
      description: '客户现场电力、冷却水和排风参数尚待核对，需要明确额定值及允许范围。',
      plan: '核对客户现场参数，完善接口表后确认最终应答。', evidence: seeded.evidence,
      proposedDraft: seeded.draft, proposedConclusion: seeded.conclusion, conditions: seeded.conditions,
      history: [{ time: '2026/10/24 09:00:00', actor: '销售负责人', action: '建立示例评审并分派技术确认人' }],
    });
  });
  project.clauseStatusExamplesVersion = 2;
}
