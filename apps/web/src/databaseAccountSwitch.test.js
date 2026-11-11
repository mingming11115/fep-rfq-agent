import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {readSession,persistSession} from './authClient.js';
import {switchDatabaseAccount} from './databaseAccountSwitch.js';
test('quick switching authenticates the selected database account instead of changing local roles',async()=>{
 const calls=[];const login=async(...args)=>{calls.push(args);return {user:{id:'mysql-demo-technical'}};};
 const session=await switchDatabaseAccount('mysql_tech',login);
 assert.equal(session.user.id,'mysql-demo-technical');assert.equal(calls[0][0],'mysql_tech');
 await assert.rejects(switchDatabaseAccount('arbitrary-user',login),/不可切换/);
 await assert.rejects(switchDatabaseAccount('mysql_sr',async()=>{throw Error('密码已修改');}),/密码已修改/);
});

test('a failed target login preserves the currently authenticated session',async()=>{
 const previousFetch=globalThis.fetch,previousStorage=globalThis.localStorage;
 const window=new Window();
 globalThis.localStorage=window.localStorage;
 persistSession({token:'current-token',user:{id:'current-user'}});
 globalThis.fetch=async()=>new Response(JSON.stringify({code:401,msg:'账号或密码错误'}),{status:401});
 try{
  await assert.rejects(switchDatabaseAccount('mysql_tech'),/账号或密码错误/);
  assert.equal(readSession()?.token,'current-token');
 }finally{
  globalThis.fetch=previousFetch;
  globalThis.localStorage=previousStorage;
  await window.happyDOM.cancelAsync();
 }
});
