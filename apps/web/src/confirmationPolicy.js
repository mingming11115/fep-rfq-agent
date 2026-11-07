// Identity and version policy shared by permissions, task generation and review UI.
import {canAccessProject,getPersonnelContext} from './personnelDomain.js';

export const getReviewActorIds = review => [...new Set((review?.reviewerIds ?? (review?.ownerId ? [review.ownerId] : [])).filter(Boolean))];
export const hasAssignedConfirmer = row => row?.confirmationAssignmentSource === 'explicit' && !!row?.confirmationAssigneeId;
export function getResponseReview(state,projectId,requirementId){
 return (state.reviewsByProject?.[projectId]||[]).find(r=>r.requirementId===requirementId&&r.kind!=='clarification'&&r.status!=='已取消'&&Array.isArray(r.reviewerIds));
}
export function getDefaultConfirmationActorId(state,projectId){
 const project=state.projects?.find(p=>p.id===projectId);
 if(!project)return undefined;
 if(state.dataSource==='mysql')return project.defaultConfirmationAssigneeId??project.ownerId;
 const creatorId=project.createdById;
 if(creatorId){
  const {account,member,enabled}=getPersonnelContext(state,creatorId,project.buId);
  if(enabled&&!account.systemAdmin&&(member.roles.includes('SR')||member.canConfirm)&&canAccessProject(state,creatorId,projectId))return creatorId;
 }
 return project.ownerId;
}
export function getConfirmationActorIds(state,projectId,row){
 if(hasAssignedConfirmer(row))return [row.confirmationAssigneeId];
 const review=getResponseReview(state,projectId,row?.id);
 if(state.dataSource==='mysql')return review?[]:[row?.confirmationAssigneeId||getDefaultConfirmationActorId(state,projectId)].filter(Boolean);
 const implicit=state.implicitConfirmationIdsByProject?.[projectId]?.includes(row?.id)&&row?.confirmationAssignmentSource!=='explicit';
 return review?getReviewActorIds(review):[(!implicit&&row?.confirmationAssigneeId)||getDefaultConfirmationActorId(state,projectId)].filter(Boolean);
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
