import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateFepDemoCatalog} from './fepDemoCatalog.js';
import {readRfqCatalog,resolveRfqProcessBinding} from './rfqProcessBinding.js';

function storedDemo() {
  const records=new Map([
    ['rfq.reference.models.v1',JSON.stringify([
      {id:'MOD-A-R2',name:'机型 A',code:'FEP-A',revision:'R2',version:1,config:'CFG-A-R2 v1'},
      {id:'MOD-A-R1',name:'机型 A',code:'FEP-A',revision:'R1',version:1,config:'CFG-A-R1 v1',lifecycle:'停产'},
      {id:'MOD-B-R1',name:'机型 B',code:'FEP-B',revision:'R1',version:1},
    ])],
    ['rfq.reference.processes.v1',JSON.stringify([
      {id:'PROC-A-R2-P1',buId:'BU-DEMO',modelId:'MOD-A-R2',code:'P1',name:'基础加工工艺',conditions:'硅材料；测试方法 M1',enabled:true,version:1},
      {id:'PROC-A-R2-P2',buId:'BU-DEMO',modelId:'MOD-A-R2',code:'P2',name:'精密加工工艺',conditions:'模块 X；需样品验证',enabled:true,version:1},
    ])],
    ['rfq.reference.capabilities.v1',JSON.stringify([
      {id:'CAP-001',modelId:'MOD-A-R2',processId:'PROC-A-R2-P1',version:2,config:'CFG-A-R2 v1',conditions:'硅材料；工艺 P1',evidence:'T-01 v2，第 8 页',status:'已发布'},
    ])],
  ]);
  const storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
  const state={accountsById:{sr:{enabled:true}},businessUnits:[{id:'BU-DEMO'}],buPersonnelByBuId:{'BU-DEMO':[{userId:'sr',enabled:true,roles:['SR']}]}};
  return {records,storage,context:{state,actorId:'sr',buId:'BU-DEMO'}};
}

test('saved demo catalog offers three Hesper processes without breaking existing capability associations',()=>{
  const {storage,context}=storedDemo();
  migrateFepDemoCatalog(storage);
  const catalog=readRfqCatalog(storage,context);
  assert.deepEqual([...new Set(catalog.models.map(row=>row.name))],['Hesper E360R']);
  const processes=catalog.processes.filter(row=>row.modelId==='MOD-A-R2'&&row.enabled);
  assert.deepEqual(processes.map(row=>row.name),['Si','SiP','GeSi']);
  for(const process of processes){
    const binding=resolveRfqProcessBinding({...catalog,buId:'BU-DEMO',modelId:'MOD-A-R2',processId:process.id});
    assert.equal(binding.modelName,'Hesper E360R');
    assert.equal(binding.processName,process.name);
  }
  const [capability]=JSON.parse(storage.getItem('rfq.reference.capabilities.v1'));
  assert.equal(capability.processId,'PROC-A-R2-P1');
  assert.match(capability.conditions,/Si/);
  assert.equal(capability.evidence,'T-01 v2，第 8 页');
});

test('demo migration preserves custom records, other BUs and subsequent deletions',()=>{
  const {records,storage}=storedDemo();
  const custom={id:'CUSTOM',buId:'BU-DEMO',name:'自定义机型',revision:'R1',version:1};
  const edited={id:'MOD-A-R2',name:'手动改名',code:'CUSTOM',version:2,updatedById:'user'};
  const models=JSON.parse(storage.getItem('rfq.reference.models.v1'));
  storage.setItem('rfq.reference.models.v1',JSON.stringify([...models,custom,edited]));
  const foreign=JSON.stringify([{id:'MOD-A-R2',buId:'OTHER',name:'机型 A'}]);
  storage.setItem('rfq.reference.models.v1:OTHER',foreign);
  migrateFepDemoCatalog(storage);
  const updated=JSON.parse(storage.getItem('rfq.reference.models.v1'));
  assert.deepEqual(updated.find(row=>row.id==='CUSTOM'),custom);
  assert.deepEqual(updated.find(row=>row.version===2),edited);
  assert.equal(storage.getItem('rfq.reference.models.v1:OTHER'),foreign);
  storage.setItem('rfq.reference.processes.v1','[]');
  const once=new Map(records);
  migrateFepDemoCatalog(storage);
  assert.deepEqual(records,once);
});

test('explicitly empty catalogs remain empty',()=>{
  const {storage}=storedDemo();
  storage.setItem('rfq.reference.models.v1','[]');
  storage.setItem('rfq.reference.processes.v1','[]');
  migrateFepDemoCatalog(storage);
  assert.equal(storage.getItem('rfq.reference.models.v1'),'[]');
  assert.equal(storage.getItem('rfq.reference.processes.v1'),'[]');
});

test('a previously edited GeSi entry is preserved without duplicating its stable ID',()=>{
  const {storage}=storedDemo();
  const custom={id:'PROC-A-R2-GESI',buId:'BU-DEMO',modelId:'MOD-A-R2',code:'CUSTOM',name:'手动修订工艺',enabled:false,updatedById:'user'};
  storage.setItem('rfq.reference.processes.v1',JSON.stringify([...JSON.parse(storage.getItem('rfq.reference.processes.v1')),custom]));
  migrateFepDemoCatalog(storage);
  assert.deepEqual(JSON.parse(storage.getItem('rfq.reference.processes.v1')).filter(row=>row.id===custom.id),[custom]);
});

test('storage failure restores every catalog entry before allowing a retry',()=>{
  const {records,storage}=storedDemo(),before=new Map(records);
  let failed=false;
  const failing={...storage,setItem:(key,value)=>{
    if(key==='rfq.reference.processes.v1'&&!failed){failed=true;throw new Error('quota');}
    storage.setItem(key,value);
  }};
  assert.throws(()=>migrateFepDemoCatalog(failing),/quota/);
  for(const [key,value]of before)assert.equal(records.get(key),value);
  assert.equal(storage.getItem('rfq.demo.hesper-e360r.v1'),null);
  migrateFepDemoCatalog(storage);
  assert.equal(JSON.parse(storage.getItem('rfq.reference.models.v1'))[0].name,'Hesper E360R');
});
