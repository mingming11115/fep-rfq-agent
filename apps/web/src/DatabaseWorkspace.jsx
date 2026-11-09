import React,{useEffect,useState} from 'react';
import {Button,Result,Spin} from 'antd';
import App from './App';
import {readSession,persistSession,fetchMe,logout,subscribeSession} from './authClient.js';
import {loadDatabaseWorkspace} from './databaseWorkspace.js';

export default function DatabaseWorkspace(){
 const [state,setState]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [userId,setUserId]=useState(()=>readSession()?.user?.id);
 useEffect(()=>subscribeSession(session=>setUserId(session?.user?.id)),[]);
 useEffect(()=>{let cancelled=false;setState(null);setError('');
  fetchMe().then(user=>{const session=readSession();if(session&&!cancelled)persistSession({...session,user});return loadDatabaseWorkspace(user);}).then(value=>{if(!cancelled)setState(value);}).catch(failure=>{if(!cancelled)setError(failure.message);});
  return()=>{cancelled=true;};
 },[userId,revision]);
 if(error)return <Result status="error" title="未能读取数据库数据" subTitle={error} extra={[<Button key="retry" type="primary" onClick={()=>setRevision(value=>value+1)}>重新加载</Button>,<Button key="logout" onClick={logout}>重新登录</Button>]}/>;
 if(!state)return <div style={{minHeight:'100vh',display:'grid',placeItems:'center'}}><Spin tip="正在读取工作空间…" size="large"><div style={{padding:48}}/></Spin></div>;
 return <App key={`${userId}:${revision}`} initialState={state} onReload={()=>{setState(null);setRevision(value=>value+1);}}/>;
}
