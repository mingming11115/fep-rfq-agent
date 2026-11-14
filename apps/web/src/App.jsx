import {assignConfirmation} from './confirmationAssignmentClient';
import {restoreResponse,writeResponse} from './responseClient';
import {getReparseSources,useSourceParsing} from './useSourceParsing';
import SourceReparseDialog from './components/SourceReparseDialog';
import {databaseAccounts,switchDatabaseAccount} from './databaseAccountSwitch';
import {readGenericCatalog,resolveGroupBinding} from './genericCatalog';
import { UiButton, UiInput } from './components/AntContent';
import { App as AntApp } from 'antd';
import RfqAppLayout from './components/RfqAppLayout';
import { api, consumeLoginIdentity, readSession, logout } from './authClient';
import { mapDatabaseRequirement } from './databaseWorkspace.js';
import {loadLibraryResources} from './knowledgeLibraryClient';
import { hydrateSessionPersonnel, mergeMemberDirectory } from './sessionPersonnel';
import {createBackendProject,deleteBackendProject,restoreBackendProject} from './rfqProjectClient';
import BuAdminPage,{ProjectPersonnelPanel,PlatformAdminPage} from './pages/BuAdminPage';
import {canAccessProject,getPersonnelContext,personName,getProjectFinalReview,getRequiredFinalReviewers,configureProjectFinalReviewers,assignProjectDuty} from './personnelDomain';
import {applyFinalReviewDecision,isFinalReviewApproved} from './finalReviewDomain';
import {snapshotClient} from './finalSnapshotClient';
import {matchClient} from './requirementMatchClient';
import {invalidatePendingSnapshots,currentProjectScope,checkSnapshotValidity} from './snapshotDomain';
import {getFinalReviewGate} from './finalReviewFlow';
import {tidyDemoState,tidyStoredDemo} from './demoCleanup';
import {addReviewScenarioDemos,addStoredReviewScenarioDemos} from './demoReviewScenarios';
import {officeRouteSource} from './officeClauseLink';
import {migrateFepDemoCatalog} from './fepDemoCatalog';
import {canPerform,assertPermission,assertRequirementPatch,canAccessPage,getRoleNavigation} from './permissions';
import {reconcileTasks,selectMyTasks,applyTaskAction,assertBusinessAction,getTaskContextError,isTaskPending,startTaskForObject,transferBusinessTask,confirmProjectRequirement} from './taskDomain';
import {getProjectSummary,selectAccessibleState} from './projectSelectors';
import {getWorkspaceContentKey,parseWorkRoute,buildWorkRoute,getProjectEntryPage,PROJECT_PAGES,ADMIN_PAGES,shouldOpenSourceUpload,getSourceUploadExitRoute} from './navigation';
import {removeProject,restoreProject,addProjectSources,handoverProject,createProjectReviewSettings,createProjectPersonnel,updateProjectSettings} from './projectDomain';
import {readRfqCatalog,resolveRfqProcessBinding} from './rfqProcessBinding';
import SourceUploadDialog from './components/SourceUploadDialog';
import OverlayPresence from './components/OverlayPresence';
import ProjectWorkspace from './components/ProjectWorkspace';
import AdminWorkspace from './components/AdminWorkspace';
import {upgradePrototypeState,actorIdForRole} from './stateMigration';
import React,{useEffect,useRef,useState} from 'react';
import { fetchBuMembers } from './memberSync';
import {LayoutDashboard,FolderKanban,Layers3,FileSearch,ListChecks,GitPullRequest,FileOutput,History,Settings,BookOpen,ShieldCheck,SlidersHorizontal,ChevronDown,ChevronRight,PanelLeftClose,PanelLeftOpen,HelpCircle,RotateCcw,CheckCircle2,AlertCircle,X,ArrowRight,Search,Bell,Globe,Users} from "./components/icons";
import {NAV_ITEMS,PRIMARY_NAV,createDemoState} from './data';
import {applyRequirementEdit,confirmRequirement,getExportIssues} from './domain';
import {applyRfqRevision,getReviewRoute,refreshReviewForRevision} from './rfqWorkflow';
import {Modal,Drawer} from './components/ui';
import ProjectsPage from './pages/ProjectsPage';
import TasksPage from './pages/TasksPage';
import {applyReviewProposal,assertIndependentApproval,beginReview,reopenReview,requirementAfterReview,validateResponseReviewers,updateResponseReview,resetResponseReviewConfirmations,synchronizeResponseReviews} from './reviewDomain';
import {appendAnalysisRun} from './analysisDomain';
import DashboardPage from './pages/DashboardPage';
import BuDashboardPage from './pages/BuDashboardPage';
import ResponsePage from './pages/ResponsePage';
import {ReviewsPage,ExportPage} from './pages/WorkflowPages';
import {KnowledgePage,CapabilitiesPage,KNOWLEDGE} from './pages/ReferencePages';
import HistoryKnowledgePage from './pages/HistoryKnowledgePage';
import {SettingsPage,AuditPage,AdminPage} from './pages/ManagementPages';

