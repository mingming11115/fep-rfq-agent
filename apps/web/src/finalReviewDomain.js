import {getRequiredFinalReviewers} from './personnelDomain.js';

export function isFinalReviewApproved(snapshot) {
 try {
  if(snapshot?.stale||snapshot?.status==='已退回') { return false; }
  const review=snapshot.finalReview;
  return getRequiredFinalReviewers(review).every(({actorId,side})=>{
   const vote=side==='sr'?review.decisions?.sr:review.decisions?.technicalByActorId?.[actorId];
   return vote?.actorId===actorId&&vote.result==='approved';
  });
 }catch (error){ console.error('读取终审审批结果失败', error); return false;}
}
export function applyFinalReviewDecision(snapshot,{actorId,side,result,reason='',at=new Date().toISOString()}) {
 if(snapshot?.stale) { throw new Error('快照已失效，请处理最新版本'); }
 if(snapshot?.status!=='审批中') { throw new Error('快照状态已变化或已退回'); }
 const required=getRequiredFinalReviewers(snapshot.finalReview);
 if(!required.some(r=>r.actorId===actorId&&r.side===side)) { throw new Error('当前人员不是本方指定的最终评审人'); }
 if(!['approved','rejected'].includes(result)) { throw new Error('无效的评审结果'); }
 if(result==='rejected'&&!reason.trim()) { throw new Error('退回必须填写原因'); }
 const review=structuredClone(snapshot.finalReview),decisions=review.decisions;
 if(side==='sr'?decisions.sr:decisions.technicalByActorId[actorId]) { throw new Error('本轮评审已经处理，不能重复提交'); }
 const vote={actorId,result,reason:reason.trim(),at};
 if(side==='sr') { decisions.sr=vote; } else { decisions.technicalByActorId[actorId]=vote; }
 const next={...snapshot,finalReview:review,reviewedAt:at,reviewedById:actorId,reviewReason:reason.trim(),history:[...(snapshot.history||[]),{action:result==='approved'?'最终评审通过':'退回快照',actorId,actor:actorId,side,time:at,reason}]};
 next.status=result==='rejected'?'已退回':isFinalReviewApproved(next)?'已批准':'审批中';
 return next;
}
