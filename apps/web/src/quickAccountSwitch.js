import {login} from './authClient.js';

// Local development shortcuts still authenticate through the normal database login.
export const QUICK_ACCOUNTS=[
 {username:'mysql_sr',label:'SR · 数据库销售'},
 {username:'mysql_tech',label:'技术 · 数据库技术'},
 {username:'mysql_appr',label:'评审人 · 数据库评审人'},
 {username:'mysql_bu',label:'BU 管理员'},
 {username:'admin',label:'系统管理员'},
];
export async function switchDatabaseAccount(username,{authenticate=login,navigate=hash=>history.replaceState(null,'',hash)}={}){
 if(!QUICK_ACCOUNTS.some(account=>account.username===username))throw new Error('此账号未配置快捷切换');
 const session=await authenticate(username,'Rfq@2026');
 navigate(session.user.systemAdmin?'#/admin':'#/dashboard');
 return session;
}
