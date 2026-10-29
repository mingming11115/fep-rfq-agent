import {canPerform} from './permissions.js';

const belongsTo=(row,buId)=>(row.buId||'BU-DEMO')===buId;
const day=()=>new Date().toISOString().slice(0,10);
function assertConfiguration(context,record,creating=false){
 const canCreate=creating&&canPerform(context?.state?.actorRole||'SR','catalog:create',context);
 if(!context?.buId||!(canPerform('BU管理员','model:configure',context)||canCreate))throw new Error('没有本BU的机型与工艺配置权限');
 if(record.buId&&record.buId!==context.buId)throw new Error('不能配置其他BU的资料');
}
const required=(value,label)=>{if(!String(value||'').trim())throw new Error(`请填写${label}`);return String(value).trim();};

export function saveModelMetadata(models,{context,record}){
 assertConfiguration(context,record,!models.some(item=>item.id===record.id));
 const code=required(record.code,'机型编码'),name=required(record.name,'机型名称'),revision=required(record.revision,'硬件版本'),config=required(record.config,'配置定义');
 const local=models.filter(r=>belongsTo(r,context.buId)),existing=local.filter(r=>r.id===record.id);
 if(local.some(r=>r.id!==record.id&&r.code.toLowerCase()===code.toLowerCase()&&r.revision.toLowerCase()===revision.toLowerCase()))throw new Error('机型编码与硬件版本重复');
 if(models.some(r=>r.id===record.id&&!belongsTo(r,context.buId)))throw new Error('不能覆盖其他BU的机型');
 const previous=existing.sort((a,b)=>b.version-a.version)[0];
 if(previous&&previous.revision!==revision)throw new Error('已有机型的硬件版本不可更改，请新建机型以保留原工艺与能力归属');
 const item={...record,code,name,revision,config,buId:context.buId,scope:'FEP 授权项目',version:previous?(previous.version||1)+1:1,status:'已发布',validity:'有效',updatedById:context.actorId,history:[...(previous?.history||record.history||[]),{date:day(),text:`${context.state?.actorRole||'BU管理员'}保存机型配置`}]};
 delete item.newVersion;
 return [...models.map(r=>r.id===record.id&&belongsTo(r,context.buId)?{...r,validity:'被替代'}:r),item];
}

export function saveModelProcess(processes,{context,models,record}){
 assertConfiguration(context,record,!processes.some(item=>item.id===record.id));
 if(!models.some(m=>m.id===record.modelId&&belongsTo(m,context.buId)))throw new Error('请选择本BU的机型');
 const code=required(record.code,'工艺编码'),name=required(record.name,'工艺名称');
 const before=processes.find(p=>p.id===record.id);
 if(before&&(!belongsTo(before,context.buId)||before.modelId!==record.modelId))throw new Error('不能变更工艺的机型或BU归属');
 if(processes.some(p=>belongsTo(p,context.buId)&&p.modelId===record.modelId&&p.id!==record.id&&p.code.toLowerCase()===code.toLowerCase()))throw new Error('该机型下的工艺编码重复');
 const item={...record,code,name,buId:context.buId,enabled:record.enabled!==false,version:(before?.version||0)+1,updatedById:context.actorId,history:[...(before?.history||[]),{date:day(),text:`${context.state?.actorRole||'BU管理员'}保存工艺配置（${record.enabled===false?'停用':'启用'}）`}]};
 return before?processes.map(p=>p.id===item.id?item:p):[...processes,item];
}

export function removeCatalogNode({models,processes,capabilities},{context,kind,id,version}){
 if(!['model','process','capability'].includes(kind))throw new Error('不支持的目录类型');
 assertConfiguration(context,{});
 const local=row=>belongsTo(row,context.buId);
 const rows={model:models,process:processes,capability:capabilities}[kind];
 const target=rows.find(row=>local(row)&&row.id===id&&(kind!=='capability'||row.version===version));
 if(!target)throw new Error('目录条目不存在或不属于当前BU');
 return {
  models:models.filter(row=>!(local(row)&&kind==='model'&&row.id===id)),
  processes:processes.filter(row=>!(local(row)&&(kind==='model'&&row.modelId===id||kind==='process'&&row.id===id))),
  capabilities:capabilities.filter(row=>!(local(row)&&(kind==='model'&&row.modelId===id||kind==='process'&&row.processId===id&&row.modelId===target.modelId||kind==='capability'&&row.id===id&&row.version===version))),
 };
}

export function assertCapabilityProcess(item,{models,processes,buId,requireEnabled=true}){
 if(item.buId&&item.buId!==buId)throw new Error('能力不属于当前BU');
 if(!models.some(m=>m.id===item.modelId&&belongsTo(m,buId)))throw new Error('请选择本BU的有效机型');
 if(!item.processId){if(requireEnabled)throw new Error('请关联机型下的工艺');return true;}
 const process=processes.find(p=>p.id===item.processId&&p.modelId===item.modelId&&belongsTo(p,buId));
 if(!process)throw new Error('工艺不属于当前BU及机型');
 if(requireEnabled&&process.enabled===false)throw new Error('工艺已停用，请选择启用的工艺');
 return true;
}

export function prepareCapabilityImports(existing,rows,processId){
 const seen=new Set(existing.map(r=>r.id));
 return rows.flatMap(row=>{
  const id=`${row.id}-${processId}`;
  if(seen.has(id))return [];
  seen.add(id);return [{...row,id}];
 });
}

export function buildCapabilityImportTemplate({buId,buName,model,process}){
 assertCapabilityProcess({modelId:model?.id,processId:process?.id},{models:model?[model]:[],processes:process?[process]:[],buId});
 return [
  ['BU编码','BU名称','机型编码','机型名称','硬件版本','工艺编码','工艺名称','配置','指标','能力值','值类型','适用条件','限制','证据','批准人'],
  [buId,buName||buId,model.code,model.name,model.revision,process.code,process.name,model.config,'请填写能力指标','','保证值',process.conditions||'','','','BU管理员'],
 ];
}
