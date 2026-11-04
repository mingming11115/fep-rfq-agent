import { makeRequirements } from './data.js';
import { buildResponseAdvice } from './responseAdvice.js';
import { hasAssignedConfirmer } from './confirmationPolicy.js';

export function captureSystemRecommendation(row) {
  return { conclusion:row.conclusion, draft:row.draft||'', conditions:row.conditions||'', evidence:row.evidence||'', original:row.original, sourceVersion:row.sourceVersion, version:row.matchLevel==='history'?'V3':'V2' };
}

export function matchingSuggestion(row={}, projectId) {
  const pending={conclusion:'待确认',draft:'当前无可直接采用的有效答复，请补充依据或转专业评审。',conditions:'',evidence:'',version:'待重新匹配',confidence:0};
  if(row.sourceRevision||row.sourceCorrected||row.removedFromSource)return pending;
  const template=row.systemRecommendation||(projectId?makeRequirements(projectId).find(item=>item.title===row.title):null);
  if(!template||template.original!==row.original||(template.sourceVersion!=null&&template.sourceVersion!==row.sourceVersion))return pending;
  return {conclusion:template.conclusion||'待确认',draft:template.draft||pending.draft,conditions:template.conditions||'',evidence:template.evidence||'',version:row.systemRecommendation?.version|| (row.matchLevel==='history'?'V3':'V2'),confidence:row.score||0};
}

export function canReviewWithoutManualConfirmation(row, projectId) {
  if(hasAssignedConfirmer(row))return false;
  if(row.status!=='待确认'||row.conclusion!=='Comply'||row.needsReview||row.pendingReviewProposal||row.sourceRevision||row.sourceCorrected||row.removedFromSource)return false;
  if(![row.original,row.draft,row.evidence].every(value=>typeof value==='string'&&value.trim()))return false;
  const suggestion=matchingSuggestion(row,projectId);
  return suggestion.conclusion==='Comply'&&buildResponseAdvice(row,suggestion).conclusion==='满足';
}

export function getUnconfirmedComplyRows(rows=[], projectId) {
  return rows.filter(row=>canReviewWithoutManualConfirmation(row,projectId));
}
