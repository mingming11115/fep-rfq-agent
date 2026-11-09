const normalized=value=>String(value??'').trim().replace(/\s+/g,' ');
export const versionFamily=doc=>doc.familyId||doc.id;
export function latestHistoryClauses(rows){
 const latest=new Map();
 for(const row of rows)if(!latest.has(row.id)||Number(row.version)>Number(latest.get(row.id).version)) { latest.set(row.id,row); }
 return [...latest.values()];
}
export function compareHistoryVersions(before,after){
 const left=new Set(latestHistoryClauses(before)),right=new Set(latestHistoryClauses(after)),pairs=[];
 for(const field of ['requirement','clauseNo']){
  const group=rows=>{const map=new Map();for(const row of rows){const key=normalized(row[field]);if(key) { map.set(key,[...(map.get(key)||[]),row]); }}return map;};
  const a=group(left),b=group(right);
  for(const [key,rows] of a)if(rows.length===1&&b.get(key)?.length===1){const old=rows[0],next=b.get(key)[0];pairs.push({before:old,after:next});left.delete(old);right.delete(next);}
 }
 const ambiguous=(row,others)=>others.some(other=>normalized(row.clauseNo)&&normalized(row.clauseNo)===normalized(other.clauseNo));
 const result=pairs.map(pair=>{
  const changed=fields=>fields.some(field=>normalized(pair.before[field])!==normalized(pair.after[field]));
  const needsReview=changed(['requirement']);
  return {...pair,kind:needsReview?'要求变更':changed(['answer','conditions','modelOverride','configOverride'])?'答复变更':changed(['clauseNo','section'])?'位置调整':'未变化',needsReview};
 });
 for(const row of left)result.push({before:row,kind:'删除条款',uncertain:ambiguous(row,[...right])});
 for(const row of right)result.push({after:row,kind:'新增条款',needsReview:true,uncertain:ambiguous(row,[...left])});
 return result.map((row,index)=>({...row,key:String(index)}));
}
