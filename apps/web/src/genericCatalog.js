import {canPerform} from './permissions.js';
export const catalogKey=buId=>`rfq.generic.catalog.v1:${buId}`;
export const fieldTypes=['text','number','select','multiselect','date'];
export function migrateCatalog(buId,{models=[],processes=[]}={},capabilities=[]){
 const local=rows=>rows.filter(r=>(r.buId||'BU-DEMO')===buId);
 const latest=new Map();for(const m of local(models)){if(!latest.has(m.id)||(m.version||1)>(latest.get(m.id).version||1))latest.set(m.id,m);}
 const nodes=[...latest.values()].map(m=>({id:m.id,levelId:'model',parentId:'',name:m.name,enabled:true,legacyModelId:m.id,values:{code:m.code||'',revision:m.revision||'',config:m.config||''}}));
 for(const p of local(processes))if(latest.has(p.modelId))nodes.push({id:p.id,levelId:'process',parentId:p.modelId,name:p.name,enabled:p.enabled!==false,legacyModelId:p.modelId,legacyProcessId:p.id,values:{code:p.code||'',conditions:p.conditions||''}});
 return {buId,version:1,schema:{title:'分组与能力配置',levels:[{id:'model',name:'机型',fields:[{id:'code',name:'编码',type:'text'},{id:'revision',name:'版本',type:'text'},{id:'config',name:'配置',type:'text'}]},{id:'process',name:'工艺',fields:[{id:'code',name:'编码',type:'text'},{id:'conditions',name:'适用条件',type:'text'}]}]},nodes,attachments:local(capabilities).map(c=>({nodeId:nodes.some(n=>n.id===c.processId)?c.processId:c.modelId,capabilityId:c.id,version:c.version||1})).filter(a=>nodes.some(n=>n.id===a.nodeId))};
}
const fail=message=>{throw new Error(message);};
export function nodePath(c,id){const path=[],seen=new Set();let n=c.nodes.find(n=>n.id===id);while(n){if(seen.has(n.id))fail('分组存在循环');seen.add(n.id);path.unshift(n.name);n=c.nodes.find(p=>p.id===n.parentId);}return path.join(' / ');}
export function nodeEnabled(c,id){let n=c.nodes.find(n=>n.id===id);if(!n)return false;const seen=new Set();while(n){if(seen.has(n.id)||n.enabled===false)return false;seen.add(n.id);if(c.schema.levels.find(l=>l.id===n.levelId)?.enabled===false)return false;n=c.nodes.find(p=>p.id===n.parentId);}return true;}
export function validateCatalog(c){
 if(!c.buId||!c.schema?.title?.trim()||!c.schema.levels.length)fail('请填写配置名称并保留至少一个层级');
 const levelIds=new Set(),nodeIds=new Set();
 for(const l of c.schema.levels){if(!l.id||levelIds.has(l.id)||!l.name?.trim())fail('层级名称不能为空，标识不能重复');levelIds.add(l.id);const ids=new Set();for(const f of l.fields||[]){if(!f.id||ids.has(f.id)||!f.name?.trim()||!fieldTypes.includes(f.type))fail('字段名称、标识或类型无效');ids.add(f.id);if(['select','multiselect'].includes(f.type)&&(!f.options?.length||new Set(f.options).size!==f.options.length||f.options.some(o=>!o.trim())))fail('选项不能为空或重复');}}
 for(const n of c.nodes){if(!n.id||nodeIds.has(n.id)||!n.name?.trim())fail('分组名称不能为空，标识不能重复');nodeIds.add(n.id);const index=c.schema.levels.findIndex(l=>l.id===n.levelId);if(index<0)fail('已有数据的层级不能移除，请停用');const parent=c.nodes.find(p=>p.id===n.parentId);if(n.parentId&&!parent)fail('上级分组不存在');nodePath(c,n.id);let depth=1,current=parent;while(current){depth++;current=c.nodes.find(p=>p.id===current.parentId);}if(depth>4)fail('Group nesting cannot exceed 4');}
 return c;
}
export function saveNode(c,node){
 const level=c.schema.levels.find(l=>l.id===node.levelId);if(!level||level.enabled===false)fail('请选择启用的层级');
 const values={...node.values};for(const f of level.fields||[]){if(f.enabled===false)continue;const v=values[f.id],empty=v===undefined||v===null||v===''||Array.isArray(v)&&!v.length;if(f.required&&empty)fail(`请填写${f.name}`);if(empty)continue;if(f.type==='number'&&(typeof v==='boolean'||!Number.isFinite(Number(v))))fail(`${f.name}必须是数字`);if(f.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))fail(`${f.name}日期无效`);if(f.type==='select'&&!f.options.includes(v)||f.type==='multiselect'&&(!Array.isArray(v)||v.some(x=>!f.options.includes(x))))fail(`${f.name}选项无效`);}
 const before=c.nodes.find(n=>n.id===node.id);if(before&&(before.levelId!==node.levelId||before.parentId!==node.parentId))fail('已有分组的层级与归属不可变更');
 const next={...c,nodes:before?c.nodes.map(n=>n.id===node.id?{...n,...node,values}:n):[...c.nodes,{...node,values}]};return validateCatalog(next);
}
export function resolveGroupBinding(c,id,buId){if(c.buId!==buId)fail('不能关联其他BU的分组');validateCatalog(c);const n=c.nodes.find(n=>n.id===id);if(!n||!nodeEnabled(c,id))fail('请选择启用的分组');return {groupId:n.id,groupPath:nodePath(c,id),groupCatalogVersion:c.version,groupValues:structuredClone(n.values||{}),modelId:n.legacyModelId||'',processId:n.legacyProcessId||''};}
export function readGenericCatalog(storage,buId,legacy,capabilities){const raw=storage.getItem(catalogKey(buId));if(raw===null)return migrateCatalog(buId,legacy,capabilities);const c=JSON.parse(raw);if(c.buId!==buId)fail('目录BU不匹配');validateCatalog(c);
 const migrated=migrateCatalog(buId,legacy,capabilities),added=migrated.nodes.filter(n=>!c.nodes.some(old=>old.id===n.id));
 if(!added.length)return c;
 const levels=[...c.schema.levels];for(const l of migrated.schema.levels){if(added.some(n=>n.levelId===l.id)&&!levels.some(old=>old.id===l.id)){const before=l.id==='model'?levels.findIndex(old=>old.id==='process'):-1;if(before>=0)levels.splice(before,0,l);else levels.push(l);}}
 return validateCatalog({...c,schema:{...c.schema,levels},nodes:[...c.nodes,...added],attachments:[...c.attachments,...migrated.attachments.filter(a=>added.some(n=>n.id===a.nodeId))]});}
export function writeGenericCatalog(storage,context,c){if(!canPerform(context.state.actorRole,'model:configure',context))fail('没有本BU配置权限');if(c.buId!==context.buId)fail('不能修改其他BU目录');validateCatalog(c);const raw=storage.getItem(catalogKey(c.buId));if(raw!==null&&JSON.parse(raw).version!==c.version)fail('目录已被更新，请刷新后重试');const next={...c,version:(c.version||0)+1};storage.setItem(catalogKey(c.buId),JSON.stringify(next));return next;}
