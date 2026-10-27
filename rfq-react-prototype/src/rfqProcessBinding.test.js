import test from 'node:test';
import assert from 'node:assert/strict';
import * as binding from './rfqProcessBinding.js';

const models=[{id:'M',buId:'A',version:1,name:'机型',code:'CODE',revision:'R2',config:'CFG-v1'},{id:'M',buId:'A',version:2,name:'机型',code:'CODE',revision:'R2',config:'CFG-v2'},{id:'OTHER',buId:'B',version:1}];
const processes=[{id:'P',modelId:'M',buId:'A',version:3,code:'P1',name:'基础工艺',enabled:true},{id:'OFF',modelId:'M',buId:'A',enabled:false},{id:'FOREIGN',modelId:'M',buId:'B',enabled:true},{id:'WRONG',modelId:'OTHER',buId:'A',enabled:true}];
const input={models,processes,modelId:'M',processId:'P',buId:'A'};

test('RFQ association records stable IDs and the latest model and process configuration snapshot',()=>{
 const result=binding.resolveRfqProcessBinding(input);
 assert.deepEqual(result,{modelId:'M',modelName:'机型',modelCode:'CODE',modelRevision:'R2',modelMetadataVersion:2,modelConfig:'CFG-v2',processId:'P',processName:'基础工艺',processCode:'P1',processVersion:3});
});
test('RFQ association rejects missing disabled foreign and wrong-model processes',()=>{
 for(const patch of [{modelId:''},{processId:''},{processId:'missing'},{processId:'OFF'},{processId:'FOREIGN'},{processId:'WRONG'},{buId:'B'}]){
  assert.throws(()=>binding.resolveRfqProcessBinding({...input,...patch}),/机型|工艺|BU/);
 }
});
test('catalog reads preserve explicit empty BU data and isolate other BU entries',()=>{
 const state={accountsById:{sr:{enabled:true}},businessUnits:[{id:'A'},{id:'B'}],buPersonnelByBuId:{A:[{userId:'sr',enabled:true,roles:['SR']}]}};
 const context={state,actorId:'sr',buId:'A'};
 const records=new Map([['rfq.reference.models.v1:A',JSON.stringify(models)],['rfq.reference.processes.v1:A',JSON.stringify(processes)]]);
 const storage={getItem:key=>records.get(key)||null};
 const catalog=binding.readRfqCatalog(storage,context);
 assert.equal(catalog.models.length,2);assert.equal(catalog.processes.length,3);
 assert.deepEqual(binding.readRfqCatalog(storage,{...context,buId:'B'}),{models:[],processes:[]});
 records.set('rfq.reference.models.v1:A','[]');
 assert.deepEqual(binding.readRfqCatalog(storage,context).models,[]);
});

test('inline catalog creation persists the new entry and preserves unrelated BU records',()=>{
 const state={actorRole:'SR',accountsById:{sr:{enabled:true}},businessUnits:[{id:'A'}],buPersonnelByBuId:{A:[{userId:'sr',enabled:true,roles:['SR']}]}};
 const context={state,actorId:'sr',buId:'A'};
 const records=new Map([['rfq.reference.models.v1:A',JSON.stringify(models)],['rfq.reference.processes.v1:A',JSON.stringify(processes)]]);
 const storage={getItem:key=>records.get(key)||null,setItem:(key,value)=>records.set(key,value)};
 const next=binding.saveRfqCatalogRecord(storage,context,'model',{id:'NEW',buId:'A',name:'新增机型',code:'NEW',revision:'R1',config:'CFG-NEW'});
 assert.equal(next.models.find(m=>m.id==='NEW').name,'新增机型');
 assert.equal(JSON.parse(records.get('rfq.reference.models.v1:A')).find(m=>m.id==='OTHER').buId,'B');
 binding.saveRfqCatalogRecord(storage,context,'process',{id:'NEW-P',buId:'A',modelId:'NEW',name:'新增工艺',code:'P1',enabled:true});
 assert.equal(JSON.parse(records.get('rfq.reference.processes.v1:A')).find(p=>p.id==='NEW-P').modelId,'NEW');
 assert.throws(()=>binding.saveRfqCatalogRecord(storage,context,'model',{...next.models.find(m=>m.id==='NEW'),name:'覆盖'}),/权限/);
});
