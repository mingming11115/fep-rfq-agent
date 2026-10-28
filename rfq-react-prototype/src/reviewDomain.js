import {assertPermission} from './permissions.js';
import {applyRequirementEdit,confirmRequirement,confirmationValidation} from './domain.js';
import {canAccessProject,getPersonnelContext,personName,getEligiblePersonnel} from './personnelDomain.js';
import {getReviewActorIds,hasReviewConfirmation,getResponseReview,getSourceContextError} from './confirmationPolicy.js';

export function validateResponseReviewers(state,projectId,reviewerIds){
 const ids=[...new Set((reviewerIds||[]).filter(Boolean))],project=state.projects.find(p=>p.id===projectId);
 if(!ids.length)throw new Error('请至少选择一位评审人');
 const eligible=getEligiblePersonnel(state,{buId:project?.buId,projectId,duty:'confirm'}).map(m=>m.userId);
 if(ids.some(id=>!eligible.includes(id)))throw new Error('评审人须具备有效确认资格和项目授权');
 return ids;
}

const voteArchive=(review,row)=>[...(review.confirmationHistory||[]),{version:review.version,round:review.round,plan:review.plan,proposedDraft:review.proposedDraft,proposedConclusion:review.proposedConclusion,evidence:review.evidence,conditions:review.conditions,reviewerIds:getReviewActorIds(review),response:structuredClone(row),confirmations:structuredClone(review.confirmations||{})}];
export function synchronizeResponseReviews(state,previous){
 let next=state;
 for(const project of state.projects||[])for(const after of state.requirementsByProject?.[project.id]||[]){
  const before=previous.requirementsByProject?.[project.id]?.find(r=>r.id===after.id),review=getResponseReview(next,project.id,after.id),oldReview=getResponseReview(previous,project.id,after.id);
  if(before&&review&&oldReview?.id===review.id&&(before.version||1)!==(after.version||1)&&review.requirementVersion!==(after.version||1))next=resetResponseReviewConfirmations(next,project.id,before,after);
 }
 return next;
}
export function resetResponseReviewConfirmations(state,projectId,before,after){
 const review=getResponseReview(state,projectId,before.id);
 if(!review||(before.version||1)===(after.version||1))return {...state,requirementsByProject:{...state.requirementsByProject,[projectId]:state.requirementsByProject[projectId].map(r=>r.id===after.id?after:r)}};
 const updated={...review,status:'待处理',version:(review.version||1)+1,requirementVersion:after.version,confirmations:{},confirmationHistory:voteArchive(review,before),proposedDraft:after.draft,proposedConclusion:after.conclusion,conditions:after.conditions,evidence:after.evidence,closedAt:undefined};
 return {...state,reviewsByProject:{...state.reviewsByProject,[projectId]:state.reviewsByProject[projectId].map(r=>r.id===review.id?updated:r)},requirementsByProject:{...state.requirementsByProject,[projectId]:state.requirementsByProject[projectId].map(r=>r.id===after.id?{...after,status:'评审中',pendingReviewProposal:after.pendingReviewProposal??null,confirmedBy:undefined,confirmedById:undefined,confirmedAt:undefined}:r)}};
}

