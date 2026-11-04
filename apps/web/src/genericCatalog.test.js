import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateCatalog, validateCatalog, saveNode, nodePath, resolveGroupBinding } from './genericCatalog.js';
const schema={title:'分组与能力配置',levels:[{id:'group',name:'Group',fields:[{id:'size',name:'尺寸',type:'number',required:true}]}]};
test('BU migration preserves stable ids and capability links',()=>{const c=migrateCatalog('A',{models:[{id:'M',buId:'A',name:'设备',version:1},{id:'X',buId:'B'}],processes:[{id:'P',buId:'A',modelId:'M',name:'工艺'}]},[{id:'C',buId:'A',modelId:'M',processId:'P',version:2}]);assert.equal(c.nodes.length,2);assert.equal(c.nodes[1].parentId,'M');assert.equal(c.attachments[0].nodeId,'P');assert.equal(nodePath(c,'P'),'设备 / 工艺');});
test('custom required numeric zero accepted, invalid values rejected',()=>{const c={buId:'A',schema,nodes:[],attachments:[]};const n=saveNode(c,{id:'G',levelId:'group',name:'研发',values:{size:0}});assert.equal(n.nodes[0].values.size,0);assert.throws(()=>saveNode(c,{id:'H',levelId:'group',name:'缺失',values:{}}));assert.throws(()=>saveNode(c,{id:'H',levelId:'group',name:'错误',values:{size:'abc'}}));});
test('schema protects used levels and validates unique ids',()=>{const c={buId:'A',schema,nodes:[{id:'G',levelId:'group',name:'研发',values:{size:1}}],attachments:[]};assert.throws(()=>validateCatalog({...c,schema:{...schema,levels:[]}}));assert.throws(()=>validateCatalog({...c,schema:{...schema,levels:[schema.levels[0],schema.levels[0]]}}));});
test('RFQ binding records full path, rejects disabled ancestors and foreign BU',()=>{const c=migrateCatalog('A',{models:[{id:'M',buId:'A',name:'设备'}],processes:[{id:'P',buId:'A',modelId:'M',name:'工艺'}]});assert.equal(resolveGroupBinding(c,'P','A').groupPath,'设备 / 工艺');assert.throws(()=>resolveGroupBinding(c,'P','B'));c.nodes[0].enabled=false;assert.throws(()=>resolveGroupBinding(c,'P','A'));});

test('invalid calendar dates and invalid selection types are rejected',()=>{
 const c={buId:'A',schema:{title:'Group',levels:[{id:'g',name:'Group',fields:[{id:'date',name:'日期',type:'date'},{id:'tags',name:'标签',type:'multiselect',options:['A']}]}]},nodes:[],attachments:[]};
 assert.throws(()=>saveNode(c,{id:'n',levelId:'g',name:'n',values:{date:'2026-02-30'}}));
 assert.throws(()=>saveNode(c,{id:'n',levelId:'g',name:'n',values:{tags:'A'}}));
 assert.equal(saveNode(c,{id:'n',levelId:'g',name:'n',values:{date:'2026-02-28',tags:['A']}}).nodes.length,1);
});
test('catalog writes require BU administrator and remain BU isolated',async()=>{
 const {writeGenericCatalog,readGenericCatalog}=await import('./genericCatalog.js');const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const c={buId:'A',schema,nodes:[],attachments:[]};const context={actorId:'admin',buId:'A',state:{actorRole:'BU管理员',accountsById:{admin:{id:'admin',enabled:true,managedBuIds:['A']}},businessUnits:[{id:'A'},{id:'B'}],buPersonnelByBuId:{A:[]}}};
 writeGenericCatalog(storage,context,c);assert.equal(readGenericCatalog(storage,'A').schema.title,schema.title);assert.equal(readGenericCatalog(storage,'B').nodes.length,0);
 assert.throws(()=>writeGenericCatalog(storage,{...context,buId:'B'},c));assert.throws(()=>writeGenericCatalog(storage,{...context,actorId:'other'},c));
});

test('stale catalog writes cannot overwrite another saved configuration',async()=>{
 const {writeGenericCatalog}=await import('./genericCatalog.js');const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const c={buId:'A',version:1,schema,nodes:[],attachments:[]};const context={actorId:'admin',buId:'A',state:{actorRole:'BU管理员',accountsById:{admin:{id:'admin',enabled:true,managedBuIds:['A']}},businessUnits:[{id:'A'}],buPersonnelByBuId:{A:[]}}};
 writeGenericCatalog(storage,context,c);assert.throws(()=>writeGenericCatalog(storage,context,c));
});

test('later legacy additions merge without replacing custom names or removed attachments',async()=>{
 const {readGenericCatalog,catalogKey}=await import('./genericCatalog.js');const c=migrateCatalog('A',{models:[{id:'M',buId:'A',name:'设备'}]});c.schema.levels[0].name='Group';c.nodes[0].name='自定义名称';const storage={getItem:()=>JSON.stringify(c)};
 const next=readGenericCatalog(storage,'A',{models:[{id:'M',buId:'A',name:'旧名'},{id:'N',buId:'A',name:'新增'}],processes:[{id:'P',buId:'A',modelId:'N',name:'新工艺'}]});
 assert.equal(next.nodes.length,3);assert.equal(next.nodes[0].name,'自定义名称');assert.equal(next.schema.levels[0].name,'Group');assert.equal(nodePath(next,'P'),'新增 / 新工艺');
});
