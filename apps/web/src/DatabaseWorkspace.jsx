import React,{useEffect,useRef,useState} from 'react';
import {App as AntApp,Button,Result,Spin} from 'antd';
import App from './App';
import {readSession,persistSession,fetchMe,logout} from './authClient.js';
import {loadDatabaseWorkspace} from './databaseWorkspace.js';
import {QUICK_ACCOUNTS,switchDatabaseAccount} from './quickAccountSwitch.js';

export default function DatabaseWorkspace(){
 const {message}=AntApp.useApp();
 const [state,setState]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [switching,setSwitching]=useState(false),switchingRef=useRef(false);
 const userId=readSession()?.user?.id;
 async function switchAccount(username){
  if(switchingRef.current)return false;
  switchingRef.current=true;setSwitching(true);
  try{await switchDatabaseAccount(username);return true;}
  catch(failure){message.error(`切换失败：${failure.message}`);return false;}
  finally{switchingRef.current=false;setSwitching(false);}
 }
 useEffect(()=>{let cancelled=false;setState(null);setError('');
  fetchMe().then(user=>{const session=readSession();if(session&&!cancelled)persistSession({...session,user});return loadDatabaseWorkspace(user);}).then(value=>{if(!cancelled)setState(value);}).catch(failure=>{if(!cancelled)setError(failure.message);});
  return()=>{cancelled=true;};
 },[userId,revision]);
 if(error)return <Result status="error" title="未能读取数据库数据" subTitle={error} extra={[<Button key="retry" type="primary" onClick={()=>setRevision(value=>value+1)}>重新加载</Button>,<Button key="logout" onClick={logout}>重新登录</Button>]}/>;
 if(!state)return <div style={{minHeight:'100vh',display:'grid',placeItems:'center'}}><Spin tip="正在读取工作空间…" size="large"><div style={{padding:48}}/></Spin></div>;
 const quickAccounts=import.meta.env.DEV?QUICK_ACCOUNTS.filter(account=>account.username!==readSession()?.user?.username).map(account=>({value:`account:${account.username}`,label:account.label})):[];
 return <App key={`${userId}:${revision}`} initialState={state} onReload={()=>setRevision(value=>value+1)} quickAccounts={quickAccounts} onSwitchAccount={switchAccount} accountSwitching={switching}/>;
}
