import {normalizeTaskStatus} from './taskStatus.js';
import {makeDocumentDemo} from './documentMocks.js';
import {initializePersonnel} from './personnelDomain.js';
export const actorIdForRole = role => ['SR','销售负责人'].includes(role) ? 'demo-sales' : role==='BU管理员'?'demo-bu-admin':role==='后台管理'?'demo-system-admin':/最终|批准人/.test(role || '') ? 'demo-approver' : 'demo-technical';
export function getActor(state) { return { id: state.actorId || actorIdForRole(state.actorRole), role: state.actorRole || '销售负责人' }; }
export function upgradePrototypeState(previous, demo) {
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
  }
  return initializePersonnel(state);
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
    const seeded = { ...example, category: '技术', ...answers[index], demoStatusExample: true,confirmationAssigneeId: 'demo-technical' };
    rows.push(seeded);
    if (seeded.status === '评审中') reviews.push({
      id: `${project.id}-DEMO-REVIEW-CLAUSE-STATUS`, requirementId: seeded.id, kind: 'review', title: '公用设施接口参数核对', type: '条件差异', source: '示例流程',
      status: '处理中', owner: '技术确认人',ownerId:'demo-technical',approverId:'demo-approver', deadline: project.deadline, version: 1, round: 1, requirementVersion: seeded.version,
      description: '客户现场电力、冷却水和排风参数尚待核对，需要明确额定值及允许范围。',
      plan: '核对客户现场参数，完善接口表后提交独立专业批准。', evidence: seeded.evidence,
      proposedDraft: seeded.draft, proposedConclusion: seeded.conclusion, conditions: seeded.conditions,
      history: [{ time: '2026/10/24 09:00:00', actor: '销售负责人', action: '建立示例评审并分派技术确认人' }],
    });
  });
  project.clauseStatusExamplesVersion = 2;
}
