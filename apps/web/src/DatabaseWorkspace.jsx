import React,{useEffect,useState} from 'react';
import {Button,Result,Spin} from 'antd';
import App from './App';
import {readSession,persistSession,fetchMe,logout,subscribeSession} from './authClient.js';
import {loadDatabaseWorkspace} from './databaseWorkspace.js';
import {hydrateSessionPersonnel} from './sessionPersonnel.js';

export default function DatabaseWorkspace(){
 const [state,setState]=useState(null),[error,setError]=useState('');
 const [{revision,identity},setReload]=useState({revision:0});
 const [userId,setUserId]=useState(()=>readSession()?.user?.id);
 const reload=(identity)=>{
  if(identity&&identity.actorId!==readSession()?.user?.id)return;
  setState(null);setReload(value=>({revision:value.revision+1,identity}));
 };
 useEffect(()=>subscribeSession(session=>setUserId(session?.user?.id)),[]);
 useEffect(()=>{let cancelled=false;setState(null);setError('');
  fetchMe().then(async user=>{
   const session=readSession();if(session&&!cancelled)persistSession({...session,user});
   const value=await loadDatabaseWorkspace(user);
   if(!cancelled)setState(identity?.actorId===user.id?hydrateSessionPersonnel({...value,...identity},user):value);
  }).catch(failure=>{if(!cancelled)setError(failure.message);});
  return()=>{cancelled=true;};
 },[userId,revision,identity]);
 if(error)return <Result status="error" title="未能读取数据库数据" subTitle={error} extra={[<Button key="retry" type="primary" onClick={()=>reload(identity)}>重新加载</Button>,<Button key="logout" onClick={logout}>重新登录</Button>]}/>;
 if(!state)return <div style={{minHeight:'100vh',display:'grid',placeItems:'center'}}><Spin tip="正在读取工作空间…" size="large"><div style={{padding:48}}/></Spin></div>;
 return <App key={`${userId}:${revision}`} initialState={state} onReload={reload}/>;
}
