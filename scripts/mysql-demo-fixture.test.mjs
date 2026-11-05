import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../apps/api/src/main/resources/demo/mysql-demo.json',import.meta.url)));
test('database fixture retains the complete original response and review scenarios',()=>{
 assert.ok(data.supplement,'full business records must be exported, not just extracted requirements');
 assert.equal(data.supplement.responses.length,33);
 assert.equal(data.supplement.reviews.length,7);
 assert.equal(data.supplement.snapshots.length,3);
 const ids=new Set(data.projects.flatMap(p=>p.requirements.map((r,i)=>`${p.id}-REQ-${i+1}`)));
 for(const row of data.supplement.responses){assert.ok(ids.has(row.id));assert.ok(row.payload.draft);}
 for(const row of data.supplement.reviews)assert.ok(ids.has(row.payload.requirementId));
 assert.equal(data.supplement.resources.models.length,2);
 assert.equal(data.supplement.resources.processes.length,4);
 assert.equal(data.supplement.resources.capabilities.length,5);
 assert.equal(data.supplement.resources.knowledge.length,4);
 assert.ok(data.supplement.resources.evidence.length>=3);
 assert.ok(data.supplement.resources.historyClauses.length>0);
 assert.ok(!JSON.stringify(data.supplement).includes('"BU-DEMO"'));
 assert.ok(!JSON.stringify(data.supplement).includes('"demo-technical-2"'));
});
