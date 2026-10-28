// Identity and version policy shared by permissions, task generation and review UI.
export const getReviewActorIds = review => [...new Set((review?.reviewerIds ?? (review?.ownerId ? [review.ownerId] : [])).filter(Boolean))];
export function getResponseReview(state,projectId,requirementId){
 return (state.reviewsByProject?.[projectId]||[]).find(r=>r.requirementId===requirementId&&r.kind!=='clarification'&&r.status!=='已取消'&&Array.isArray(r.reviewerIds));
}
export function getConfirmationActorIds(state,projectId,row){
 const review=getResponseReview(state,projectId,row?.id);
 const implicit=state.implicitConfirmationIdsByProject?.[projectId]?.includes(row?.id)&&row?.confirmationAssignmentSource!=='explicit';
 return review?getReviewActorIds(review):[(!implicit&&row?.confirmationAssigneeId)||state.projects?.find(p=>p.id===projectId)?.ownerId].filter(Boolean);
}
export function hasReviewConfirmation(review,row,actorId){
 const vote=review?.confirmations?.[actorId];
 return !!vote&&vote.requirementVersion===(row?.version||1)&&vote.reviewVersion===(review.version||1)&&vote.round===(review.round||1);
}
export function getSourceContextError(row,route={}){
 if(!row||route.requirementId!==row.id)return '';
 if(route.sourceVersion&&String(route.sourceVersion)!==String(row.sourceVersion||'1')||route.fileId&&route.fileId!==(row.sourceFileId||row.source))return '当前链接指向旧来源版本，请打开当前有效来源后处理';
 return '';
}
