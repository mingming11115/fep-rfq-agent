import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Alert,Button,Result,Segmented,Select,Space,Tabs,Tag,theme} from 'antd';
import {PageHeading} from '../components/AntContent';
import {BuStatisticCard} from '../components/BuDashboardCards';
import {Activity,ClipboardList,Clock3,FolderKanban,SlidersHorizontal} from '../components/icons';
import {canManageBu} from '../personnelDomain';
import {selectBuDashboard} from '../buDashboardSelectors';
import {selectBuDashboardMock} from '../buDashboardMock';
import BuApprovalPanel from './BuApprovalPanel';
import BuProjectOverview from './BuProjectOverview';
import './bu-dashboard.css';

export default function BuDashboardPage({appState:state,onSelectBu,navigate}){
 const {token}=theme.useToken();
 const [filters,setFilters]=useState({query:'',stage:'all',focus:'all'}),[activeTab,setActiveTab]=useState('approval');
 const [approvalPeriodDays,setApprovalPeriodDays]=useState(30),[dataMode,setDataMode]=useState('sample'),[metricRefresh,setMetricRefresh]=useState(0);
 const mockReference=useRef(new Date()),isMock=dataMode==='sample';
 useEffect(()=>{const timer=setInterval(()=>setMetricRefresh(value=>value+1),60000);return()=>clearInterval(timer);},[]);
 const data=useMemo(()=>isMock?selectBuDashboardMock(state,{approvalPeriodDays,referenceTime:mockReference.current}):selectBuDashboard(state,{approvalPeriodDays}),[state,approvalPeriodDays,isMock,metricRefresh]);
 if(!data)return <Result status="403" title="暂无看板权限" subTitle="当前账号没有此 BU 的管理权限。"/>;
 const bus=state.businessUnits.filter(b=>canManageBu(state,state.actorId,b.id));
 const reset=()=>setFilters({query:'',stage:'all',focus:'all'});
 const filterProjects=focus=>{setFilters({query:'',stage:'all',focus});setActiveTab('projects');};
 const {stats,bu,approval}=data;
 const cards=[
  {label:'RFQ 项目总数',value:stats.projects,unit:'个',note:'当前 BU 全部项目',Icon:FolderKanban,filter:'all',tone:'blue'},
  {label:'进行中项目',value:stats.active,unit:'个',note:'尚未完成正式导出',Icon:Activity,filter:'active',tone:'teal'},
  {label:'逾期项目',value:stats.overdueProjects,unit:'个',note:'已过截止日且尚未导出',Icon:Clock3,filter:'overdue',tone:stats.overdueProjects>0?'danger':'blue'},
  {label:'待办任务',value:stats.pendingTasks,unit:'项',note:<span className={stats.overdueTasks>0?'bu-attention':undefined}>{`其中 ${stats.overdueTasks} 项已逾期`}</span>,Icon:ClipboardList,filter:'pending',tone:'violet'},
 ];
 return <div className="bu-dashboard" style={{'--bu-primary':token.colorPrimary,'--bu-danger':token.colorError,'--bu-danger-bg':token.colorErrorBg,'--bu-text':token.colorText,'--bu-muted':token.colorTextSecondary,'--bu-border':token.colorBorderSecondary,'--bu-fill':token.colorFillAlter}}>
  <PageHeading title="BU看板" description="项目交付、审批效率与团队负荷" actions={<div className="bu-dashboard-actions">
   <Segmented aria-label="看板数据" value={dataMode} options={[{label:'模拟数据',value:'sample'},{label:'当前数据',value:'current'}]} onChange={value=>{reset();setDataMode(value);}}/>
   <Select aria-label="看板BU" value={bu.id} options={bus.map(b=>({value:b.id,label:b.name}))} onChange={value=>{reset();onSelectBu(value);}}/>
   <Button type="primary" icon={<SlidersHorizontal size={15}/>} onClick={()=>navigate('bu-admin')}>BU人员与规则</Button>
  </div>}/>
  <Alert className="bu-data-notice" type={isMock?'info':'success'} showIcon message={<Space wrap><Tag color={isMock?'blue':'green'}>{isMock?'模拟数据':'当前数据'}</Tag><span>{isMock?'模拟项目仅用于看板，可切换当前数据查看实际进度。':`${bu.name} · 根据已保存的项目与任务统计`}</span></Space>}/>
  <div className="bu-metric-grid bu-dashboard-stats">{cards.map(card=><BuStatisticCard key={card.filter} {...card} selected={activeTab==='projects'&&filters.focus===card.filter} onFilter={()=>filterProjects(card.filter)}/>)}</div>
  <Tabs className="bu-dashboard-tabs" activeKey={activeTab} onChange={setActiveTab} items={[
   {key:'approval',label:'审批分析',children:<BuApprovalPanel key={dataMode} data={approval} onPeriodChange={setApprovalPeriodDays} onConfigureProject={isMock?null:id=>navigate('bu-admin',null,{projectId:id})}/>},
   {key:'projects',label:'项目与团队',children:<BuProjectOverview key={`${dataMode}-${bu.id}`} data={data} isMock={isMock} {...filters} onFilters={setFilters} onStage={stage=>setFilters({query:'',focus:'all',stage})} navigate={navigate}/>},
  ]}/>
 </div>;
}
