export function clauseSourceQuote(row){return row.sourceRefs?.[0]?.quote??row.sourceOriginal??row.original??'';}
export function selectionSource(row) {
 const anchor=row.sourceRefs?.[0]?.anchor;
 if(!anchor?.startsWith('selection:')) { return null; }
 const page=anchor.match(/^selection:page:(\d+)$/)?.[1];
 return page ? {sourcePage:Number(page)} : {};
}
export function makeSourceAnchor(row){return {projectId:row.projectId,fileId:row.sourceFileId||row.source||'manual',sourceVersion:String(row.sourceVersion||'1'),requirementId:row.id,locator:{page:row.sourcePage,sectionPath:row.sectionPath||[],quote:clauseSourceQuote(row)}};}
export function resolveSourceAnchor(rows,anchor){const row=rows.find(r=>r.id===anchor.requirementId&&r.projectId===anchor.projectId&&(r.sourceFileId||r.source||'manual')===anchor.fileId);if(!row) { return {status:'missing'}; } return {status:String(row.sourceVersion||'1')===String(anchor.sourceVersion)?'resolved':'stale',row};}
