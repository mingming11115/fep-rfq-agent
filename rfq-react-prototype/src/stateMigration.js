export const actorIdForRole = role => role === '销售负责人' ? 'demo-sales' : /最终|批准人/.test(role || '') ? 'demo-approver' : 'demo-technical';
export function getActor(state) { return { id: state.actorId || actorIdForRole(state.actorRole), role: state.actorRole || '销售负责人' }; }
export function upgradePrototypeState(previous, demo) {
  const state = structuredClone(previous?.projects?.length ? previous : demo);
  state.schemaVersion = 2;
  state.actorRole ||= '销售负责人';
  state.actorId ||= actorIdForRole(state.actorRole);
  state.tasksById ||= {};
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
    state.commentsByProject[project.id] ||= [];
    const reviews=state.reviewsByProject[project.id],counts=new Map();
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
    project.createdById ||= 'demo-sales';
    project.ownerId ||= 'demo-sales';
    project.participantIds ||= ['demo-sales', 'demo-technical', 'demo-approver'];
  }
  return state;
}
