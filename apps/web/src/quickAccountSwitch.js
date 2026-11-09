import {login} from './authClient.js';
import {DEMO_ACCOUNTS,DEMO_PASSWORD} from './demoAccounts.js';

// Local development shortcuts still authenticate through the normal database login.
export const QUICK_ACCOUNTS=DEMO_ACCOUNTS.map(account=>({...account,label:`${account.name} · ${account.role}`}));
export async function switchDatabaseAccount(username,{authenticate=login,navigate=hash=>history.replaceState(null,'',hash)}={}){
 if(!QUICK_ACCOUNTS.some(account=>account.username===username)) { throw new Error('此账号未配置快捷切换'); }
 const session=await authenticate(username,DEMO_PASSWORD);
 navigate(session.user.systemAdmin?'#/admin':'#/dashboard');
 return session;
}
