import {getConfirmationActorIds,getReviewActorIds,hasReviewConfirmation} from './confirmationPolicy.js';

export function selectResponseEntry({requirements=[],reviews=[],state={},projectId,actorRole,actorId,requirementId,reviewId}) {
 const explicit=requirements.find(row=>row.id===(requirementId||reviews.find(review=>review.id===reviewId)?.requirementId));
 if(explicit)return explicit;
 if(actorRole!=='SR'&&actorId){
  const pending=requirements.find(row=>{
   if(row.status==='已确认')return false;
   const open=reviews.filter(review=>review.requirementId===row.id&&!['已关闭','已取消'].includes(review.status));
   if(open.length)return open.some(review=>getReviewActorIds(review).includes(actorId)&&!hasReviewConfirmation(review,row,actorId));
   return getConfirmationActorIds(state,projectId,row).includes(actorId);
  });
  if(pending)return pending;
 }
 return requirements.find(row=>/\.docx?$/i.test(row.source||''))||requirements[0];
}