export function updateResponseReview(state,{projectId,reviewId,patch={},expectedVersion,expectedRound,route={}}){
 const review=state.reviewsByProject?.[projectId]?.find(r=>r.id===reviewId),project=state.projects.find(p=>p.id===projectId),actorId=state.actorId;
 if(!review||review.kind==='clarification')throw new Error('评审事项不存在');
 if(expectedVersion!==undefined&&(review.version||1)!==expectedVersion||expectedRound!==undefined&&(review.round||1)!==expectedRound)throw new Error('评审版本已变化，请重新打开后处理');
 if(!canAccessProject(state,actorId,projectId))throw new Error('无项目权限');
 const sourceError=getSourceContextError(state.requirementsByProject[projectId]?.find(r=>r.id===review.requirementId),route);if(sourceError)throw new Error(sourceError);
 const ids=getReviewActorIds(review),member=getPersonnelContext(state,actorId,project.buId).member;
 const communicationOnly=Object.keys(patch).length>0&&Object.keys(patch).every(key=>['customerCommunication','acceptanceResult'].includes(key));
 if(communicationOnly){
  if(!member.roles.includes('SR'))throw new Error('请由SR登记沟通与验收');
  const next={...review,...patch};
  return {...state,reviewsByProject:{...state.reviewsByProject,[projectId]:state.reviewsByProject[projectId].map(r=>r.id===reviewId?next:r)}};
 }
 const manager=project.ownerId===actorId&&member.roles.includes('SR');
 const assignment=['assign','reopen'].includes(patch.action);
 const qualified=ids.includes(actorId)&&(member.roles.includes('SR')||member.canConfirm);
 if(assignment?!(manager||qualified):!qualified)throw new Error('当前人员不是本事项有效评审人，无处理权限');
 if(!assignment&&!(member.roles.includes('SR')||member.canConfirm))throw new Error('评审确认资格已失效');
 if(['已关闭','已取消'].includes(review.status)&&patch.action!=='reopen')throw new Error('评审已关闭，请先重新评审');
 const row=state.requirementsByProject[projectId].find(r=>r.id===review.requirementId);
 if(!row)throw new Error('关联应答项不存在');
 if(assignment){
  if(patch.action==='reopen'&&state.reviewsByProject[projectId].some(r=>r.id!==reviewId&&r.requirementId===row.id&&r.kind!=='clarification'&&!['已关闭','已取消'].includes(r.status)))throw new Error('本应答项已有进行中的评审，请继续处理当前评审');
  if(!patch.reason?.trim())throw new Error('请填写人员变更或重新评审原因');
  const reviewerIds=validateResponseReviewers(state,projectId,patch.reviewerIds||ids);
  const next={...review,reviewerIds,ownerId:reviewerIds[0],owner:reviewerIds.map(id=>personName(state,id)).join('、'),deadline:patch.deadline||review.deadline,status:'待处理',version:(review.version||1)+1,round:(review.round||1)+(patch.action==='reopen'?1:0),confirmations:{},confirmationHistory:voteArchive(review,row),closedAt:undefined,history:[...(review.history||[]),{action:patch.action==='reopen'?'重新评审':'调整评审人',actorId,actor:personName(state,actorId),reason:patch.reason,time:new Date().toISOString()}]};
  return {...state,reviewsByProject:{...state.reviewsByProject,[projectId]:state.reviewsByProject[projectId].map(r=>r.id===reviewId?next:r)},requirementsByProject:{...state.requirementsByProject,[projectId]:state.requirementsByProject[projectId].map(r=>r.id===row.id?{...r,status:'评审中',confirmedAt:undefined,confirmedBy:undefined,confirmedById:undefined,pendingReviewProposal:r.pendingReviewProposal??null}:r)}};
 }
 const allowed=['plan','impact','evidence','conditions','proposedConclusion','proposedDraft','reason'];
 const safe=Object.fromEntries(allowed.filter(key=>Object.hasOwn(patch,key)).map(key=>[key,patch[key]]));
 const responsePatch={};for(const [key,field]of [['proposedDraft','draft'],['proposedConclusion','conclusion'],['evidence','evidence'],['conditions','conditions'],['reason','reason']])if(Object.hasOwn(safe,key))responsePatch[field]=safe[key];
 const after=applyRequirementEdit(row,responsePatch),changed=allowed.some(key=>Object.hasOwn(safe,key)&&safe[key]!==review[key]);
 let next={...review,...safe};
 if(changed){next={...next,version:(review.version||1)+1,confirmations:{},confirmationHistory:voteArchive(review,row),status:'处理中',requirementVersion:after.version||1};}
 if(patch.action==='confirm'){
  if(row.pendingReviewProposal)throw new Error('请先核对历史评审建议，再确认最终应答');
  const issues=confirmationValidation(after);if(issues.length)throw new Error(issues.join('；'));
  if(state.reviewsByProject[projectId].some(r=>r.id!==reviewId&&r.requirementId===row.id&&!['已关闭','已取消'].includes(r.status)))throw new Error('请先完成关联客户澄清或其他事项');
  // Every selected reviewer must still be eligible when the shared answer becomes final.
  validateResponseReviewers(state,projectId,ids);
  if(!hasReviewConfirmation(next,after,actorId)||patch.note?.trim())next.confirmations={...(next.confirmations||{}),[actorId]:{actorId,actor:personName(state,actorId),requirementVersion:after.version||1,reviewVersion:next.version||1,round:next.round||1,note:patch.note||'',at:new Date().toISOString()}};
 }
 const complete=ids.length>0&&ids.every(id=>hasReviewConfirmation(next,after,id));
 next={...next,status:complete?'已关闭':'处理中',...(complete?{closedAt:new Date().toISOString()}:{}),history:[...(next.history||[]),{action:patch.action==='confirm'?'确认本人评审':'保存评审应答',actorId,actor:personName(state,actorId),time:new Date().toISOString(),reason:patch.note||''}]};
 const updated=complete?{...confirmRequirement(after),confirmedBy:ids.map(id=>personName(state,id)).join('、'),confirmedByIds:ids,confirmedById:actorId,pendingReviewProposal:null}:{...after,status:'评审中',confirmedAt:undefined,confirmedBy:undefined,confirmedById:undefined,pendingReviewProposal:after.pendingReviewProposal??null};
 return {...state,reviewsByProject:{...state.reviewsByProject,[projectId]:state.reviewsByProject[projectId].map(r=>r.id===reviewId?next:r)},requirementsByProject:{...state.requirementsByProject,[projectId]:state.requirementsByProject[projectId].map(r=>r.id===row.id?updated:r)}};
}
export function prepareReviewProposal(requirement,review){if(review.status!=='已关闭'||review.requirementId!==requirement.id)throw new Error('该事项尚未关闭或不属于当前条款');return {reviewId:review.id,kind:review.kind||'review',baseVersion:review.requirementVersion||requirement.version||1,before:structuredClone(review.requirementAtSubmission||requirement),proposal:{draft:review.proposedDraft||requirement.draft,conclusion:review.proposedConclusion||requirement.conclusion,evidence:review.evidence||requirement.evidence,conditions:review.conditions??requirement.conditions},approvedById:review.approvedById,createdAt:new Date().toISOString()};}
export function applyReviewProposal(requirement,proposal,{expectedVersion,actor}){if(!['SR','技术','技术确认人'].includes(actor.role))throw new Error('请由技术确认人核对并采用');if((requirement.version||1)!==expectedVersion||proposal.baseVersion!==expectedVersion)throw new Error('条款版本已变化，请重新评审该建议');return {...requirement,...proposal.proposal,version:expectedVersion+1,status:'待确认',needsReview:true,readyForConfirmation:true,pendingReviewProposal:null,confirmedAt:undefined,confirmedBy:undefined,confirmationReason:'已采用评审建议，请确认本版应答。',adoptionHistory:[...(requirement.adoptionHistory||[]),{reviewId:proposal.reviewId,actor:actor.id,before:proposal.before,after:proposal.proposal,at:new Date().toISOString()}]};}
export function assertIndependentApproval(review,actor,context){if(context){assertPermission(actor.role,'review:approve',context);if(review.approverId!==actor.id)throw new Error('当前人员不是指定专业批准人');}else if(actor.role!=='最终审批人')throw new Error('当前身份无批准权限');if(!review.submittedById||review.submittedById===actor.id)throw new Error('提交人与批准人必须是独立人员；旧事项请重新提交');}
export function recordClarificationReply(issue,input,actor){if(!input.reply?.trim())throw new Error('请填写客户回复');if(input.sufficient&&!input.assessment?.trim())throw new Error('请说明回复充分性的判断依据');return {...issue,status:input.sufficient?'已关闭':'跟进中',proposedDraft:input.suggestion||issue.proposedDraft,closedAt:input.sufficient?new Date().toISOString():undefined,replies:[...(issue.replies||[]),{...input,by:actor.id,at:new Date().toISOString()}]};}

