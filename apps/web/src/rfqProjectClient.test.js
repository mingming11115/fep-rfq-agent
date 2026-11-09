import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackendProject,ensureBackendProject} from './rfqProjectClient.js';
const user={roles:[{buId:'BU-FEP',role:'SR'}]};
const project={id:'RFQ-004',name:'真实上传项目',customer:'测试客户',ownerId:'demo-sales',buId:'BU-DEMO',deadline:'2026-12-01'};
test('new RFQ is persisted with the selected owner and authenticated BU',async()=>{
 let request;
 const saved=await createBackendProject(project,{post:async(path,body)=>{request={path,body};return {id:'RFQ-backend',...body};}},user);
 assert.equal(saved.id,'RFQ-backend');assert.equal(request.path,'/projects');assert.equal(request.body.buId,'BU-FEP');assert.equal(request.body.ownerId,project.ownerId);assert.equal(request.body.code,project.id);
 await assert.rejects(()=>createBackendProject(project,{post:()=>assert.fail('must not create')},{roles:[...user.roles,{buId:'OTHER',role:'SR'}]}),/BU/);
});
test('RFQ creation sends the selected group to the server',async()=>{
 const saved=await createBackendProject({...project,buId:'BU-FEP',groupId:'process-1'},
  {post:async(_path,body)=>body},user);
 assert.equal(saved.groupId,'process-1');
});
test('legacy local project is created once and reused by code after a missing record',async()=>{
 let creates=0,stored=null;
 const api={get:async path=>{if(path.startsWith('/projects?'))return {list:stored?[stored]:[]};throw Object.assign(new Error('项目不存在'),{status:404});},post:async(path,body)=>{creates++;return stored={id:'BACKEND',...body};}};
 assert.equal((await ensureBackendProject(project,api,user)).id,'BACKEND');
 assert.equal((await ensureBackendProject(project,api,user)).id,'BACKEND');assert.equal(creates,1);
});
test('permission and connection errors never trigger a replacement project',async()=>{
 for(const status of [403,500])await assert.rejects(()=>ensureBackendProject(project,{get:async()=>{throw Object.assign(new Error('denied'),{status});},post:()=>assert.fail('must not create')},user),/denied/);
});
