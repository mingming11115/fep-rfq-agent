import {officeClauseTargets} from './officeClauseLink.js';
export function craftClauseTargets(source,rows,engine){
  const targets=officeClauseTargets(source,rows),fold=value=>value.trim().replace(/\s+/g,' ');
  const counts=new Map(),byId=new Map(rows.map(row=>[row.id,row]));
  for(const target of targets){const quote=fold(target.quote);counts.set(quote,(counts.get(quote)||0)+1);}
  return targets.map(target=>{
    const row=byId.get(target.id);
    if(engine==='wordcraft'&&target.quote.trim()&&row?.title&&row?.clause&&counts.get(fold(target.quote))>1){
      return {...target,quote:`${row.clause} ${row.title}\n${target.quote}`};
    }
    return target;
  });
}
