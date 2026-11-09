import {MODELS,PROCESSES,CAPABILITIES} from './modelProcessSeeds.js';
import {resourceStorageKey,selectReadableResources} from './resourceVisibility.js';
import {assertCapabilityProcess,saveModelMetadata,saveModelProcess,removeCatalogNode} from './modelProcessDomain.js';

const belongsTo=(record,buId)=>(record.buId||'BU-DEMO')===buId;
function readRows(storage,base,seed,buId){
 const saved=storage.getItem(resourceStorageKey(base,buId));
 if(saved===null)return buId==='BU-DEMO'?structuredClone(seed):[];
 const rows=JSON.parse(saved);
 if(!Array.isArray(rows))throw new Error('机型或工艺目录格式异常，请先修复目录');
 return rows;
}
export function readRfqCatalog(storage,context){
 if(context?.state?.dataSource==='mysql')return {models:[],processes:[]};
 return {
  models:selectReadableResources(readRows(storage,'rfq.reference.models.v1',MODELS,context.buId),context,'catalog'),
  processes:selectReadableResources(readRows(storage,'rfq.reference.processes.v1',PROCESSES,context.buId),context,'catalog'),
 };
}
export function saveRfqCatalogRecord(storage,context,kind,record){
 const models=readRows(storage,'rfq.reference.models.v1',MODELS,context.buId);
 const processes=readRows(storage,'rfq.reference.processes.v1',PROCESSES,context.buId);
 if(kind!=='model'&&kind!=='process')throw new Error('不支持的目录类型');
 const next=kind==='model'?saveModelMetadata(models,{context,record}):saveModelProcess(processes,{context,models,record});
 const key=resourceStorageKey(kind==='model'?'rfq.reference.models.v1':'rfq.reference.processes.v1',context.buId);
 storage.setItem(key,JSON.stringify(next));
 return readRfqCatalog(storage,context);
}
export function deleteRfqCatalogRecord(storage,context,kind,record){
 const fields=[['models','rfq.reference.models.v1',MODELS],['processes','rfq.reference.processes.v1',PROCESSES],['capabilities','rfq.reference.capabilities.v1',CAPABILITIES]];
 const before=fields.map(([,base])=>[resourceStorageKey(base,context.buId),storage.getItem(resourceStorageKey(base,context.buId))]);
 const catalog=Object.fromEntries(fields.map(([field,base,seed])=>[field,readRows(storage,base,seed,context.buId)]));
 const next=removeCatalogNode(catalog,{context,kind,id:record.id,version:record.version});
 const written=[];
 try{
  fields.forEach(([field],index)=>{storage.setItem(before[index][0],JSON.stringify(next[field]));written.push(index);});
 }catch(error){
  for(const index of written.reverse()){
   const [key,value]=before[index];
   if(value===null)storage.removeItem(key);else storage.setItem(key,value);
  }
  throw error;
 }
 return readRfqCatalog(storage,context);
}
export function resolveRfqProcessBinding({models,processes,modelId,processId,buId}){
 assertCapabilityProcess({modelId,processId},{models,processes,buId});
 const model=models.filter(record=>record.id===modelId&&belongsTo(record,buId)).sort((a,b)=>(b.version||1)-(a.version||1))[0];
 const process=processes.find(record=>record.id===processId&&record.modelId===modelId&&belongsTo(record,buId));
 return {modelId:model.id,modelName:model.name,modelCode:model.code,modelRevision:model.revision,modelMetadataVersion:model.version||1,modelConfig:model.config,
  processId:process.id,processName:process.name,processCode:process.code,processVersion:process.version||1};
}
