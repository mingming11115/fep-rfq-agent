import {login} from './authClient.js';
import {DEMO_ACCOUNTS,DEMO_PASSWORD} from './demoAccounts.js';

// Local development shortcuts still use the ordinary password/JWT login endpoint.
// The caller exposes them only in Vite development, never in a production build.
export const databaseAccounts=DEMO_ACCOUNTS.map(account=>({...account,label:`${account.name} · ${account.role}`}));
export async function switchDatabaseAccount(username,authenticate=login){
 if(!databaseAccounts.some(account=>account.username===username))throw Error('该账号不可切换');
 return authenticate(username,DEMO_PASSWORD);
}