function getPersonnelBu(s){return s.businessUnits?.find(b=>getPersonnelContext(s,s.actorId,b.id).enabled||getPersonnelContext(s,s.actorId,b.id).managed)?.id||s.businessUnits?.[0]?.id;}
const STORAGE='fep-rfq-app-v1';
const DETAIL_PAGES=['response','settings','versions','reviews'];
const icons={tasks:ListChecks,analysis:FileSearch,dashboard:LayoutDashboard,projects:FolderKanban,capabilities:Layers3,response:ListChecks,reviews:GitPullRequest,export:FileOutput,versions:History,settings:Settings,knowledge:BookOpen,history:History,audit:ShieldCheck,admin:SlidersHorizontal,'bu-admin':Users};
const shortLabels={tasks:'任务中心',projects:'我的 RFQ',dashboard:'工作台',versions:'版本记录',settings:'项目设置',knowledge:'标准回复库',history:'历史 RFQ',admin:'系统配置','bu-admin':'BU管理'};
const validPage=key=>parseWorkRoute('#/'+key).page;
function withProjectMembers(s){return {...s,membersByProject:Object.fromEntries(s.projects.map(p=>[p.id,structuredClone(s.membersByProject?.[p.id]??s.members??[])]))};}
function withProjectDocuments(state){
 const documentsByProject={...state.documentsByProject};
 for(const project of state.projects){if(Array.isArray(documentsByProject[project.id])) { continue; } try{const saved=JSON.parse(localStorage.getItem(`fep-rfq-documents:${project.id}`)||'null');if(Array.isArray(saved?.files)) { documentsByProject[project.id]=saved.files; }}catch{ console.error('读取本地项目原件记录失败'); }}
 return {...state,documentsByProject};
}
function initial(){
 try{migrateFepDemoCatalog(localStorage);}catch(error){console.error('FEP 展示资料更新失败，保留原有数据',error);}
 let saved;try{saved=JSON.parse(localStorage.getItem(STORAGE));}catch{ console.error('读取本地工作区状态失败'); }
 const demo=createDemoState();
 if(Array.isArray(saved?.projects)){
  const upgraded=upgradePrototypeState(withProjectDocuments(withProjectMembers(saved)),demo);
  let next=upgraded;try{next=tidyStoredDemo(localStorage,upgraded);}catch(error){console.error('数据备份失败，保留现有数据',error);}
  try{next=addStoredReviewScenarioDemos(localStorage,next);}catch(error){console.error('评审场景数据补入失败，保留现有数据',error);}
  return withLoginIdentity(reconcileTasks(invalidatePendingSnapshots(next)));
 }
 return withLoginIdentity(reconcileTasks(addReviewScenarioDemos(tidyDemoState(upgradePrototypeState(withProjectMembers({...demo,activeProjectId:'RFQ-001'}),demo)))));
}
// 登录身份优先于本机残留身份，但只消费一次：之后页面内切换当前身份不会在刷新时被覆盖。
function withLoginIdentity(state){
 const identity=consumeLoginIdentity();
 const user=readSession()?.user;
 if(user) { return hydrateSessionPersonnel(state,user,{activate:!!identity||!state.accountsById?.[state.actorId]}); }
 if(!identity?.actorId||!identity?.actorRole) { return state; }
 return {...state,actorId:identity.actorId,actorRole:identity.actorRole};
}
const now=()=>new Date().toLocaleString('zh-CN',{hour12:false});
const event=(s,action,object='',detail='',result='成功')=>s.dataSource==='mysql'?s:({...s,audit:[{id:`EVT-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,time:now(),actor:personName(s,s.actorId),actorId:s.actorId,role:s.actorRole,buId:s.activeBuId||s.projects.find(p=>p.id===s.activeProjectId)?.buId,action,object,result,detail},...(s.audit||[])].slice(0,500)});

export default function App({initialState,onReload,quickAccounts=[],onSwitchAccount,accountSwitching=false}={}){
 const databaseBacked=initialState?.dataSource==='mysql';
 const {message:antMessage}=AntApp.useApp();
 const [state,setState]=useState(()=>initialState?structuredClone(initialState):initial()),stateRef=useRef(state),[page,setPage]=useState(()=>parseWorkRoute(location.hash).page),[collapsed,setCollapsed]=useState(()=>DETAIL_PAGES.includes(parseWorkRoute(location.hash).page)),[help,setHelp]=useState(false),[reset,setReset]=useState(false),[globalSearch,setGlobalSearch]=useState(false),[search,setSearch]=useState('');
 const homePage=state.actorRole==='后台管理'?'admin':'dashboard';
 const [route,setRoute]=useState(()=>parseWorkRoute(location.hash)),routeRef=useRef(route);
 const [focusedRequirementId,setFocusedRequirementId]=useState(()=>route.requirementId||null);
 const [finalReviewOpen,setFinalReviewOpen]=useState(false);
 const [reparseTarget,setReparseTarget]=useState(null);
 const timers=useRef([]),pageRef=useRef(page);const update=fn=>{const changed=fn(stateRef.current),next=reconcileTasks(databaseBacked?changed:invalidatePendingSnapshots(upgradePrototypeState(synchronizeResponseReviews(changed,stateRef.current),createDemoState())));stateRef.current=next;setState(next);};
 const project=state.projects.find(p=>p.id===(route.projectId||state.activeProjectId))||state.projects[0]||{id:'',name:'未选择项目'},requirements=state.requirementsByProject[project.id]||[],reviews=state.reviewsByProject[project.id]||[],snapshots=state.snapshotsByProject[project.id]||[];
 const {reparse:reparseSource,retry:retrySource}=useSourceParsing({state,stateRef,update,onReload,toast});
 const sourceReparse={
  hasSources:(projectId,fileId)=>getReparseSources(state,projectId).some(file=>!fileId||file.id===fileId),
  open:(projectId,fileId)=>guarded(()=>setReparseTarget({projectId,fileId})),
  retry:retrySource,
 };
 const reparseProject=reparseTarget&&state.projects.find(row=>row.id===reparseTarget.projectId);
 const reparseFiles=reparseProject?getReparseSources(state,reparseProject.id):[];
 function submitReparse(projectId,fileId,historyDocumentIds){
  const sourceRoute=routeRef.current;
  return reparseSource(projectId,fileId,historyDocumentIds,(file,row)=>{
   if(reparseTarget?.fileId!==fileId||routeRef.current!==sourceRoute||!DETAIL_PAGES.includes(sourceRoute.page)) { return; }
   rawNavigate(sourceRoute.page,{...sourceRoute,projectId,fileId,sourceVersion:file.version,requirementId:row?.id,taskId:undefined,reviewId:undefined,action:undefined},true);
  });
 }
 const finalReviewGate=getFinalReviewGate(state,project.id);
 useEffect(()=>setFinalReviewOpen(false),[state.actorId,state.actorRole,project.id,page]);
 const item=NAV_ITEMS.find(n=>n.key===(page==='reviews'?'response':page)),isProjectPage=item?.section==='项目';
 const pageTitle=DETAIL_PAGES.includes(page)?'RFQ 详情':state.actorRole==='BU管理员'&&page==='projects'?'BU RFQ':page==='dashboard'&&state.actorRole==='BU管理员'?'BU看板':shortLabels[page]||item?.label||'工作台';
 useEffect(()=>{if(databaseBacked) { return; } try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch (error){ console.error('保存本地工作区状态失败', error); }},[state]);
 // 各BU独立同步，避免无权读取的旧演示BU阻断真实BU的成员与资格加载。
 useEffect(()=>{if(databaseBacked) { return; } let cancelled=false;(async()=>{const buIds=(stateRef.current.businessUnits||[]).map(b=>b.id);if(!buIds.length) { return; } const loaded=await Promise.allSettled(buIds.map(id=>fetchBuMembers(id).then(rows=>[id,rows])));if(cancelled) { return; } const directories=loaded.filter(result=>result.status==='fulfilled').map(result=>result.value);if(directories.length) { update(s=>directories.reduce((next,[buId,rows])=>mergeMemberDirectory(next,buId,rows),s)); }})();return()=>{cancelled=true;};},[]);
 useEffect(()=>{const handle=()=>{const next=parseWorkRoute(location.hash);const proceed=()=>{routeRef.current=next;setRoute(next);setPage(next.page);pageRef.current=next.page;if(next.projectId&&stateRef.current.projects.some(p=>p.id===next.projectId)) { update(s=>({...s,activeProjectId:next.projectId})); } setFocusedRequirementId(next.requirementId||null);};if(window.__rfqRequestNavigation&&!window.__rfqRequestNavigation(proceed,{officeSource:officeRouteSource(stateRef.current,next)})){history.replaceState(null,'',buildWorkRoute(routeRef.current));return;}proceed();};window.addEventListener('hashchange',handle);if(routeRef.current.projectId) { handle(); } return()=>{window.removeEventListener('hashchange',handle);timers.current.forEach(clearTimeout);};},[]);
 useEffect(()=>{document.title=`${pageTitle} · FEP RFQ`;window.scrollTo(0,0);},[page,pageTitle]);
 useEffect(()=>{if(state.actorRole==='后台管理'&&page==='dashboard') { rawNavigate('admin',{},true); }},[state.actorRole,page]);
 function toast(content,type='success'){antMessage.open({type,content,duration:4.5});}
 function unavailable(){toast('此功能尚未接入后端，未保存到数据库','warning');return false;}
 function allow(action){try{assertPermission(stateRef.current.actorRole,action,{state:stateRef.current,actorId:stateRef.current.actorId,projectId:action==='project:create'?undefined:stateRef.current.activeProjectId,buId:stateRef.current.activeBuId||stateRef.current.projects.find(p=>p.id===stateRef.current.activeProjectId)?.buId});return true;}catch(error){ console.error('校验操作权限失败', error); toast(error.message,'error');return false;}}
 function resetDemoData(){
  if(databaseBacked) { return unavailable(); }
  if(!allow('project:manage')) { return; }
  const seed=createDemoState(),demo=addReviewScenarioDemos(tidyDemoState(upgradePrototypeState(seed,seed))),ids=new Set([...stateRef.current.projects,...demo.projects].map(p=>p.id));
  const related={};
  try{
   for(const id of ids)for(const key of [`fep-rfq-documents:${id}`,`fep-rfq-export-history:${id}`])related[key]=localStorage.getItem(key);
   localStorage.setItem('fep-rfq-demo-before-reset',JSON.stringify({savedAt:new Date().toISOString(),state:stateRef.current,related}));
  }catch (error2){ console.error('重置前备份本地数据失败', error2); toast('本机数据备份失败，请释放浏览器存储后重试','error');return;}
  for(const p of demo.projects){localStorage.removeItem(`fep-rfq-documents:${p.id}`);localStorage.removeItem(`fep-rfq-export-history:${p.id}`);sessionStorage.removeItem(`rfq.export.settings.${p.id}`);}
  delete window.__rfqRequestNavigation;
  update(()=>withProjectMembers({...demo,activeProjectId:'RFQ-001'}));setReset(false);rawNavigate('projects');toast('已备份原数据，保留五种RFQ状态与15条应答矩阵，并补入三套评审阶段 mock');
 }
 function rawNavigate(key,details={},replace=false){const next={page:validPage(key),...(PROJECT_PAGES.includes(key)?{projectId:stateRef.current.activeProjectId||project.id}:{}),...details};routeRef.current=next;setRoute(next);setPage(next.page);pageRef.current=next.page;setFocusedRequirementId(next.requirementId||null);history[replace?'replaceState':'pushState'](null,'',buildWorkRoute(next));}
 function guarded(action,options){if(window.__rfqRequestNavigation&&!window.__rfqRequestNavigation(action,options)) { return false; } action();return true;}
 function navigate(key,requirementId,details={}){const current=routeRef.current;const context=PROJECT_PAGES.includes(key)&&current.projectId===stateRef.current.activeProjectId?{taskId:current.taskId,action:current.action,returnKey:current.returnKey}:{};const target={page:validPage(key),...(PROJECT_PAGES.includes(key)?{projectId:stateRef.current.activeProjectId||project.id}:{}),...context,...(requirementId?{requirementId}:{}),...details};return guarded(()=>rawNavigate(key,target),{officeSource:officeRouteSource(stateRef.current,target)});}
 function selectProject(id,destination='response',details={}){guarded(()=>{update(s=>({...s,activeProjectId:id}));const entry=getProjectEntryPage(stateRef.current,id,destination);const needsUpload=DETAIL_PAGES.includes(entry)&&!stateRef.current.documentsByProject?.[id]?.length&&canPerform(stateRef.current.actorRole,'source:manage');rawNavigate(entry,{projectId:id,returnKey:'projects',...(needsUpload?{upload:'true'}:{}),...details});});}
 function taskAction(id,action){const s=stateRef.current,t=s.tasksById[id];try{if(action.type==='transfer'){if(databaseBacked) { return unavailable(); } update(st=>event(transferBusinessTask(st,{taskId:id,to:action.to,reason:action.reason}),'转办任务',id,action.reason));return true;}const next=applyTaskAction(t,{...action,actorId:s.actorId,objectVersion:t?.objectVersion,at:new Date().toISOString()},s);update(s=>event({...s,tasksById:{...s.tasksById,[id]:next}},action.type==='transfer'?'转办任务':'接手任务',id,action.reason||''));return true;}catch(e){ console.error('处理待办操作失败', e); toast(e.message,'error');return false;}}
 function openTask(task,mode='view',returnKey='tasks'){guarded(()=>{const t=stateRef.current.tasksById[task.id];if(!t||!canAccessProject(stateRef.current,stateRef.current.actorId,t.projectId)){toast('任务不存在，请刷新后查看','error');return;}if(mode==='start'&&!taskAction(t.id,{type:'start'})) { return; } update(s=>({...s,activeProjectId:t.projectId}));rawNavigate(t.objectType==='requirement'||t.kind==='response-revise'?'response':t.objectType==='review'?'reviews':'export',{projectId:t.projectId,requirementId:t.requirementId,reviewId:t.reviewId,snapshotId:t.snapshotId,taskId:t.id,action:mode,returnKey});});}
 function openProject(id,mode='view',details={}){if(mode==='continue'){const task=selectMyTasks(stateRef.current,{actorId:stateRef.current.actorId,projectId:id})[0];if(task){openTask(task,'start','projects');return;}}selectProject(id,['documents','settings','versions'].includes(mode)?mode:'response',details);}
 async function persistProjectAction(action,successMessage){
  try{await action();}
  catch(error){ console.error('保存项目操作失败', error); toast(error.message,'error');return false;}
  toast(successMessage);
  const {actorId,actorRole,activeBuId}=stateRef.current;
  onReload?.({actorId,actorRole,activeBuId});
  return true;
 }
 function deleteProject(project){
  if(databaseBacked) { return persistProjectAction(()=>deleteBackendProject(project),'项目已删除'); }
  const {id}=project;
  try{update(s=>event(removeProject(s,id),'删除项目',id,'项目及相关待办已移出，可撤销删除'));toast('项目已删除，可在列表中撤销');return true;}catch(error){ console.error('删除项目失败', error); toast(error.message,'error');return false;}
 }
 function undoDeleteProject(project,reason){
  if(databaseBacked) { return persistProjectAction(()=>restoreBackendProject(project,reason),'项目已恢复'); }
  const {id}=project;
  try{update(s=>event(restoreProject(s,id),'撤销删除项目',id,'项目及相关工作记录已恢复'));toast('项目已恢复');return true;}catch(error){ console.error('撤销项目删除失败', error); toast(error.message,'error');return false;}
 }
 function uploadFromDetail(incoming){
  if(!allow('source:manage')) { return false; }
  const pid=routeRef.current.projectId||stateRef.current.activeProjectId;
  try{update(s=>event(addProjectSources(s,pid,incoming),'上传资料元数据',pid,`${incoming.length} 个文件已上传，等待后端解析`));}catch(error){ console.error('添加项目原件记录失败', error); toast(error.message,'error');return false;}
  const next={...getSourceUploadExitRoute(routeRef.current,true),page:'response',projectId:pid};rawNavigate(next.page,next);toast('原件已上传，正在解析');return true;
 }
 function transferProject(id,to,reason){if(databaseBacked) { return unavailable(); } try{update(st=>event(handoverProject(st,{projectId:id,to,reason}),'移交项目负责人',id,reason));return true;}catch(e){ console.error('移交项目负责人失败', e); toast(e.message,'error');return false;}}
 function analysisRun(run){if(databaseBacked) { return unavailable(); } update(s=>({...s,analysisRuns:appendAnalysisRun(s.analysisRuns,{...run,projectId:project.id})}));}
 const logEvent=(action,object='',detail='')=>update(s=>event(s,action,object,detail));
 async function createProject(form){
  const current=stateRef.current,buId=current.activeBuId||getPersonnelBu(current),context={state:current,actorId:current.actorId,buId};
  try{
   assertPermission(current.actorRole,'project:create',context);
   if(['name','ownerId','deadline'].some(key=>!form[key]?.trim())) { throw new Error('请填写项目名称、负责人和截止时间'); }
   const localBinding=databaseBacked?null:resolveGroupBinding(readGenericCatalog(localStorage,buId,readRfqCatalog(localStorage,context)),form.groupId,buId);
   const code=databaseBacked?`RFQ-${Date.now().toString(36).toUpperCase()}`:`RFQ-${String(Math.max(0,...[...current.projects,...Object.values(current.deletedProjectsById||{}).map(record=>record.project)].map(p=>Number((p.code||p.id).match(/\d+$/)?.[0]||0)))+1).padStart(3,'0')}`;
   const {technicalMode,srId,technicalIds,technicalRepresentativeId,...projectForm}=form;
   const personnel=createProjectPersonnel(current,{buId,ownerId:form.ownerId,technicalMode,srId,technicalIds,technicalRepresentativeId});
   const saved=await createBackendProject({...form,id:code,buId});
   const id=saved.id;
   const binding=localBinding||{groupId:saved.groupId,groupPath:saved.groupPath,groupCatalogVersion:saved.groupCatalogVersion,groupValues:saved.groupValues};
   const p={...projectForm,...binding,id,code:saved.code,backendProjectId:id,backendBuId:saved.buId,createdById:current.actorId,buId,...personnel,technicalReviewSettings:createProjectReviewSettings(technicalMode),createdAt:saved.createdAt||new Date().toISOString(),name:form.name.trim(),equipment:[binding.modelName,binding.modelRevision,binding.modelConfig].filter(Boolean).join(' · '),owner:personnel.owner,version:databaseBacked?saved.version:saved.version||1};
   if(databaseBacked) { p.defaultConfirmationAssigneeId=current.actorId; }
   update(s=>event({...s,projects:[p,...s.projects],activeProjectId:id,membersByProject:{...s.membersByProject,[id]:structuredClone(s.members||[])},requirementsByProject:{...s.requirementsByProject,[id]:[]},reviewsByProject:{...s.reviewsByProject,[id]:[]},snapshotsByProject:{...s.snapshotsByProject,[id]:[]}},'创建项目',id,`${p.name} · ${p.groupPath||[p.modelName,p.modelRevision,p.processCode,p.processName].filter(Boolean).join(" / ")}`));
   toast('项目已创建，请上传 RFQ 资料');rawNavigate('response',{projectId:id,upload:'true'});return true;
  }catch(error){ console.error('创建项目失败', error); toast(error.message,'error');return false;}
 }
 function businessAllowed(objectType,objectId,action='save',expectedVersion,expectedRound){if(databaseBacked) { return unavailable(); } try{assertBusinessAction(stateRef.current,{projectId:stateRef.current.activeProjectId,objectType,objectId,action,route:routeRef.current,expectedVersion,expectedRound});return true;}catch(e){ console.error('校验业务操作权限失败', e); toast(e.message,'error');return false;}}
 function followOwnTask(objectType,objectId){const current=routeRef.current;if(!current.taskId) { return; } const t=Object.values(stateRef.current.tasksById).find(t=>t.projectId===current.projectId&&t.objectType===objectType&&t.objectId===objectId&&t.assigneeId===stateRef.current.actorId&&isTaskPending(t));if(t&&t.id!==current.taskId) { rawNavigate(current.page,{...current,taskId:t.id}); }}
 function markSaved(s,objectType,objectId){return startTaskForObject(s,{projectId:s.activeProjectId,objectType,objectId,actorId:s.actorId});}
 function updateRequirement(id,patch,expectedVersion,matchChoice){if(databaseBacked) { return persistResponse(id,patch,expectedVersion,false,null,matchChoice); } if(!businessAllowed('requirement',id,'save',expectedVersion)) { return false; } const s=stateRef.current,pid=s.activeProjectId||project.id,row=s.requirementsByProject[pid]?.find(r=>r.id===id);if(!row){toast('找不到该要求，请刷新后重试','error');return false;}try{assertRequirementPatch(s.actorRole,row,patch,{state:s,actorId:s.actorId,projectId:pid,requirementId:id});}catch(error){ console.error('更新条款失败', error); toast(error.message,'error');return false;}const edited=applyRequirementEdit(row,patch);update(s=>markSaved(event(resetResponseReviewConfirmations(s,pid,row,edited),'保存应答草稿',`${pid} · ${row.clause}`,row.status==='已确认'&&edited.status!=='已确认'?'内容变更，原确认已失效':'草稿已保存'),'requirement',id));followOwnTask('requirement',id);return true;}
 async function addSelectionRequirements(file,selection,candidates){
  const pid=project.id;
  const saved=await api.post(`/documents/${encodeURIComponent(file.backendDocumentId)}/selection-requirements`,{selection,candidates});
  const rows=saved.map(row=>mapDatabaseRequirement(row,[file],project.owner));
  update(s=>{
   const current=s.requirementsByProject[pid]||[];
   const ids=new Set(current.map(row=>row.id));
   return {...s,requirementsByProject:{...s.requirementsByProject,[pid]:[...current,...rows.filter(row=>!ids.has(row.id))]}};
  });
  toast(`已添加 ${rows.length} 条应答要求`);
  return rows;
 }
 async function deleteExtractedRequirement(row){
  const pid=project.id;
  try{
   await api.delete(`/requirements/${encodeURIComponent(row.id)}?version=${row.backendVersion}`);
   update(s=>({...s,
    requirementsByProject:{...s.requirementsByProject,[pid]:(s.requirementsByProject[pid]||[]).filter(item=>item.id!==row.id)},
    reviewsByProject:{...s.reviewsByProject,[pid]:(s.reviewsByProject[pid]||[]).filter(item=>item.requirementId!==row.id)},
   }));
   const current=routeRef.current;
   if(current.page==='response'&&(!current.projectId||current.projectId===pid)){
    const remaining=stateRef.current.requirementsByProject[pid];
    const next=remaining.find(item=>item.sourceFileId===row.sourceFileId)||remaining[0];
    rawNavigate('response',{projectId:pid,requirementId:next?.id,fileId:next?.sourceFileId,sourceVersion:next?.sourceVersion},true);
   }
   toast('已删除误提取条款');return true;
  }catch(error){ console.error('删除误提取条款失败', error); toast(error.message,'error');return false; }
 }
 async function persistResponse(id,patch,expectedVersion,confirming,restore,matchChoice){
  const current=stateRef.current,pid=current.activeProjectId,row=current.requirementsByProject[pid]?.find(r=>r.id===id);
  try{
   assertBusinessAction(current,{projectId:pid,objectType:'requirement',objectId:id,action:confirming?'confirm':'save',expectedVersion,route:routeRef.current});
   const saved=await (restore?restoreResponse(row,restore):writeResponse(row,patch,confirming,undefined,matchChoice));
   update(s=>({...s,requirementsByProject:{...s.requirementsByProject,[pid]:s.requirementsByProject[pid].map(r=>r.id===id?{
    ...r,...saved,matchReference:saved.matchReference,restrictedMatchReference:saved.restrictedMatchReference,confirmationAssigneeId:r.confirmationAssigneeId,confirmationAssignmentSource:r.confirmationAssignmentSource,
    original:r.original,confirmedAt:saved.confirmedAt,confirmedBy:saved.confirmedBy,confirmedById:saved.confirmedById,
    restoredFromVersion:saved.restoredFromVersion,restoredBy:saved.restoredBy,restoredById:saved.restoredById,restoredAt:saved.restoredAt,
   }:r)}}));
   return true;
  }catch(error){ console.error('保存应答失败', error); if(restore) { throw error; } toast(error.message,'error');return false;}
 }
 function confirm(id,expectedVersion,patch,matchChoice){if(databaseBacked) { return persistResponse(id,patch,expectedVersion,true,null,matchChoice); } try{update(st=>event(confirmProjectRequirement(st,{projectId:project.id,requirementId:id,expectedVersion,route:routeRef.current}),'确认要求',`${project.id} · ${id}`,'按当前人员资格和条款分派确认'));return true;}catch(e){ console.error('确认条款失败', e); toast(e.message,'error');return false;}}
 function restoreConfirmation(id,expectedVersion,entry){return persistResponse(id,null,expectedVersion,false,entry);}
 function createReview(value){
  if(databaseBacked) { return matchClient().review(value.requirementId,{version:value.requirementVersion,
   reviewerIds:value.reviewerIds,deadline:value.deadline,reason:value.description}).then(saved=>{
    receiveDeviation(project.id,saved);return saved.id;
   }).catch(error=>{ console.error('发起条款比对评审失败', error); toast(error.message,'error');return false;}); }
  value={...value,kind:'review'};
  if(!businessAllowed('requirement',value.requirementId,'save',value.requirementVersion)) { return false; }
  const current=stateRef.current,pid=project.id;
  const existing=(current.reviewsByProject[pid]||[]).find(r=>r.requirementId===value.requirementId&&!['已关闭','已取消'].includes(r.status));
  if(existing){toast(`该条已有未关闭事项 ${existing.id}，请继续处理原事项`);return existing.id;}
  const requirement=current.requirementsByProject[pid]?.find(r=>r.id===value.requirementId);
  let reviewerIds=[];
  try{if(value.kind!=='clarification') { reviewerIds=validateResponseReviewers(current,pid,value.reviewerIds); }}catch(e){ console.error('校验评审人员失败', e); toast(e.message,'error');return false;}
  const started=beginReview(requirement,{...value,version:1,round:1,id:value.id||`DEV-${crypto.randomUUID()}`,status:'待处理',history:[{time:now(),actor:personName(current,current.actorId),actorId:current.actorId,action:value.kind==='clarification'?'建立客户澄清':'发起评审'}]});
  const review={...started.review,createdById:current.actorId,requestEvidenceLink:value.evidence||'',owner:value.kind==='clarification'?personName(current,project.ownerId):reviewerIds.map(id=>personName(current,id)).join('、'),ownerId:value.kind==='clarification'?project.ownerId:reviewerIds[0],...(value.kind!=='clarification'?{reviewerIds,confirmations:{},proposedDraft:requirement.draft,proposedConclusion:requirement.conclusion,evidence:requirement.evidence,conditions:requirement.conditions,reason:requirement.remark??requirement.reason}:{} )};
  update(s=>event({...s,reviewsByProject:{...s.reviewsByProject,[pid]:[review,...(s.reviewsByProject[pid]||[])]},requirementsByProject:{...s.requirementsByProject,[pid]:s.requirementsByProject[pid].map(r=>r.id===review.requirementId?started.requirement:r)},...(value.commentId?{commentsByProject:{...s.commentsByProject,[pid]:(s.commentsByProject[pid]||[]).map(c=>c.id===value.commentId?{...c,linkedIssues:{...c.linkedIssues,[value.kind||'review']:review.id}}:c)}}:{})},value.kind==='clarification'?'发起客户澄清':'发起专项评审',review.id,review.title));
  toast(value.kind==='clarification'?'已创建客户澄清事项':'已分派评审，全部评审人确认后完成');return review.id;
 }

 function updateReview(id,patch,expectedVersion,expectedRound){if(databaseBacked) { return unavailable(); } const s=stateRef.current,pid=project.id,review=s.reviewsByProject[pid]?.find(r=>r.id===id);if(!review) { return false; }
  if(review.kind!=='clarification'&&Array.isArray(review.reviewerIds)){try{const next=updateResponseReview(s,{projectId:pid,reviewId:id,patch,expectedVersion,expectedRound,route:routeRef.current});update(()=>event(next,'更新应答评审',id,patch.action==='confirm'?'记录本人确认':'保存评审内容'));return next.reviewsByProject[pid].find(r=>r.id===id);}catch(e){ console.error('更新应答评审失败', e); toast(e.message,'error');return false;}}
  if(patch.ownerId){const c=getPersonnelContext(s,patch.ownerId,project.buId);if(!c.enabled||!c.member.roles.includes(review.kind==='clarification'?'SR':'技术')||!canAccessProject(s,patch.ownerId,pid)){toast('接收人没有对应业务资格或项目授权','error');return false;}}
  const communicationOnly=Object.keys(patch).some(key=>['customerCommunication','acceptanceResult'].includes(key))&&Object.keys(patch).every(key=>['customerCommunication','acceptanceResult','history'].includes(key));
  const action=communicationOnly?'communicate':review.status==='已关闭'&&patch.status&&!['已关闭','已取消'].includes(patch.status)?'reopen':patch.status==='已关闭'?'approve':patch.status==='已退回'?'reject':'save';if(!businessAllowed('review',id,action,expectedVersion,expectedRound)) { return false; }
  if(patch.status==='已关闭'){try{assertIndependentApproval(review,{id:s.actorId,role:s.actorRole},{state:s,actorId:s.actorId,projectId:pid});}catch(e){ console.error('校验独立审批权限失败', e); toast(e.message,'error');return false;}}
  let next={...review,...patch};
  if(review.status==='已关闭'&&!['已关闭','已取消'].includes(next.status)){
    if(s.reviewsByProject[pid].some(r=>r.id!==id&&r.requirementId===review.requirementId&&(r.kind||'review')===(review.kind||'review')&&!['已关闭','已取消'].includes(r.status))){toast('该条款已有进行中的评审，请先处理当前事项','error');return false;}
    try{next=reopenReview(review,{reason:patch.reason,owner:patch.owner||review.owner,deadline:patch.deadline||review.deadline,actor:{id:s.actorId,role:s.actorRole}});next.ownerId=patch.ownerId||review.ownerId;}catch(error){ console.error('重新开启应答评审失败', error); toast(error.message,'error');return false;}
  }
  const req=s.requirementsByProject[pid]?.find(r=>r.id===review.requirementId);
  update(s=>markSaved(event({...s,reviewsByProject:{...s.reviewsByProject,[pid]:s.reviewsByProject[pid].map(r=>r.id===id?next:r)},requirementsByProject:{...s.requirementsByProject,[pid]:s.requirementsByProject[pid].map(r=>{if(r.id!==req?.id) { return r; } const updated=requirementAfterReview(r,review,next);return s.reviewsByProject[pid].some(other=>other.id!==id&&other.requirementId===r.id&&!['已关闭','已取消'].includes(other.status))?{...updated,status:'评审中'}:updated;})}},'更新评审事项',id,patch.status||'保存处理信息'),'review',id));return next;
 }
 function confirmReviewed(){/* Reopening a review marks its requirement for recheck in updateReview. */}
 function adoptReview(id,proposal,reason){if(!businessAllowed('requirement',id,'adopt',proposal.baseVersion)) { return false; } const s=stateRef.current,pid=project.id,row=s.requirementsByProject[pid]?.find(r=>r.id===id);try{let next;if(reason){next={...row,pendingReviewProposal:null,needsReview:true,status:'待确认',confirmationReason:'已保留人工答复，请确认本版应答。',reason,proposalHistory:[...(row.proposalHistory||[]),{reviewId:proposal.reviewId,action:'保留人工答复',reason,actorId:s.actorId}]};}else { next=applyReviewProposal(row,proposal,{expectedVersion:row.version||1,actor:{id:s.actorId,role:s.actorRole}}); } update(s=>event({...s,requirementsByProject:{...s.requirementsByProject,[pid]:s.requirementsByProject[pid].map(r=>r.id===id?next:r)}},reason?'保留人工答复':'采用评审建议',id,reason||proposal.reviewId));followOwnTask('requirement',id);return true;}catch(e){ console.error('采纳评审建议失败', e); toast(e.message,'error');return false;}}
 function submitRequirement(id){if(!businessAllowed('requirement',id,'submit-requirement')) { return false; } const s=stateRef.current,pid=project.id,row=s.requirementsByProject[pid]?.find(r=>r.id===id);if(s.actorRole!=='SR'||!row?.original?.trim()){toast('请由SR核对客户要求后提交确认','error');return false;}update(s=>event({...s,requirementsByProject:{...s.requirementsByProject,[pid]:s.requirementsByProject[pid].map(r=>r.id===id?{...r,readyForConfirmation:true,status:'待确认'}:r)}},'提交条款确认',id,'应答已提交，技术确认待办已生成'));return true;}
 async function persistSnapshot(incoming){
  const current=stateRef.current,pid=incoming.projectId;
  const previous=current.snapshotsByProject[pid]?.find(row=>row.id===incoming.id);
  try{
   const client=snapshotClient();
   let saved;
   if(previous){
    const actor=current.actorId;
    const side=getRequiredFinalReviewers(previous.finalReview).find(row=>row.actorId===actor)?.side;
    const vote=side==='sr'?incoming.finalReview?.decisions?.sr:incoming.finalReview?.decisions?.technicalByActorId?.[actor];
    if(!vote) { throw new Error('缺少本人最终评审结果'); }
    saved=await client.vote(pid,previous.id,{version:previous.version||1,result:vote.result,reason:vote.reason});
   }else { saved=await client.submit(pid,incoming); }
   update(st=>({...st,snapshotsByProject:{...st.snapshotsByProject,[pid]:[saved,...(st.snapshotsByProject[pid]||[]).filter(row=>row.id!==saved.id)]}}));
   if(saved.historyCandidateCount) { void refreshLibrary(current.projects.find(row=>row.id===pid)?.buId); }
   return saved;
  }catch(error){ console.error('保存项目快照失败', error); toast(error.message,'error');return false;}
 }
 async function configureFinalReview(projectId,input){
  const config=await snapshotClient().configure(projectId,input);
  update(st=>({...st,projects:st.projects.map(row=>row.id===projectId?{...row,approvalConfig:config.approvalConfig,
    technicalReviewSettings:config.technicalReviewSettings}:row)}));
  toast('最终评审配置已保存');
 }
 function onSnapshot(incoming){
  if(databaseBacked) { return persistSnapshot(incoming); }
  const s=stateRef.current,pid=project.id,previous=s.snapshotsByProject[pid]?.find(t=>t.id===incoming.id);
  try{
   let snapshot;
   if(!previous){
    if(!allow('snapshot:submit')) { return false; }
    if(getExportIssues(s.requirementsByProject[pid],s.reviewsByProject[pid],pid).length) { throw new Error('条款确认或未关闭事项检查未通过'); }
    snapshot={...incoming,createdById:s.actorId,createdBy:personName(s,s.actorId),finalReview:getProjectFinalReview(s,pid),status:'审批中'};
    if(!checkSnapshotValidity(snapshot,currentProjectScope(s,pid,snapshot)).valid) { throw new Error('提交范围已变化，请重新核对'); }
   }else if(JSON.stringify(previous.exports||[])!==JSON.stringify(incoming.exports||[])){
    if(!allow('export:download')) { return false; }
    if(!isFinalReviewApproved(previous)||!checkSnapshotValidity(previous,currentProjectScope(s,pid,previous)).valid) { throw new Error('须由SR与技术组完成当前版本评审后才能导出'); }
    snapshot={...previous,exports:incoming.exports,exportedAt:incoming.exportedAt};
   }else{
    if(!businessAllowed('snapshot',incoming.id,'approve',previous.version||1,previous.round||1)) { return false; }
    if(!checkSnapshotValidity(previous,currentProjectScope(s,pid,previous)).valid) { throw new Error('批准范围已变化，请重新提交'); }
    const side=getRequiredFinalReviewers(previous.finalReview).find(r=>r.actorId===s.actorId)?.side;
    const vote=side==='sr'?incoming.finalReview?.decisions?.sr:incoming.finalReview?.decisions?.technicalByActorId?.[s.actorId];
    if(!vote) { throw new Error('缺少本人最终评审结果'); }
    snapshot=applyFinalReviewDecision(previous,{actorId:s.actorId,side,result:vote.result,reason:vote.reason});
   }
   update(st=>event({...st,snapshotsByProject:{...st.snapshotsByProject,[pid]:[snapshot,...(st.snapshotsByProject[pid]||[]).filter(t=>t.id!==snapshot.id)]}},'更新应答快照',snapshot.id,snapshot.status));return true;
  }catch(e){ console.error('提交项目快照失败', e); toast(e.message,'error');return false;}
 }
 function changeProject(patch,options={}){if(databaseBacked) { return unavailable(); } if(!allow('project:manage')) { return false; } try{update(s=>event(updateProjectSettings(s,{projectId:project.id,patch,invalidateTechnical:options.invalidateTechnical}),'更新项目设置',project.id,patch.reason||'项目资料已保存'));return true;}catch(error){ console.error('更新项目设置失败', error); toast(error.message,'error');return false;}}
 function invalidate(ids,reason){if(databaseBacked) { return unavailable(); } if(!allow('project:manage')) { return false; } const pid=project.id;update(s=>event({...s,projects:s.projects.map(p=>p.id===pid?{...p,version:(p.version||1)+1}:p),requirementsByProject:{...s.requirementsByProject,[pid]:(s.requirementsByProject[pid]||[]).map(r=>ids.includes(r.id)?{...r,status:'待确认',version:(r.version||1)+1,reason,confirmedAt:undefined,confirmedBy:undefined}:r)}},'新版本影响核对',pid,`${ids.length} 条要求需重新确认；${reason}`));}
 function applyRevision(incoming,source,reason){if(databaseBacked) { return unavailable(); }
  const current=stateRef.current,pid=project.id;
  if(current.actorRole!=='SR'){toast('请由SR登记客户新版要求','error');return false;}
  try{const result=applyRfqRevision(current.requirementsByProject[pid]||[],incoming,reason,source,project.approvalConfig);if(!result.affectedIds.length){toast('未检测到条款变化');return false;}
   update(s=>event({...s,projects:s.projects.map(p=>p.id===pid?{...p,version:(p.version||1)+1}:p),requirementsByProject:{...s.requirementsByProject,[pid]:result.rows},reviewsByProject:{...s.reviewsByProject,[pid]:(s.reviewsByProject[pid]||[]).map(review=>result.affectedIds.includes(review.requirementId)&&review.status!=='已关闭'?{...refreshReviewForRevision(review,(current.requirementsByProject[pid]||[]).find(row=>row.id===review.requirementId),result.rows.find(row=>row.id===review.requirementId),project.approvalConfig),history:[...(review.history||[]),{time:now(),actor:s.actorRole,action:'客户条款变化，原评审需重新处理',reason}]}:review)}},'新版 RFQ 影响检查',pid,`${result.affectedIds.length} 条要求需重新确认；${reason}`));toast(`新版已应用，${result.affectedIds.length} 条要求需重新确认`);return result;
  }catch(error){ console.error('应用 RFQ 修订失败', error); toast(error.message,'error');return false;}
 }
 function changeMembers(members){if(databaseBacked) { return unavailable(); } if(!allow('project:manage')) { return false; } update(s=>event({...s,membersByProject:{...s.membersByProject,[project.id]:structuredClone(members)}},'调整成员职责',project.id,'当前项目成员与审批配置已更新'));}
 const canBusinessAction=(objectType,objectId,action='save')=>{if(databaseBacked&&!(objectType==='requirement'&&['save','confirm'].includes(action)||objectType==='snapshot'&&action==='approve')) { return false; } try{return assertBusinessAction(state,{projectId:project.id,objectType,objectId,action,route});}catch (error){ console.error('检查业务操作权限失败', error); return false;}};
 const taskContextError=state.tasksById?.[route.taskId]?.objectType==='snapshot'?getTaskContextError(state,route):'';
 const activeBuId=(['knowledge','history','capabilities'].includes(page)&&route.buId)||state.activeBuId||getPersonnelBu(state);
 const permissionContext={state,actorId:state.actorId,buId:activeBuId,...(PROJECT_PAGES.includes(page)?{projectId:project.id}:{} )};
 const libraryRefreshes=useRef(new Map());
 async function refreshLibrary(buId){
  const actor=stateRef.current.actorId, request=Symbol();
  libraryRefreshes.current.set(buId,request);
  try{
   const resources=await loadLibraryResources(buId);
   if(libraryRefreshes.current.get(buId)===request&&stateRef.current.actorId===actor){
    update(current=>({...current,resourcesByBuId:{...current.resourcesByBuId,[buId]:resources}}));
   }
  }finally{
   if(libraryRefreshes.current.get(buId)===request) { libraryRefreshes.current.delete(buId); }
  }
 }
 const roleNavigation=getRoleNavigation(state.actorRole,{state,actorId:state.actorId,buId:activeBuId}),pageAllowed=canAccessPage(state.actorRole,page,permissionContext)&&(!PROJECT_PAGES.includes(page)||canAccessProject(state,state.actorId,project.id));
 const viewState=selectAccessibleState(state,state.actorId),visibleProjects=viewState.projects;
 const scopedAudit=state.audit.filter(e=>state.actorRole==='后台管理'?e.object==='平台'||/平台目录|系统/.test(e.action):state.actorRole==='BU管理员'?e.buId===activeBuId||state.projects.some(p=>p.buId===activeBuId&&String(e.object).includes(p.id)):visibleProjects.some(p=>String(e.object).includes(p.id))||e.actorId===state.actorId);
 async function onAssignConfirmation(projectId,requirementId,request){
  const actorId=stateRef.current.actorId;
  const saved=await assignConfirmation(requirementId,request);
  if(stateRef.current.actorId!==actorId) { return; }
  update(s=>({...s,requirementsByProject:{...s.requirementsByProject,[projectId]:s.requirementsByProject[projectId].map(row=>row.id===requirementId?{...row,confirmationAssigneeId:saved.confirmationAssigneeId,confirmationAssignmentSource:'explicit',backendVersion:saved.version}:row)}}));
  toast('确认人已保存到后端');
 }
 const onPersonnelAction=fn=>{if(databaseBacked) { return unavailable(); } let changed;update(st=>{changed=fn(st);return changed;});toast('人员与规则配置已保存');return true;};
 const sessionUserId=readSession()?.user?.id;
 const identityOptions=Object.values(state.accountsById).filter(a=>a.enabled&&(!databaseBacked||a.id===sessionUserId)).flatMap(a=>[...(a.systemAdmin?[{id:a.id,role:'后台管理',buId:activeBuId}]:[]),...(a.managedBuIds||[]).map(buId=>({id:a.id,role:'BU管理员',buId})),...state.businessUnits.flatMap(b=>{const c=getPersonnelContext(state,a.id,b.id);return c.enabled?c.member.roles.map(role=>({id:a.id,role,buId:b.id})):[]})]);
 const quickAccountOptions=databaseBacked&&import.meta.env?.DEV
  ? databaseAccounts.filter(account=>account.userId!==sessionUserId).map(account=>({value:`account:${account.username}`,label:account.label}))
  : [];
 function receiveDeviation(projectId,item){
  update(current=>{
   const rows=current.reviewsByProject[projectId]||[];
   const previous=rows.find(row=>row.id===item.id);
   if(previous?.version>=item.version) { return current; }
   return {...current,reviewsByProject:{...current.reviewsByProject,[projectId]:[item,...rows.filter(row=>row.id!==item.id)]}};
  });
 }
 const common={sourceReparse,onConfigureFinalReview:configureFinalReview,onReload,onDeviation:receiveDeviation,onLibraryRefresh:refreshLibrary,onSelectBu:buId=>update(st=>({...st,activeBuId:buId})),permissionContext,onPersonnelAction,onAssignConfirmation,route,canBusinessAction,taskContextError,onExportScope:scope=>{if(!canPerform(stateRef.current.actorRole,'export:configure',{state:stateRef.current,actorId:stateRef.current.actorId,projectId:project.id})) { return; } if(JSON.stringify(stateRef.current.exportScopesByProject?.[project.id])!==JSON.stringify(scope)) { update(s=>({...s,exportScopesByProject:{...s.exportScopesByProject,[project.id]:scope}})); }},onAdoptReview:adoptReview,onSubmitRequirement:submitRequirement,onAnalysisRun:analysisRun,actorId:state.actorId,appState:['BU管理员','后台管理'].includes(state.actorRole)?state:viewState,onAppUpdate:databaseBacked?unavailable:update,onTransferProject:transferProject,project,requirements,reviews,snapshots,audit:scopedAudit,members:state.membersByProject?.[project.id]??state.members??[],actorRole:state.actorRole,toast,navigate,logEvent};
 const pages={'bu-admin':<BuAdminPage {...common}/>,projects:<ProjectsPage {...common} onCreateProject={createProject} onOpenProject={openProject} onDeleteProject={deleteProject} onRestoreProject={undoDeleteProject}/>,tasks:<TasksPage {...common} onOpenTask={openTask} onTaskAction={taskAction}/>,dashboard:state.actorRole==='BU管理员'?<BuDashboardPage {...common}/>:<DashboardPage {...common} onOpenTask={openTask} onOpenProject={openProject}/>,response:<ResponsePage {...common} focusedRequirementId={focusedRequirementId} onUpdateRequirement={updateRequirement} onDeleteExtractedRequirement={databaseBacked?deleteExtractedRequirement:undefined} onAddSelection={databaseBacked?addSelectionRequirements:undefined} onConfirm={confirm} onCreateReview={createReview} onUpdateReview={updateReview} onConfirmReviewed={confirmReviewed}/>,reviews:<ReviewsPage {...common} initialReviewId={route.reviewId} onUpdateReview={updateReview} onConfirmReviewed={confirmReviewed}/>,export:<ExportPage {...common} onSnapshot={onSnapshot}/>,knowledge:<KnowledgePage {...common} knowledgeType="standard"/>,history:<HistoryKnowledgePage {...common} seedKnowledge={databaseBacked?[]:KNOWLEDGE}/>,capabilities:<CapabilitiesPage key={activeBuId} {...common}/>,settings:<SettingsPage {...common} embedded={DETAIL_PAGES.includes(page)} onProjectChange={changeProject} onInvalidateRequirements={invalidate} onMembersChange={changeMembers}/>,audit:<AuditPage {...common}/>,admin:<PlatformAdminPage {...common}/>};
 const pending=selectMyTasks(state,{actorId:state.actorId,tab:'pending'}).length;
 const summary=getProjectSummary(state,project.id,state.actorId),activeNav=roleNavigation.find(n=>n.page===page||page==='history'&&n.page==='knowledge')?.key||(ADMIN_PAGES.includes(page)?'admin':PROJECT_PAGES.includes(page)?'projects':page);
 const content=DETAIL_PAGES.includes(page)?<ResponsePage {...common} focusedRequirementId={focusedRequirementId} onUpdateRequirement={updateRequirement} onDeleteExtractedRequirement={databaseBacked?deleteExtractedRequirement:undefined} onAddSelection={databaseBacked?addSelectionRequirements:undefined} onConfirm={confirm} onRestoreConfirmation={restoreConfirmation} onCreateReview={createReview} onUpdateReview={updateReview} onConfirmReviewed={confirmReviewed}/>:pages[page]||<div className="panel panel-body">页面正在接入统一任务数据。</div>;
 const missingProject=PROJECT_PAGES.includes(page)&&!state.projects.some(p=>p.id===(route.projectId||project.id));
 const body=missingProject?<div className="panel panel-body"><h1>项目不存在或已删除</h1><UiButton className="btn btn-primary" onClick={()=>navigate('projects')}>返回我的 RFQ</UiButton></div>:!pageAllowed?<div className="panel panel-body"><h1>当前身份无权访问此页面</h1><p>系统配置由独立管理员维护；业务人员按职责使用对应入口。</p><UiButton className="btn btn-primary" onClick={()=>navigate(homePage)}>{homePage==='admin'?'返回系统配置':'返回工作台'}</UiButton></div>:PROJECT_PAGES.includes(page)?<ProjectWorkspace projectInfoPanel={pages.settings} finalReviewGate={finalReviewGate} canSubmitFinalReview={canPerform(state.actorRole,'snapshot:submit',permissionContext)} canDownload={canPerform(state.actorRole,'export:download',permissionContext)} onLaunchFinalReview={()=>guarded(()=>setFinalReviewOpen(true))} onViewFinalReview={()=>navigate('export',null,{snapshotId:finalReviewGate.snapshot?.id,taskId:undefined,action:'view',returnKey:'response'})} actorRole={state.actorRole} taskContextError={taskContextError} onExitTask={()=>navigate(page,null,{...route,taskId:undefined,action:undefined})} route={route} project={project} summary={summary} task={state.tasksById?.[route.taskId]} onNavigate={key=>navigate(key)} onReturn={()=>navigate(['tasks','export','documents','response'].includes(route.returnKey)?route.returnKey:'projects',null,{returnKey:undefined,taskId:undefined})}>{content}</ProjectWorkspace>:ADMIN_PAGES.includes(page)?<AdminWorkspace onLibraryRefresh={refreshLibrary} onSelectBu={common.onSelectBu} route={route} permissionContext={permissionContext} actorRole={state.actorRole} page={page} onNavigate={navigate}>{content}</AdminWorkspace>:content;
 return <RfqAppLayout navigation={roleNavigation} activeNav={activeNav} icons={icons} collapsed={collapsed} onCollapse={setCollapsed}
 onNavigate={navigate} onHome={()=>navigate(state.actorRole==='后台管理'?homePage:'projects')} onSearch={()=>setGlobalSearch(true)} onHelp={()=>setHelp(true)} pending={pending}
 onRefresh={databaseBacked?()=>guarded(onReload):undefined} actorName={personName(state,state.actorId)} identity={`${state.actorId}|${state.actorRole}|${activeBuId}`}
 identities={[...quickAccountOptions,...identityOptions.map(o=>({value:`${o.id}|${o.role}|${o.buId}`,label:personName(state,o.id)+(!['后台管理','BU管理员'].includes(o.role)?` · ${o.role}`:'')+(o.role==='BU管理员'&&state.accountsById[o.id].managedBuIds.length>1?`（${state.businessUnits.find(b=>b.id===o.buId)?.name}）`:'' )}))]}
 onIdentityChange={value=>{if(value.startsWith('account:')){guarded(async()=>{try{await switchDatabaseAccount(value.slice(8));toast('已切换数据库账号');}catch(error){ console.error('切换数据库账号失败', error); toast(error.message,'error');}});return;}const [id,role,buId]=value.split('|');guarded(()=>{update(st=>event({...st,actorId:id,actorRole:role,activeBuId:buId},'切换当前身份',id,'本机人员模拟'));const dest=canAccessPage(role,pageRef.current)?pageRef.current:role==='后台管理'?'admin':'dashboard';rawNavigate(dest,{...(PROJECT_PAGES.includes(dest)?{projectId:project.id}:{}),taskId:undefined,action:undefined});toast(`已切换为${personName(state,id)} · ${role}`);});}}
 pageTitle={pageTitle} isDetail={DETAIL_PAGES.includes(page)} body={body}
onLogout={logout}
 contentKey={getWorkspaceContentKey({actorId:state.actorId,actorRole:state.actorRole,buId:activeBuId,projectId:project.id,page})}
 footer={<footer className="app-footer"><span>FEP · RFQ 工作空间</span>{!databaseBacked&&canPerform(state.actorRole,'project:manage')&&<UiButton className="text-link" onClick={()=>setReset(true)}><RotateCcw size={12}/>重置数据</UiButton>}</footer>}>
 {reparseProject&&reparseFiles.length>0&&<SourceReparseDialog key={JSON.stringify(reparseTarget)} project={reparseProject} files={reparseFiles} currentFileId={reparseTarget.fileId} onClose={()=>setReparseTarget(null)} onReparse={submitReparse}/>}
 {!missingProject&&pageAllowed&&finalReviewOpen&&canPerform(state.actorRole,'snapshot:submit',permissionContext)&&<ExportPage {...common} onSnapshot={onSnapshot} launchOnly onClose={()=>setFinalReviewOpen(false)} onSubmitted={()=>setFinalReviewOpen(false)}/>}
 <OverlayPresence>{!missingProject&&pageAllowed&&DETAIL_PAGES.includes(page)&&shouldOpenSourceUpload(route,state.actorRole)&&<SourceUploadDialog project={project} files={state.documentsByProject[project.id]||[]} onSubmit={uploadFromDetail} onClose={()=>{const next=getSourceUploadExitRoute(route,false);rawNavigate(next.page,next);}}/>}</OverlayPresence>
 <OverlayPresence>{help&&<Drawer title="从这里开始体验" onClose={()=>setHelp(false)}><div className="guide-intro"><span className="brand-mark">F</span><h2>一次完整的 RFQ 应答流程</h2><p>项目、原件与条款由后端读取。页面按当前登录账号的数据库授权展示。</p></div><div className="flow-steps">{[['projects','新建项目','填写基本信息，明确负责人并关联工艺。'],['response','解析客户 RFQ','上传客户文件，解析完成后直接处理应答项。'],['response','RFQ细则比对','逐条完善应答，必要时邀请评审人共同确认。'],['export','生成并导出','预览条款结果，按原件格式下载带应答批注的正式文档。']].map(([key,title,desc],i)=><button key={key} onClick={()=>{setHelp(false);navigate(key);}}><b>{i+1}</b><span><strong>{title}</strong><small>{desc}</small></span><ArrowRight size={17}/></button>)}</div><div className="inline-notice">顶部只显示当前登录账号已获授权的身份。未接入后端的功能不会提示已保存。</div></Drawer>}</OverlayPresence>
 {reset&&canPerform(state.actorRole,'project:manage')&&<Modal title="重置核心数据" onClose={()=>setReset(false)} footer={<><UiButton className="btn" onClick={()=>setReset(false)}>取消</UiButton><UiButton className="btn btn-primary" onClick={resetDemoData}>重置核心数据</UiButton></>}><p>备份当前本机数据，并恢复为五种状态各一条示例。知识、机型和资料维护中的独立记录继续保留。</p></Modal>}
 <OverlayPresence>{globalSearch&&<Modal title="搜索页面和项目" onClose={()=>setGlobalSearch(false)}><UiInput autoFocus className="input" aria-label="搜索关键词" placeholder="输入页面名、项目名或项目编号" value={search} onChange={e=>setSearch(e.target.value)}/><div className="search-results">{NAV_ITEMS.map(n=>n.key==='dashboard'&&state.actorRole==='BU管理员'?{...n,label:'BU看板'}:n).filter(n=>canAccessPage(state.actorRole,n.key,permissionContext)&&n.label.includes(search)).map(n=><button key={n.key} onClick={()=>{setGlobalSearch(false);navigate(n.key);}}>{n.label}<ChevronRight size={15}/></button>)}{visibleProjects.filter(p=>`${p.name}${p.id}`.includes(search)).map(p=><button key={p.id} onClick={()=>{setGlobalSearch(false);selectProject(p.id,'response');}}>{p.id} · {p.name}<ChevronRight size={15}/></button>)}</div></Modal>}</OverlayPresence>
 </RfqAppLayout>;
}


