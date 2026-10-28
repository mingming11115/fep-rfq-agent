import {assertPermission} from './permissions.js';
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
