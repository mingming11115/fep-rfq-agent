import test from 'node:test';
import assert from 'node:assert/strict';
import {compareHistoryVersions,versionFamily} from './historyVersions.js';
const row=(id,no,requirement,answer='满足',extra={})=>({id,version:1,clauseNo:no,requirement,answer,...extra});
test('legacy documents each form their own family',()=>assert.equal(versionFamily({id:'old'}),'old'));
test('matches renumbered requirements and flags changed numeric requirements',()=>{
 const result=compareHistoryVersions([row('a','1','温度150℃'),row('b','2','上料')],[row('c','1','温度180℃'),row('d','3','上料')]);
 assert.deepEqual(result.map(r=>r.kind).sort(),['位置调整','要求变更']);
 assert.equal(result.find(r=>r.kind==='要求变更').needsReview,true);
});
test('ambiguous duplicate numbers never silently match',()=>{
 const result=compareHistoryVersions([row('a','1','甲'),row('b','1','乙')],[row('c','1','丙')]);
 assert.equal(result.length,3);assert.ok(result.every(r=>r.uncertain));
});
test('compares latest internal revision and conditions without mutating history',()=>{
 const old=[row('a','1','要求','旧'),row('a','1','要求','新',{version:2})];
 assert.equal(compareHistoryVersions(old,[row('b','1','要求','新')])[0].kind,'未变化');
 assert.equal(compareHistoryVersions(old,[row('b','1','要求','新',{conditions:'附加条件'})])[0].kind,'答复变更');
 assert.equal(old.length,2);
});
