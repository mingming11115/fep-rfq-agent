import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {login,readSession,persistSession} from './authClient.js';
import {QUICK_ACCOUNTS,switchDatabaseAccount} from './quickAccountSwitch.js';

test('one-click options authenticate actual database accounts instead of changing local actor ids',async()=>{
 assert.deepEqual(QUICK_ACCOUNTS.map(account=>account.username),['mysql_sr','mysql_tech','mysql_appr','mysql_bu','admin']);
 const calls=[];const session={token:'new-token',user:{id:'real-tech',systemAdmin:false}};
 assert.equal(await switchDatabaseAccount('mysql_tech',{authenticate:async(...args)=>{calls.push(args);return session;},navigate:()=>{}}),session);
 assert.deepEqual(calls,[['mysql_tech','Rfq@2026']]);
});
test('unknown accounts are not attempted and failed authentication does not navigate',async()=>{
 let calls=0;const options={authenticate:async()=>{calls++;throw new Error('账号验证失败');},navigate:()=>assert.fail('must retain current view')};
 await assert.rejects(switchDatabaseAccount('another-user',options),/快捷切换/);assert.equal(calls,0);
 await assert.rejects(switchDatabaseAccount('admin',options),/账号验证失败/);
});
test('a failed target login preserves the currently authenticated session',async()=>{
 const previousFetch=globalThis.fetch,previousStorage=globalThis.localStorage;
 const window=new Window();globalThis.localStorage=window.localStorage;
 persistSession({token:'current-token',user:{id:'current-user'}});
 globalThis.fetch=async()=>new Response(JSON.stringify({code:401,msg:'账号或密码错误'}),{status:401});
 try{await assert.rejects(login('mysql_tech','changed-password'),/账号或密码错误/);assert.equal(readSession()?.token,'current-token');}
 finally{globalThis.fetch=previousFetch;globalThis.localStorage=previousStorage;await window.happyDOM.cancelAsync();}
});
