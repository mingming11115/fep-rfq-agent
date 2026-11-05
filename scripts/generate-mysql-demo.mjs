import {writeFileSync} from 'node:fs';
import {createDemoState} from '../apps/web/src/data.js';
import {upgradePrototypeState} from '../apps/web/src/stateMigration.js';
import {tidyDemoState} from '../apps/web/src/demoCleanup.js';
import {addReviewScenarioDemos} from '../apps/web/src/demoReviewScenarios.js';
import {getProjectSummary} from '../apps/web/src/projectSelectors.js';
import {MODELS,PROCESSES,CAPABILITIES} from '../apps/web/src/modelProcessSeeds.js';
import {KNOWLEDGE,EVIDENCE} from '../apps/web/src/referenceSeeds.js';
import {migrateCatalog} from '../apps/web/src/genericCatalog.js';
import {buildHistoryDocuments} from '../apps/web/src/historyKnowledge.js';
import {snapshotFingerprint} from '../apps/web/src/snapshotDomain.js';

const seed=createDemoState();
const state=addReviewScenarioDemos(tidyDemoState(upgradePrototypeState(seed,seed)),{at:'2026-11-05T00:00:00.000Z'});
const stages={'待上传':'DRAFT','解析中':'PARSING','评审中':'REVIEWING','审批完成':'APPROVED','已导出':'EXPORTED'};
const projects=state.projects.map((project,index)=>({
 id:`MYSQL-DEMO-${String(index+1).padStart(3,'0')}`,name:project.name.replace('【Mock】','【数据库模拟】'),
 customer:project.customer,stage:stages[getProjectSummary(state,project.id,'demo-sales').stage],deadline:'2026-12-15',
 requirements:(state.requirementsByProject[project.id]||[]).map((row,i)=>({clause:row.clause||String(i+1),title:row.title,
  original:row.original||row.sourceOriginal,sectionPath:row.sectionPath||['模拟客户要求'],conditions:row.conditions||'',
  extractionStatus:row.needsReview?'NEEDS_REVIEW':'VALID'})),
}));
const destination=new URL('../apps/api/src/main/resources/demo/mysql-demo.json',import.meta.url);
const aliases={'BU-DEMO':'BU-MYSQL-DEMO','demo-system-admin':'admin'};
for(const id of Object.keys(state.accountsById))if(id!=='demo-system-admin')aliases[id]=id.replace(/^demo-/,'mysql-demo-');
state.projects.forEach((project,index)=>{
 const id=projects[index].id;aliases[project.id]=id;
 (state.requirementsByProject[project.id]||[]).forEach((row,i)=>aliases[row.id]=`${id}-REQ-${i+1}`);
 (state.documentsByProject[project.id]||[]).forEach(row=>aliases[row.id]=`${id}-DOC`);
});
const replacements=Object.entries(aliases).sort((a,b)=>b[0].length-a[0].length);
function remap(value){
 if(Array.isArray(value))return value.map(remap);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[aliases[key]||key,remap(v)]));
 if(typeof value!=='string')return value;
 // Fingerprints contain serialized approval scopes, including IDs used as object keys.
 if(value.startsWith('{')||value.startsWith('[')){try{return JSON.stringify(remap(JSON.parse(value)));}catch{}}
 if(aliases[value])return aliases[value];
 for(const [before,after]of replacements)value=value.replaceAll(before,after);
 return value.replaceAll('【Mock】','【数据库模拟】');
}
const supplement={id:'mysql-business-demo-v2',projects:[],responses:[],reviews:[],snapshots:[],resources:{}};
for(const [index,project]of state.projects.entries()){
 const projectId=projects[index].id;
 const {id,name,customer,stage,version,createdAt,deadline,owner,ownerId,createdById,...metadata}=remap(project);
 supplement.projects.push({id:projectId,payload:metadata});
 for(const [i,row]of (state.requirementsByProject[project.id]||[]).entries()){
  const payload=remap(row);payload.sourceFileId=`${projectId}-DOC`;payload.sourceVersion='V1.0';payload.sourceAnchor=`paragraph:${i+1}`;
  supplement.responses.push({id:`${projectId}-REQ-${i+1}`,projectId,payload});
 }
 for(const [kind,key]of [['reviews','reviewsByProject'],['snapshots','snapshotsByProject']])
  for(const row of state[key][project.id]||[])supplement[kind].push({id:remap(row.id),projectId,payload:remap(row)});
}
for(const [kind,rows]of Object.entries({models:MODELS,processes:PROCESSES,capabilities:CAPABILITIES,knowledge:KNOWLEDGE,evidence:EVIDENCE}))
 supplement.resources[kind]=rows.map(row=>({...remap(row),buId:'BU-MYSQL-DEMO',...(row.scope==='仅当前项目'?{projectId:projects[0].id}:{})}));
supplement.resources.catalog=migrateCatalog('BU-MYSQL-DEMO',supplement.resources,supplement.resources.capabilities);
const histories=supplement.resources.knowledge.filter(row=>row.type==='history');
supplement.resources.historyDocuments=buildHistoryDocuments([],histories).map((row,i)=>({...row,id:`MYSQL-HISTORY-${i+1}`,legacy:false,legacyImported:true,manual:true,parseStatus:'manual',version:'V1.0'}));
supplement.resources.historyClauses=histories.map(row=>({...row,documentId:supplement.resources.historyDocuments.find(doc=>doc.legacyIds.includes(row.id)).id}));
for(const row of supplement.snapshots){
 row.migrationSourcePayload=structuredClone(row.payload);
 row.payload.rows=row.payload.rows.map(previous=>supplement.responses.find(response=>response.id===previous.id)?.payload||previous);
 row.payload.approvalScope={...row.payload.approvalScope,format:'mysql-business-v1',rows:structuredClone(row.payload.rows),sourceVersions:[`${row.projectId}-DOC:V1.0`]};
 row.payload.approvalFingerprint=snapshotFingerprint(row.payload.approvalScope);
}
writeFileSync(destination,JSON.stringify({id:'mysql-business-demo-v1',projects,supplement},null,2)+'\n');
console.log(`Generated ${projects.length} projects and ${projects.reduce((n,p)=>n+p.requirements.length,0)} requirements.`);
