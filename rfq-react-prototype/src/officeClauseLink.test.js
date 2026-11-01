import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeClauseLink, officeClauseTargets, officeRouteSource } from './officeClauseLink.js';

const source={projectId:'P',fileId:'F',sourceVersion:'V1'};
const row=(id,quote,extra={})=>({id,projectId:'P',sourceFileId:'F',sourceVersion:'V1',sourceOriginal:quote,no:id,...extra});
test('native clause targets never cross source file, version or project',()=>{
  const targets=officeClauseTargets(source,[row('A','甲'),row('B','乙',{sourceFileId:'other'}),row('C','丙',{sourceVersion:'V2'}),row('D','丁',{projectId:'other'})]);
  assert.deepEqual(targets.map(t=>t.id),['A']);
  assert.equal(targets[0].quote,'甲');
});
test('route navigation resolves the actual source and honors explicit historical versions',()=>{
  const state={activeProjectId:'P',requirementsByProject:{P:[row('A','甲')]}};
  assert.deepEqual(officeRouteSource(state,{page:'response',projectId:'P',requirementId:'A'}),source);
  assert.deepEqual(officeRouteSource(state,{page:'response',projectId:'P',requirementId:'A',sourceVersion:'V0'}),{...source,sourceVersion:'V0'});
  assert.equal(officeRouteSource(state,{page:'projects',projectId:'P',requirementId:'A'}),undefined);
  assert.equal(officeRouteSource(state,{page:'response',projectId:'other',requirementId:'A'}),undefined);
});
test('bridge queues the latest card until plugin readiness and rejects stale results',()=>{
  const sent=[],statuses=[]; const plugin={postMessage:(data,origin)=>sent.push({data,origin})};
  const link=createOfficeClauseLink({origin:'http://localhost:5173',channel:'random',source,onStatus:value=>statuses.push(value)});
  link.update([row('A','甲'),row('B','乙')],'A');link.update([row('A','甲'),row('B','乙')],'B');
  assert.equal(sent.length,0);
  link.receive({origin:'http://localhost:5173',source:plugin,data:{type:'rfq:ready',channel:'random'}});
  assert.equal(sent.at(-1).data.targetId,'B');assert.equal(sent.at(-1).origin,'http://localhost:5173');
  const old=sent.at(-1).data.requestId;link.update([row('A','甲'),row('B','乙')],'A');
  link.receive({origin:'http://localhost:5173',source:plugin,data:{type:'rfq:located',channel:'random',requestId:old,status:'matched'}});
  assert.notEqual(statuses.at(-1)?.status,'matched');
  link.receive({origin:'http://localhost:5173',source:plugin,data:{type:'rfq:located',channel:'random',requestId:sent.at(-1).data.requestId,status:'matched'}});
  assert.equal(statuses.at(-1).status,'matched');
});
test('reverse selection validates channel, window, origin and allowed clause before invoking the app',()=>{
  const selected=[],sent=[];const plugin={postMessage:data=>sent.push(data)},other={postMessage:()=>{}};
  const link=createOfficeClauseLink({origin:'http://localhost:5173',channel:'random',source,onSelect:anchor=>selected.push(anchor)});
  link.update([row('A','甲'),row('B','乙')],'B');
  const message=(data,extra={})=>({origin:'http://localhost:5173',source:plugin,data:{channel:'random',...data},...extra});
  link.receive(message({type:'rfq:ready'}));
  for(const event of [message({type:'rfq:selected',id:'A'},{origin:'http://evil.test'}),message({type:'rfq:selected',id:'A',channel:'wrong'}),message({type:'rfq:selected',id:'A'},{source:other}),message({type:'rfq:selected',id:'foreign'})])link.receive(event);
  assert.equal(selected.length,0);
  link.receive(message({type:'rfq:selected',id:'A',requestId:sent.at(-1).requestId}));
  assert.equal(selected[0].requirementId,'A');assert.equal(selected[0].fileId,'F');
  link.destroy();link.receive(message({type:'rfq:selected',id:'A'}));assert.equal(selected.length,1);
});
test('unrelated response form renders do not reselect the native document',()=>{
  const sent=[],plugin={postMessage:data=>sent.push(data)};
  const link=createOfficeClauseLink({origin:'local',channel:'random',source});
  link.update([row('A','甲')],'A');link.receive({origin:'local',source:plugin,data:{type:'rfq:ready',channel:'random'}});
  link.update([row('A','甲',{draft:'changed response'})],'A');assert.equal(sent.length,1);
});
test('late cursor events from an older card cannot navigate the response',()=>{
  const selected=[],sent=[],plugin={postMessage:data=>sent.push(data)};
  const link=createOfficeClauseLink({origin:'local',channel:'random',source,onSelect:anchor=>selected.push(anchor)});
  const rows=[row('A','甲'),row('B','乙')];link.update(rows,'A');link.receive({origin:'local',source:plugin,data:{type:'rfq:ready',channel:'random'}});
  const stale=sent.at(-1).requestId;link.update(rows,'B');
  link.receive({origin:'local',source:plugin,data:{type:'rfq:selected',channel:'random',id:'A',requestId:stale}});assert.equal(selected.length,0);
});
test('a blocked response form navigation restores the current native clause selection',()=>{
  const sent=[],plugin={postMessage:data=>sent.push(data)};
  const link=createOfficeClauseLink({origin:'local',channel:'random',source,onSelect:()=>false});
  link.update([row('A','甲'),row('B','乙')],'A');link.receive({origin:'local',source:plugin,data:{type:'rfq:ready',channel:'random'}});
  link.receive({origin:'local',source:plugin,data:{type:'rfq:selected',channel:'random',id:'B',requestId:sent.at(-1).requestId}});
  assert.equal(sent.length,2);assert.equal(sent.at(-1).targetId,'A');
});
