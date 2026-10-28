const openIssue=issue=>!['已关闭','已取消'].includes(issue.status);
export const responseIsConfirmed=row=>row.status==='已确认'&&!row.needsReview&&!row.pendingReviewProposal;
const pending=(row,mode)=>!responseIsConfirmed(row)&&(mode!=='submit'||!row.readyForConfirmation);

export function selectResponseQueue(rows=[],reviews=[],{filter='all',query='',canAct=()=>true,mode='confirm'}={}){
  const search=query.trim().toLocaleLowerCase();
  return rows.filter(row=>{
    if(search&&!`${row.clause||''} ${row.title||''} ${row.original||''}`.toLocaleLowerCase().includes(search))return false;
    if(filter==='mine')return pending(row,mode)&&canAct(row);
    if(filter==='confirmed')return responseIsConfirmed(row);
    if(filter==='review'||filter==='clarification')return reviews.some(issue=>issue.requirementId===row.id&&openIssue(issue)&&(filter==='clarification'?issue.kind==='clarification':issue.kind!=='clarification'));
    return true;
  });
}
export function responseQueueCounts(rows=[],reviews=[],{canAct=()=>true,mode='confirm'}={}){
  const open=reviews.filter(openIssue),ids=new Set(rows.map(row=>row.id));
  return {total:rows.length,confirmed:rows.filter(responseIsConfirmed).length,pending:rows.filter(row=>!responseIsConfirmed(row)).length,
    mine:rows.filter(row=>pending(row,mode)&&canAct(row)).length,
    review:new Set(open.filter(issue=>issue.kind!=='clarification'&&ids.has(issue.requirementId)).map(issue=>issue.requirementId)).size,
    clarification:new Set(open.filter(issue=>issue.kind==='clarification'&&ids.has(issue.requirementId)).map(issue=>issue.requirementId)).size,
    issues:open.length};
}
export function nextResponseRequirement(rows=[],currentId,{mode='confirm',canAct=()=>true}={}){
  const index=rows.findIndex(row=>row.id===currentId);
  const ordered=index<0?rows:rows.slice(index+1).concat(rows.slice(0,index));
  return ordered.find(row=>row.id!==currentId&&pending(row,mode)&&canAct(row))||null;
}
export function responseQueueRoute(row){
  return {fileId:row.sourceFileId||row.source||'manual',sourceVersion:String(row.sourceVersion||'1'),taskId:undefined,reviewId:undefined,action:undefined};
}
export function responseReviewRoute(row,reviewId,{route={},task}={}){
  const matches=task?.projectId===route.projectId&&task?.objectType==='review'&&task.objectId===reviewId;
  return {...responseQueueRoute(row),reviewId,...(matches?{taskId:route.taskId,action:route.action}:{})};
}
