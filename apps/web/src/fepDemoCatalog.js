import {MODELS,PROCESSES} from './modelProcessSeeds.js';

const marker='rfq.demo.hesper-e360r.v1';
const backup='rfq.demo.before-hesper-e360r.v1';
const keys=['models','processes','capabilities','knowledge','evidence'].map(kind=>`rfq.reference.${kind}.v1`);
const seededIds=new Set(['MOD-A-R2','MOD-A-R1','CAP-001','CAP-002','CAP-003','CAP-004','CAP-005','K-021','K-018','K-007','K-012','T-01','DOC-009','DOC-004','DOC-015']);
const labels=[['机型 A','Hesper E360R'],['设备 A','Hesper E360R'],['CFG-A-R2','CFG-HESPER-E360R-R2'],['CFG-A-R1','CFG-HESPER-E360R-R1'],['工艺 P1','Si 工艺'],['研发配置基线 A-R2','研发配置基线 Hesper E360R R2（演示）'],['研发配置基线 A-R1','研发配置基线 Hesper E360R R1（演示）']];
const displayText=value=>labels.reduce((text,[before,after])=>text.replaceAll(before,after),value);
const oldProcesses={
  'PROC-A-R2-P1':{code:'P1',name:'基础加工工艺',conditions:'硅材料；测试方法 M1'},
  'PROC-A-R2-P2':{code:'P2',name:'精密加工工艺',conditions:'模块 X；需样品验证'},
  'PROC-A-R1-P1':{code:'P1',name:'旧版基础工艺',conditions:'仅适用 R1'},
};
function updateSeed(row){
  if((row.buId||'BU-DEMO')!=='BU-DEMO'||row.updatedById||row.submitterId) { return row; }
  const oldProcess=oldProcesses[row.id];
  if(oldProcess){
    if(row.code!==oldProcess.code||row.name!==oldProcess.name) { return row; }
    const process=PROCESSES.find(item=>item.id===row.id);
    return {...row,code:process.code,name:process.name,conditions:row.conditions===oldProcess.conditions?process.conditions:row.conditions};
  }
  if(!seededIds.has(row.id)||row.id.startsWith('MOD-')&&row.name!=='机型 A') { return row; }
  const next={...row};
  for(const field of ['name','standard','config','source','conditions','model','answer'])if(typeof next[field]==='string') { next[field]=displayText(next[field]); }
  if(next.code==='FEP-A') { next.code='HESPER-E360R'; }
  if(row.id==='MOD-A-R2'&&row.standard==='标准模块 S；300 mm 晶圆上料；基础工艺 P1') { next.standard=MODELS.find(item=>item.id===row.id).standard; }
  if(next.refs) { next.refs=next.refs.map(ref=>({...ref,title:typeof ref.title==='string'?displayText(ref.title):ref.title})); }
  return next;
}

// Update the stock FEP demo once; stable IDs, authored records and other BUs stay intact.
export function migrateFepDemoCatalog(storage){
  if(storage.getItem(marker)) { return; }
  const before=new Map(keys.map(key=>[key,storage.getItem(key)]));
  const rows=keys.map(key=>{
    const value=before.get(key);
    if(value===null) { return null; }
    const parsed=JSON.parse(value);
    if(!Array.isArray(parsed)) { throw new Error('演示资料格式异常，保留原有数据'); }
    return parsed;
  });
  const [models,processes,capabilities]=rows;
  const hasModel=models===null||models.some(row=>row.id==='MOD-A-R2'&&(row.buId||'BU-DEMO')==='BU-DEMO');
  const hasOldProcesses=hasModel&&processes?.some(row=>row.modelId==='MOD-A-R2'&&oldProcesses[row.id]?.code===row.code&&oldProcesses[row.id]?.name===row.name&&(row.buId||'BU-DEMO')==='BU-DEMO'&&!row.updatedById);
  const updated=rows.map(items=>items?.map(updateSeed)??null);
  if(models) { updated[0]=updated[0].filter(row=>!(row.id==='MOD-B-R1'&&row.name==='机型 B'&&row.code==='FEP-B'&&(row.version||1)===1&&!row.updatedById&&!row.submitterId&&(row.buId||'BU-DEMO')==='BU-DEMO'&&![...(processes||[]),...(capabilities||[])].some(child=>child.modelId===row.id))); }
  const geSi=PROCESSES.find(row=>row.code==='GeSi');
  if(hasOldProcesses&&!updated[1].some(row=>row.id===geSi.id||row.modelId==='MOD-A-R2'&&(row.buId||'BU-DEMO')==='BU-DEMO'&&String(row.code).toLowerCase()==='gesi')) { updated[1].push(structuredClone(geSi)); }
  const changes=keys.flatMap((key,index)=>updated[index]!==null&&JSON.stringify(updated[index])!==before.get(key)?[[key,JSON.stringify(updated[index])]]:[]);
  if(changes.length&&storage.getItem(backup)===null) { storage.setItem(backup,JSON.stringify(Object.fromEntries(before))); }
  const written=[];
  try{
    for(const [key,value]of changes){storage.setItem(key,value);written.push(key);}
    storage.setItem(marker,'1');
  }catch(error){
    console.error('写入 FEP 演示资料失败', error);
    for(const key of written.reverse())storage.setItem(key,before.get(key));
    throw error;
  }
}
