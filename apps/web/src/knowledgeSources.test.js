import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKnowledgeSourceOptions,prepareKnowledgeSource,changeKnowledgeSourceType} from './knowledgeSources.js';
import {selectReadableResources} from './resourceVisibility.js';

function fixture() {
 const state={accountsById:{sr:{id:'sr',enabled:true},tech:{id:'tech',name:'顾工',enabled:true},disabled:{id:'disabled',name:'停用人员',enabled:false},other:{id:'other',name:'其他BU人员',enabled:true}},businessUnits:[{id:'A'},{id:'B'}],
  buPersonnelByBuId:{A:[{userId:'sr',roles:['SR'],enabled:true},{userId:'tech',roles:['技术'],enabled:true},{userId:'disabled',roles:['技术'],enabled:true}],B:[{userId:'other',roles:['技术'],enabled:true}]},
  projects:[{id:'P',buId:'A',name:'授权项目',participantIds:['sr']},{id:'PRIVATE',buId:'A',name:'未授权项目',participantIds:['tech']},{id:'OTHER',buId:'B',name:'其他BU项目',participantIds:['other']}],
  documentsByProject:{P:[{id:'D',name:'历史客户要求.docx',version:'V2.0'},{id:'D',name:'历史客户要求.docx',version:'V1.0'}],PRIVATE:[{id:'SECRET',name:'保密要求.docx'}],OTHER:[{id:'OUT',name:'其他BU资料.pdf'}]}};
 const context={state,actorId:'sr',buId:'A'};
 const evidence=[{id:'T',name:'共享技术资料.pdf',version:3,buId:'A',status:'有效',scope:'FEP 授权项目'},{id:'PRIVATE',name:'项目私有资料.pdf',version:1,buId:'A',status:'有效',scope:'仅当前项目',projectId:'PRIVATE'}];
 return {context,evidence};
}

test('source dropdowns use accessible document versions and active technical people from the current BU',()=>{
 const {context,evidence}=fixture(),options=buildKnowledgeSourceOptions(context,evidence);
 assert.deepEqual(options.documents.map(row=>row.name),['历史客户要求.docx','历史客户要求.docx','共享技术资料.pdf']);
 assert.equal(new Set(options.documents.map(row=>row.value)).size,3);
 assert.match(options.documents[0].label,/V2\.0/);
 assert.deepEqual(options.people.map(row=>({id:row.id,name:row.name})),[{id:'tech',name:'顾工'}]);
 context.state.accountsById.sr.enabled=false;
 assert.deepEqual(buildKnowledgeSourceOptions(context,evidence),{documents:[],people:[]});
});

test('saved document and person sources retain stable identities and a readable description',()=>{
 const {context,evidence}=fixture(),options=buildKnowledgeSourceOptions(context,evidence);
 const doc=prepareKnowledgeSource({sourceType:'history-document',sourceDocumentKey:options.documents[0].value},options);
 assert.equal(doc.sourceProjectId,'P');assert.match(doc.source,/历史文档.*历史客户要求\.docx.*V2\.0/);
 const person=prepareKnowledgeSource({sourceType:'professional-confirmation',sourcePersonId:'tech'},options);
 assert.equal(person.sourcePersonId,'tech');assert.match(person.source,/专业人员确认.*顾工/);
 assert.equal(prepareKnowledgeSource({sourceType:'enterprise-standard',sourceStandardText:'标准应答规范 V3'},options).source,'企业标准口径：标准应答规范 V3');
 assert.throws(()=>prepareKnowledgeSource({sourceType:'history-document',sourceDocumentKey:'SECRET'},options),/历史文档/);
 assert.throws(()=>prepareKnowledgeSource({sourceType:'professional-confirmation',sourcePersonId:'other'},options),/人员/);
});

test('switching source category clears incompatible associations and preserves legacy free text until a category is chosen',()=>{
 assert.equal(prepareKnowledgeSource({source:'旧版来源文字'},{documents:[],people:[]}).source,'旧版来源文字');
 const changed=changeKnowledgeSourceType({sourceType:'history-document',source:'旧来源',sourceDocumentKey:'D',sourceProjectId:'P',sourcePersonId:'tech',sourceStandardText:'旧标准'},'enterprise-standard');
 assert.equal(changed.source,'');assert.equal(changed.sourceDocumentKey,'');assert.equal(changed.sourcePersonId,'');assert.equal(changed.sourceStandardText,'');assert.equal(changed.sourceProjectId,undefined);
 assert.throws(()=>changeKnowledgeSourceType({},'invented-source'),/来源/);
 const {context}=fixture();
 assert.deepEqual(selectReadableResources([{id:'K',buId:'A',status:'草稿',scope:'FEP 授权项目',sourceProjectId:'PRIVATE',source:'历史文档：文件名'}],context),[]);
});
