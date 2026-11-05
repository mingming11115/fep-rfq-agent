import test from 'node:test';
import assert from 'node:assert/strict';
import {switchDatabaseAccount} from './databaseAccountSwitch.js';
test('quick switching authenticates the selected database account instead of changing local roles',async()=>{
 const calls=[];const login=async(...args)=>{calls.push(args);return {user:{id:'mysql-demo-technical'}};};
 const session=await switchDatabaseAccount('mysql_tech',login);
 assert.equal(session.user.id,'mysql-demo-technical');assert.equal(calls[0][0],'mysql_tech');
 await assert.rejects(switchDatabaseAccount('arbitrary-user',login),/不可切换/);
 await assert.rejects(switchDatabaseAccount('mysql_sr',async()=>{throw Error('密码已修改');}),/密码已修改/);
});
