import {writeFileSync} from 'node:fs';
import {createDemoState} from '../apps/web/src/data.js';
import {upgradePrototypeState} from '../apps/web/src/stateMigration.js';
import {tidyDemoState} from '../apps/web/src/demoCleanup.js';
import {addReviewScenarioDemos} from '../apps/web/src/demoReviewScenarios.js';
import {getProjectSummary} from '../apps/web/src/projectSelectors.js';

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
writeFileSync(destination,JSON.stringify({id:'mysql-business-demo-v1',projects},null,2)+'\n');
console.log(`Generated ${projects.length} projects and ${projects.reduce((n,p)=>n+p.requirements.length,0)} requirements.`);