export function beginReview(requirement, review) {
  const next = { ...requirement, status: '评审中', needsReview: true, readyForConfirmation: false, pendingReviewProposal: null, version: (requirement.version || 1) + (requirement.status === '已确认' ? 1 : 0), confirmedAt: undefined, confirmedBy: undefined };
  return { requirement: next, review: { ...review, requirementVersion: next.version, requirementAtSubmission: structuredClone(next) } };
}

export function reopenReview(review, { reason, owner, deadline, actor, at = new Date().toISOString() }) {
  if (review.status !== '已关闭') throw new Error('只有已关闭事项可以重新评审');
  if (!['SR','技术','销售负责人','技术确认人'].includes(actor?.role)) throw new Error('当前身份没有重新评审职责');
  if (!reason?.trim()) throw new Error('请填写重新评审原因');
  if (!owner?.trim() || !deadline) throw new Error('请选择责任人和截止时间');
  const { roundHistory, ...previousRound } = review;
  const next = { ...review, status: '待处理', version: (review.version || 1) + 1, round: (review.round || 1) + 1, reason: reason.trim(), owner: owner.trim(), deadline,
    roundHistory: [...(roundHistory || []), structuredClone(previousRound)],
    history: [...(review.history || []), { action: '重新评审', reason: reason.trim(), actor: actor.role, actorId: actor.id, time: at }],
  };
  for (const field of ['approvedAt', 'approvedBy', 'approvedById', 'approvalReason', 'submittedAt', 'submittedBy', 'submittedById', 'requirementVersion', 'requirementAtSubmission', 'closedAt']) delete next[field];
  return next;
}

export function requirementAfterReview(requirement, previous, next) {
  if (next.status === '已关闭' && previous.status !== '已关闭') return { ...requirement, status: '待确认', needsReview: true, readyForConfirmation: true, confirmedAt: undefined, confirmedBy: undefined, pendingReviewProposal: prepareReviewProposal(requirement, next), confirmationReason: `评审已完成，请核对结果并确认应答。` };
  if (previous.status === '已关闭' && !['已关闭', '已取消'].includes(next.status)) return { ...requirement, version: (requirement.version || 1) + 1, status: '评审中', needsReview: true, readyForConfirmation: false, confirmedAt: undefined, confirmedBy: undefined, pendingReviewProposal: null, confirmationReason: `已发起重新评审：${next.reason}` };
  return requirement;
}
