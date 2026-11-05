import {login} from './authClient.js';

// Local development shortcuts still use the ordinary password/JWT login endpoint.
// The caller exposes them only in Vite development, never in a production build.
export const databaseAccounts=[
 {username:'admin',label:'后台管理员'},
 {username:'mysql_sr',label:'数据库销售 · SR'},
 {username:'mysql_tech',label:'数据库技术 · 技术'},
 {username:'mysql_tech2',label:'王工 · 技术'},
 {username:'mysql_tech3',label:'陈工 · 技术'},
 {username:'mysql_appr',label:'数据库评审人 · 技术'},
 {username:'mysql_bu',label:'数据库 BU 管理员'},
 {username:'mysql_view',label:'未授权对照账号'},
];
export async function switchDatabaseAccount(username,authenticate=login){
 if(!databaseAccounts.some(account=>account.username===username))throw Error('该账号不可切换');
 return authenticate(username,'Rfq@2026');
}
