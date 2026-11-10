import {officeClauseTargets} from './officeClauseLink.js';
const fold=value=>value.trim().replace(/\s+/g,' ');

export function craftClauseTargets(source,rows,engine,blocks=[]){
  const targets=officeClauseTargets(source,rows);
  if(engine!=='wordcraft') { return targets; }
  const tableQuotes=new Map(),paragraphs=[];
  for(const {type,content} of blocks){
    if(!content) { continue; }
    if(type==='paragraph') { paragraphs.push(fold(content)); }
    if(type!=='table') { continue; }
    for(const line of content.split('\n')){
      const cells=line.split(' | ').filter(cell=>cell.trim());
      if(cells.length<2) { continue; }
      // Extraction uses colons or pipes between cells. WordCraft searches across cells with spaces.
      const native=fold(cells.join(' '));
      for(const extracted of [fold(cells.join('：')),fold(line)]){
        tableQuotes.set(extracted,tableQuotes.has(extracted)&&tableQuotes.get(extracted)!==native?null:native);
      }
    }
  }
  const counts=new Map(),byId=new Map(rows.map(row=>[row.id,row]));
  for(const target of targets){const quote=fold(target.quote);counts.set(quote,(counts.get(quote)||0)+1);}
  return targets.map(target=>{
    const quote=fold(target.quote),native=tableQuotes.get(quote);
    if(native&&!paragraphs.some(text=>text.includes(quote))) { return {...target,quote:native}; }
    const row=byId.get(target.id);
    if(quote&&row?.title&&row?.clause&&counts.get(quote)>1){
      return {...target,quote:`${row.clause} ${row.title}\n${target.quote}`};
    }
    return target;
  });
}
