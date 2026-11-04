import test from 'node:test';
import assert from 'node:assert/strict';
import * as history from './historyKnowledge.js';

const actor={id:'sr',role:'SR',canEdit:true,canApprove:false};
const doc={id:'D1',buId:'A',name:'历史RFQ.docx',version:'V1',scope:'FEP 授权项目',metadata:{customer:'人工客户'}};
const result={metadata:{customer:'识别客户',model:'机型A'},clauses:[{key:'main:body/1/r1',clauseNo:'3.2',section:'技术',requirement:'支持上料',answer:'需选配 S',conditions:'硅材料',issues:[]}],sources:[],issues:[]};
test('reparse preserves manually edited fields, submitted versions and stable identity',()=>{
 const first=history.mergeHistoryParse(doc,[],result,actor);
 assert.equal(first.document.metadata.customer,'人工客户');
 assert.equal(first.clauses[0].answer,'需选配 S');
 const edited={...first.clauses[0],answer:'人工核定答复',editedFields:['answer']};
 const next=history.mergeHistoryParse(first.document,[edited],{...result,clauses:[{...result.clauses[0],answer:'机器重试答复'}]},actor);
 assert.equal(next.clauses.length,1);assert.equal(next.clauses[0].id,edited.id);assert.equal(next.clauses[0].answer,'人工核定答复');
 const published={...edited,status:'已发布'};
 assert.equal(history.mergeHistoryParse(doc,[published],result,actor).clauses[0].status,'已发布');
 const removed=history.mergeHistoryParse(doc,[edited],{...result,clauses:[]},actor);
 assert.equal(removed.clauses.length,1);assert.ok(removed.clauses[0].sourceMissing);
});
test('missing answers block the entire submit batch; independent approval is required',()=>{
 const base={id:'K1',documentId:'D1',version:1,status:'草稿',requirement:'要求',answer:'答复',submitterId:'sr'};
 assert.throws(()=>history.transitionHistoryClauses([base,{...base,id:'K2',answer:''}],['K1','K2'],'submit',actor),/答复/);
 assert.equal(base.status,'草稿');
 const submitted=history.transitionHistoryClauses([base],['K1'],'submit',actor);
 assert.equal(submitted[0].status,'待审核');
 assert.throws(()=>history.transitionHistoryClauses(submitted,['K1'],'approve',{...actor,canApprove:true}),/自审/);
 assert.throws(()=>history.transitionHistoryClauses(submitted,['K1'],'approve',{...actor,id:'tech'}),/权限/);
 assert.equal(history.transitionHistoryClauses(submitted,['K1'],'approve',{...actor,id:'bu',canApprove:true})[0].status,'已发布');
});
test('document scope is authoritative for every linked clause and queries find answer text',()=>{
 const clauses=[{id:'K',documentId:'D1',type:'history',requirement:'上料',answer:'增强夹持模块',scope:'FEP 授权项目'}];
 assert.equal(history.filterHistoryDocuments([doc],clauses,'增强夹持')[0].id,'D1');
 const scoped=history.applyHistoryMetadata({...doc,scope:'仅当前项目',projectId:'P1'},clauses);
 assert.equal(scoped[0].scope,'仅当前项目');assert.equal(scoped[0].sourceProjectId,'P1');
});
test('legacy history knowledge can be browsed without inventing an original file',()=>{
 const legacy=[{id:'K-old',type:'history',version:1,requirement:'原要求',answer:'原答复',source:'RFQ-018',scope:'FEP 授权项目'}];
 const docs=history.buildHistoryDocuments([],legacy);
 assert.equal(docs.length,1);assert.equal(docs[0].legacy,true);
 assert.equal(history.clausesForDocument(docs[0],legacy)[0].answer,'原答复');
});
test('materializing a legacy document retains project restrictions and all its clauses',()=>{
 const legacy=[{id:'K-old',type:'history',version:1,status:'草稿',requirement:'原要求',answer:'原答复',source:'RFQ-P1 定稿条款',scope:'仅当前项目',sourceProjectId:'P1'}];
 const virtual=history.buildHistoryDocuments([],legacy)[0];
 const migrated=history.materializeHistoryDocument(virtual,[],legacy);
 assert.equal(migrated.document.scope,'仅当前项目');assert.equal(migrated.document.projectId,'P1');
 assert.equal(migrated.clauses[0].source,'RFQ-P1 定稿条款');
 assert.equal(migrated.clauses[0].documentId,migrated.document.id);
 assert.equal(history.buildHistoryDocuments(migrated.documents,migrated.clauses).length,1);
 assert.equal(history.applyHistoryMetadata(migrated.document,migrated.clauses)[0].source,'RFQ-P1 定稿条款');
});
test('manual supplement survives a reparse and source file version is extracted independently of knowledge version',()=>{
 const manual={id:'M',type:'history',documentId:'D1',version:1,manual:true,sourceKey:'manual:M',requirement:'人工补录',answer:'原答复'};
 const merged=history.mergeHistoryParse(doc,[manual],{...result,metadata:{fileVersion:'V2.1'}},actor);
 assert.equal(merged.document.version,'V2.1');assert.equal(merged.clauses.find(row=>row.id==='M').sourceMissing,undefined);
});
