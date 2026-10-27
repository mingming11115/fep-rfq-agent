import BuAdminPage,{ProjectPersonnelPanel,PlatformAdminPage} from './pages/BuAdminPage';
import {canAccessProject,getPersonnelContext,personName,getProjectFinalReview,getRequiredFinalReviewers,configureProjectFinalReviewers,assignProjectDuty,getReviewPersonnel} from './personnelDomain';
import {applyFinalReviewDecision,isFinalReviewApproved} from './finalReviewDomain';
import {invalidatePendingSnapshots,currentProjectScope,checkSnapshotValidity} from './snapshotDomain';
import { BHEL_ID } from './bhelDemo';
import {canPerform,assertPermission,assertRequirementPatch,canAccessPage,getRoleNavigation} from './permissions';
import {reconcileTasks,selectMyTasks,applyTaskAction,assertBusinessAction,getTaskContextError,isTaskPending,startTaskForObject,transferBusinessTask,confirmProjectRequirement} from './taskDomain';
import {getProjectSummary,selectAccessibleState} from './projectSelectors';
import {parseWorkRoute,buildWorkRoute,PROJECT_PAGES,ADMIN_PAGES,shouldOpenSourceUpload,getSourceUploadExitRoute} from './navigation';
import {removeProject,restoreProject,addProjectSources,handoverProject} from './projectDomain';
import {readRfqCatalog,resolveRfqProcessBinding} from './rfqProcessBinding';
import SourceUploadDialog from './components/SourceUploadDialog';
import ProjectWorkspace from './components/ProjectWorkspace';
import AdminWorkspace from './components/AdminWorkspace';
import {upgradePrototypeState,actorIdForRole} from './stateMigration';
import React,{useEffect,useRef,useState} from 'react';
import {LayoutDashboard,FolderKanban,Layers3,FileSearch,ListChecks,GitPullRequest,FileOutput,History,Settings,BookOpen,ShieldCheck,SlidersHorizontal,ChevronDown,ChevronRight,PanelLeftClose,PanelLeftOpen,HelpCircle,RotateCcw,CheckCircle2,AlertCircle,X,ArrowRight,Search,Bell,Globe,Users} from 'lucide-react';
import {NAV_ITEMS,PRIMARY_NAV,createDemoState} from './data';
import {applyRequirementEdit,confirmRequirement,importParsedRequirements,correctParsedRequirement,getExportIssues} from './domain';
import {applyRfqRevision,getReviewRoute,refreshReviewForRevision} from './rfqWorkflow';
import {Modal,Drawer} from './components/ui';
import ProjectsPage from './pages/ProjectsPage';
import TasksPage from './pages/TasksPage';
import AnalysisRecordsPage from './pages/AnalysisRecordsPage';
import {applyReviewProposal,assertIndependentApproval,beginReview,reopenReview,requirementAfterReview} from './reviewDomain';
import {appendAnalysisRun} from './analysisDomain';
import DashboardPage from './pages/DashboardPage';
import BuDashboardPage from './pages/BuDashboardPage';
import ResponsePage from './pages/ResponsePage';
import {DocumentsPage,ReviewsPage,ExportPage} from './pages/WorkflowPages';
import {KnowledgePage,CapabilitiesPage} from './pages/ReferencePages';
import {SettingsPage,VersionsPage,AuditPage,AdminPage} from './pages/ManagementPages';

function getPersonnelBu(s){return s.businessUnits?.find(b=>getPersonnelContext(s,s.actorId,b.id).enabled||getPersonnelContext(s,s.actorId,b.id).managed)?.id||s.businessUnits?.[0]?.id;}
const STORAGE='fep-rfq-app-v1';
const DETAIL_PAGES=['response','settings','versions','reviews'];
const icons={tasks:ListChecks,analysis:FileSearch,dashboard:LayoutDashboard,projects:FolderKanban,capabilities:Layers3,documents:FileSearch,response:ListChecks,reviews:GitPullRequest,export:FileOutput,versions:History,settings:Settings,knowledge:BookOpen,history:History,audit:ShieldCheck,admin:SlidersHorizontal,'bu-admin':Users};
const shortLabels={tasks:'任务中心',analysis:'AI 分析记录',projects:'我的 RFQ',dashboard:'工作台',versions:'版本记录',settings:'项目设置',knowledge:'标准回复库',history:'历史 RFQ',admin:'系统配置','bu-admin':'BU管理'};
const validPage=key=>parseWorkRoute('#/'+key).page;
function withProjectMembers(s){return {...s,membersByProject:Object.fromEntries(s.projects.map(p=>[p.id,structuredClone(s.membersByProject?.[p.id]??s.members??[])]))};}
function withProjectDocuments(state){
 const documentsByProject={...state.documentsByProject};
 for(const project of state.projects){if(Array.isArray(documentsByProject[project.id]))continue;try{const saved=JSON.parse(localStorage.getItem(`fep-rfq-documents:${project.id}`)||'null');if(Array.isArray(saved?.files))documentsByProject[project.id]=saved.files;}catch{}}
 return {...state,documentsByProject};
}
function initial(){try{const s=JSON.parse(localStorage.getItem(STORAGE));if(Array.isArray(s?.projects))return reconcileTasks(invalidatePendingSnapshots(upgradePrototypeState(withProjectDocuments(withProjectMembers(s)),createDemoState())));}catch{}return reconcileTasks(upgradePrototypeState(withProjectMembers({...createDemoState(),activeProjectId:BHEL_ID}),createDemoState()));}
const now=()=>new Date().toLocaleString('zh-CN',{hour12:false});
const event=(s,action,object='',detail='',result='成功')=>({...s,audit:[{id:`EVT-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,time:now(),actor:personName(s,s.actorId),actorId:s.actorId,role:s.actorRole,buId:s.activeBuId||s.projects.find(p=>p.id===s.activeProjectId)?.buId,action,object,result,detail},...(s.audit||[])].slice(0,500)});

export default function App(){
 const [state,setState]=useState(initial),stateRef=useRef(state),[page,setPage]=useState(()=>parseWorkRoute(location.hash).page),[collapsed,setCollapsed]=useState(false),[messages,setMessages]=useState([]),[help,setHelp]=useState(false),[reset,setReset]=useState(false),[globalSearch,setGlobalSearch]=useState(false),[search,setSearch]=useState('');
 const [route,setRoute]=useState(()=>parseWorkRoute(location.hash)),routeRef=useRef(route);
 const [focusedRequirementId,setFocusedRequirementId]=useState(()=>route.requirementId||null);
 const timers=useRef([]),pageRef=useRef(page);const update=fn=>{const next=reconcileTasks(invalidatePendingSnapshots(upgradePrototypeState(fn(stateRef.current),createDemoState())));stateRef.current=next;setState(next);};
 const project=state.projects.find(p=>p.id===(route.projectId||state.activeProjectId))||state.projects[0]||{id:'',name:'未选择项目'},requirements=state.requirementsByProject[project.id]||[],reviews=state.reviewsByProject[project.id]||[],snapshots=state.snapshotsByProject[project.id]||[];
 const item=NAV_ITEMS.find(n=>n.key===(page==='reviews'?'response':page)),isProjectPage=item?.section==='项目';
 const pageTitle=DETAIL_PAGES.includes(page)?'RFQ 详情':page==='dashboard'&&state.actorRole==='BU管理员'?'BU看板':shortLabels[page]||item?.label||'工作台';
 useEffect(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{}},[state]);
 useEffect(()=>{const handle=()=>{const next=parseWorkRoute(location.hash);const proceed=()=>{routeRef.current=next;setRoute(next);setPage(next.page);pageRef.current=next.page;if(next.projectId&&stateRef.current.projects.some(p=>p.id===next.projectId))update(s=>({...s,activeProjectId:next.projectId}));setFocusedRequirementId(next.requirementId||null);};if(window.__rfqRequestNavigation&&!window.__rfqRequestNavigation(proceed)){history.replaceState(null,'',buildWorkRoute(routeRef.current));return;}proceed();};window.addEventListener('hashchange',handle);if(routeRef.current.projectId)handle();return()=>{window.removeEventListener('hashchange',handle);timers.current.forEach(clearTimeout);};},[]);
 useEffect(()=>{document.title=`${pageTitle} · FEP RFQ`;window.scrollTo(0,0);},[page,pageTitle]);
 function toast(message,type='success'){const id=Date.now()+Math.random();setMessages(m=>[...m,{id,message,type}]);timers.current.push(setTimeout(()=>setMessages(m=>m.filter(t=>t.id!==id)),4500));}
 function allow(action){try{assertPermission(stateRef.current.actorRole,action,{state:stateRef.current,actorId:stateRef.current.actorId,projectId:action==='project:create'?undefined:stateRef.current.activeProjectId,buId:stateRef.current.activeBuId||stateRef.current.projects.find(p=>p.id===stateRef.current.activeProjectId)?.buId});return true;}catch(error){toast(error.message,'error');return false;}}
 function resetDemoData(){
  if(!allow('project:manage'))return;
  const demo=createDemoState(),ids=new Set([...stateRef.current.projects,...demo.projects].map(p=>p.id));
  const related={};
  try{
   for(const id of ids)for(const key of [`fep-rfq-documents:${id}`,`fep-rfq-export-history:${id}`])related[key]=localStorage.getItem(key);
   localStorage.setItem('fep-rfq-demo-before-reset',JSON.stringify({savedAt:new Date().toISOString(),state:stateRef.current,related}));
  }catch{toast('本机演示数据备份失败，请释放浏览器存储后重试','error');return;}
  for(const p of demo.projects){localStorage.removeItem(`fep-rfq-documents:${p.id}`);localStorage.removeItem(`fep-rfq-export-history:${p.id}`);sessionStorage.removeItem(`rfq.export.settings.${p.id}`);}
  delete window.__rfqRequestNavigation;
  update(()=>withProjectMembers({...demo,activeProjectId:'RFQ-001'}));setReset(false);rawNavigate('projects');toast('已备份原数据，看板已恢复为五种状态各一条示例');
 }
 function rawNavigate(key,details={}){const next={page:validPage(key),...(PROJECT_PAGES.includes(key)?{projectId:stateRef.current.activeProjectId||project.id}:{}),...details};routeRef.current=next;setRoute(next);setPage(next.page);pageRef.current=next.page;setFocusedRequirementId(next.requirementId||null);history.pushState(null,'',buildWorkRoute(next));}
 function guarded(action){if(window.__rfqRequestNavigation&&!window.__rfqRequestNavigation(action))return;action();}
 function navigate(key,requirementId,details={}){guarded(()=>{const current=routeRef.current;const context=PROJECT_PAGES.includes(key)&&current.projectId===stateRef.current.activeProjectId?{taskId:current.taskId,action:current.action,returnKey:current.returnKey}:{};rawNavigate(key,{...context,...(requirementId?{requirementId}:{}),...details});});}
 function selectProject(id,destination='response',details={}){guarded(()=>{update(s=>({...s,activeProjectId:id}));rawNavigate(destination,{projectId:id,returnKey:'projects',...details});});}
 function taskAction(id,action){const s=stateRef.current,t=s.tasksById[id];try{if(action.type==='transfer'){update(st=>event(transferBusinessTask(st,{taskId:id,to:action.to,reason:action.reason}),'转办任务',id,action.reason));return true;}const next=applyTaskAction(t,{...action,actorId:s.actorId,objectVersion:t?.objectVersion,at:new Date().toISOString()},s);update(s=>event({...s,tasksById:{...s.tasksById,[id]:next}},action.type==='transfer'?'转办任务':'接手任务',id,action.reason||''));return true;}catch(e){toast(e.message,'error');return false;}}
 function openTask(task,mode='view',returnKey='tasks'){guarded(()=>{const t=stateRef.current.tasksById[task.id];if(!t||!canAccessProject(stateRef.current,stateRef.current.actorId,t.projectId)){toast('任务不存在，请刷新后查看','error');return;}if(mode==='start'&&!taskAction(t.id,{type:'start'}))return;update(s=>({...s,activeProjectId:t.projectId}));rawNavigate(t.objectType==='requirement'||t.kind==='response-revise'?'response':t.objectType==='review'?'reviews':'export',{projectId:t.projectId,requirementId:t.requirementId,reviewId:t.reviewId,snapshotId:t.snapshotId,taskId:t.id,action:mode,returnKey});});}
 function openProject(id,mode='view',details={}){if(mode==='continue'){const task=selectMyTasks(stateRef.current,{actorId:stateRef.current.actorId,projectId:id})[0];if(task){openTask(task,'start','projects');return;}}selectProject(id,['documents','settings','versions'].includes(mode)?mode:mode==='view'?'settings':'response',details);}
 function deleteProject(id){try{update(s=>event(removeProject(s,id),'删除项目',id,'项目及相关待办已移出，可撤销删除'));toast('项目已删除，可在列表中撤销');return true;}catch(error){toast(error.message,'error');return false;}}
 function undoDeleteProject(id){try{update(s=>event(restoreProject(s,id),'撤销删除项目',id,'项目及相关工作记录已恢复'));toast('项目已恢复');return true;}catch(error){toast(error.message,'error');return false;}}
 function uploadFromDetail(incoming){
  if(!allow('source:manage'))return false;
  const pid=routeRef.current.projectId||stateRef.current.activeProjectId;
  try{update(s=>event(addProjectSources(s,pid,incoming),'上传资料元数据',pid,`${incoming.length} 个文件已进入模拟解析队列`));}catch(error){toast(error.message,'error');return false;}
  const next=getSourceUploadExitRoute(routeRef.current,true);rawNavigate(next.page,next);toast('文件已进入模拟解析队列');return true;
 }
 function transferProject(id,to,reason){try{update(st=>event(handoverProject(st,{projectId:id,to,reason}),'移交项目负责人',id,reason));return true;}catch(e){toast(e.message,'error');return false;}}
 function analysisRun(run){update(s=>({...s,analysisRuns:appendAnalysisRun(s.analysisRuns,{...run,projectId:project.id})}));}
 const logEvent=(action,object='',detail='')=>update(s=>event(s,action,object,detail));
 function createProject(form){
  const current=stateRef.current,buId=current.activeBuId||getPersonnelBu(current),context={state:current,actorId:current.actorId,buId};
  try{
   assertPermission(current.actorRole,'project:create',context);
   if(['name','equipment','owner','deadline'].some(key=>!form[key]?.trim()))throw new Error('请填写项目名称、设备范围、负责人和截止时间');
   const catalog=readRfqCatalog(localStorage,context),binding=resolveRfqProcessBinding({...catalog,buId,modelId:form.modelId,processId:form.processId});
   const id=`RFQ-${String(Math.max(0,...[...current.projects,...Object.values(current.deletedProjectsById||{}).map(record=>record.project)].map(p=>Number(p.id.match(/\d+$/)?.[0]||0)))+1).padStart(3,'0')}`;
   const p={...form,...binding,id,createdById:current.actorId,ownerId:current.actorId,buId,participantIds:[current.actorId],approvalConfig:{finalReviewers:{srId:current.actorId,technicalIds:[],technicalRepresentativeId:null}},createdAt:new Date().toISOString(),name:form.name.trim(),equipment:form.equipment.trim(),owner:form.owner.trim(),version:1};
   update(s=>event({...s,projects:[p,...s.projects],activeProjectId:id,membersByProject:{...s.membersByProject,[id]:structuredClone(s.members||[])},requirementsByProject:{...s.requirementsByProject,[id]:[]},reviewsByProject:{...s.reviewsByProject,[id]:[]},snapshotsByProject:{...s.snapshotsByProject,[id]:[]}},'创建项目',id,`${p.name} · ${p.modelName} ${p.modelRevision} / ${p.processCode} ${p.processName}`));
   toast('项目已关联工艺，请上传资料或载入示例 RFQ');rawNavigate('documents');return true;
  }catch(error){toast(error.message,'error');return false;}
 }
 function businessAllowed(objectType,objectId,action='save',expectedVersion,expectedRound){try{assertBusinessAction(stateRef.current,{projectId:stateRef.current.activeProjectId,objectType,objectId,action,route:routeRef.current,expectedVersion,expectedRound});return true;}catch(e){toast(e.message,'error');return false;}}
 function followOwnTask(objectType,objectId){const current=routeRef.current;if(!current.taskId)return;const t=Object.values(stateRef.current.tasksById).find(t=>t.projectId===current.projectId&&t.objectType===objectType&&t.objectId===objectId&&t.assigneeId===stateRef.current.actorId&&isTaskPending(t));if(t&&t.id!==current.taskId)rawNavigate(current.page,{...current,taskId:t.id});}
 function markSaved(s,objectType,objectId){return startTaskForObject(s,{projectId:s.activeProjectId,objectType,objectId,actorId:s.actorId});}
 function updateRequirement(id,patch,expectedVersion){if(!businessAllowed('requirement',id,'save',expectedVersion))return false;const s=stateRef.current,pid=s.activeProjectId||project.id,row=s.requirementsByProject[pid]?.find(r=>r.id===id);if(!row){toast('找不到该要求，请刷新后重试','error');return false;}try{assertRequirementPatch(s.actorRole,row,patch,{state:s,actorId:s.actorId,projectId:pid,requirementId:id});}catch(error){toast(error.message,'error');return false;}const edited=applyRequirementEdit(row,patch);update(s=>markSaved(event({...s,requirementsByProject:{...s.requirementsByProject,[pid]:s.requirementsByProject[pid].map(r=>r.id===id?edited:r)}},'保存应答草稿',`${pid} · ${row.clause}`,row.status==='已确认'&&edited.status!=='已确认'?'内容变更，原确认已失效':'草稿已保存'),'requirement',id));followOwnTask('requirement',id);return true;}
 function confirm(id,expectedVersion){try{update(st=>event(confirmProjectRequirement(st,{projectId:project.id,requirementId:id,expectedVersion,route:routeRef.current}),'确认要求',`${project.id} · ${id}`,'按当前人员资格和条款分派确认'));return true;}catch(e){toast(e.message,'error');return false;}}
 function importRows(rows){if(!allow('source:manage'))return false;const pid=project.id;update(s=>{const existing=s.requirementsByProject[pid]||[];const merged=importParsedRequirements(existing,rows.map(row=>({...row,confirmationAssigneeId:row.confirmationAssigneeId||project.approvalConfig?.finalReviewers?.technicalIds?.[0]})));if(merged.length===existing.length)return s;return event({...s,requirementsByProject:{...s.requirementsByProject,[pid]:merged}},'自动解析并匹配',pid,`自动导入 ${merged.length-existing.length} 条要求，保留已有应答`);});}
 function correctExtraction(parsedRow,patch,reason){
  if(!allow('source:manage'))return '当前身份无来源修正权限';
  const current=stateRef.current,pid=project.id,row=current.requirementsByProject[pid]?.find(r=>r.id===parsedRow.id);
  if(!row)return '条款仍在同步，请稍后重试';
  try{const corrected=correctParsedRequirement(row,patch,reason);if(corrected===row)return row;
   const next={...corrected,sourceOriginal:parsedRow.sourceOriginal??corrected.sourceOriginal,source:parsedRow.source,sourceFileId:parsedRow.sourceFileId,sourceVersion:parsedRow.sourceVersion};
   if(row.category!==next.category)next.owner=getReviewRoute(next,project.approvalConfig).owner;
   update(s=>event({...s,requirementsByProject:{...s.requirementsByProject,[pid]:s.requirementsByProject[pid].map(r=>r.id===row.id?next:r)},reviewsByProject:{...s.reviewsByProject,[pid]:(s.reviewsByProject[pid]||[]).map(review=>review.requirementId===row.id&&review.status!=='已关闭'?{...refreshReviewForRevision(review,row,next,project.approvalConfig),history:[...(review.history||[]),{time:now(),actor:s.actorRole,action:'抽取字段已修正，重新复核',reason}]}:review)}},'修正解析字段',`${pid} · ${next.clause}`,reason));
   toast('字段已同步，原答复保留，条款需重新复核');return next;
  }catch(error){return error.message;}
 }
 function createReview(value){if(!businessAllowed('requirement',value.requirementId,'save',value.requirementVersion))return false;const pid=project.id;const existing=(stateRef.current.reviewsByProject[pid]||[]).find(r=>r.requirementId===value.requirementId&&(r.kind||'review')===(value.kind||'review')&&!['已关闭','已取消'].includes(r.status));if(existing){toast(`该条已有未关闭事项 ${existing.id}，请继续处理原事项`);return existing.id;}const requirement=stateRef.current.requirementsByProject[pid]?.find(r=>r.id===value.requirementId);let personnel={};try{if(value.kind!=='clarification')personnel=getReviewPersonnel(stateRef.current,pid,requirement.id);}catch(e){toast(e.message,'error');return false;}const routing=getReviewRoute(requirement,project.approvalConfig);const started=beginReview(requirement,{...value,routing,version:1,round:1,id:value.id||`DEV-${crypto.randomUUID()}`,status:'待处理',history:[{time:now(),actor:stateRef.current.actorRole,action:value.kind==='clarification'?'建立客户澄清并分派SR跟进':'建立专项评审并分派技术处理'}]});const review={...started.review,owner:value.kind==='clarification'?'SR':'技术',ownerId:value.kind==='clarification'?project.ownerId:personnel.ownerId,approverId:personnel.approverId};update(s=>event({...s,reviewsByProject:{...s.reviewsByProject,[pid]:[review,...(s.reviewsByProject[pid]||[])]},requirementsByProject:{...s.requirementsByProject,[pid]:(s.requirementsByProject[pid]||[]).map(r=>r.id===review.requirementId?started.requirement:r)}},value.kind==='clarification'?'发起客户澄清':'发起专项评审',review.id,review.title));toast(value.kind==='clarification'?'已创建客户澄清事项':'已创建专项评审事项');return review.id;}
 function updateReview(id,patch,expectedVersion,expectedRound){const s=stateRef.current,pid=project.id,review=s.reviewsByProject[pid]?.find(r=>r.id===id);if(!review)return false;
  if(patch.ownerId){const c=getPersonnelContext(s,patch.ownerId,project.buId);if(!c.enabled||!c.member.roles.includes(review.kind==='clarification'?'SR':'技术')||!canAccessProject(s,patch.ownerId,pid)){toast('接收人没有对应业务资格或项目授权','error');return false;}}
  const communicationOnly=Object.keys(patch).some(key=>['customerCommunication','acceptanceResult'].includes(key))&&Object.keys(patch).every(key=>['customerCommunication','acceptanceResult','history'].includes(key));
  const action=communicationOnly?'communicate':review.status==='已关闭'&&patch.status&&!['已关闭','已取消'].includes(patch.status)?'reopen':patch.status==='已关闭'&&review.kind!=='clarification'?'approve':patch.status==='已退回'?'reject':'save';if(!businessAllowed('review',id,action,expectedVersion,expectedRound))return false;
  if(patch.status==='已关闭'&&review.kind!=='clarification'){try{assertIndependentApproval(review,{id:s.actorId,role:s.actorRole},{state:s,actorId:s.actorId,projectId:pid});}catch(e){toast(e.message,'error');return false;}}
  let next={...review,...patch};
  if(review.status==='已关闭'&&!['已关闭','已取消'].includes(next.status)){
    if(s.reviewsByProject[pid].some(r=>r.id!==id&&r.requirementId===review.requirementId&&(r.kind||'review')===(review.kind||'review')&&!['已关闭','已取消'].includes(r.status))){toast('该条款已有进行中的评审，请先处理当前事项','error');return false;}
    try{next=reopenReview(review,{reason:patch.reason,owner:patch.owner||review.owner,deadline:patch.deadline||review.deadline,actor:{id:s.actorId,role:s.actorRole}});next.ownerId=patch.ownerId||review.ownerId;}catch(error){toast(error.message,'error');return false;}
  }
  const req=s.requirementsByProject[pid]?.find(r=>r.id===review.requirementId);
  update(s=>markSaved(event({...s,reviewsByProject:{...s.reviewsByProject,[pid]:s.reviewsByProject[pid].map(r=>r.id===id?next:r)},requirementsByProject:{...s.requirementsByProject,[pid]:s.requirementsByProject[pid].map(r=>{if(r.id!==req?.id)return r;const updated=requirementAfterReview(r,review,next);return s.reviewsByProject[pid].some(other=>other.id!==id&&other.requirementId===r.id&&!['已关闭','已取消'].includes(other.status))?{...updated,status:'评审中'}:updated;})}},'更新评审事项',id,patch.status||'保存处理信息'),'review',id));return next;
 }
 function confirmReviewed(){/* Reopening a review marks its requirement for recheck in updateReview. */}
 function adoptReview(id,proposal,reason){if(!businessAllowed('requirement',id,'adopt',proposal.baseVersion))return false;const s=stateRef.current,pid=project.id,row=s.requirementsByProject[pid]?.find(r=>r.id===id);try{let next;if(reason){next={...row,pendingReviewProposal:null,needsReview:true,status:'待确认',confirmationReason:'已保留人工答复，请确认本版应答。',reason,proposalHistory:[...(row.proposalHistory||[]),{reviewId:proposal.reviewId,action:'保留人工答复',reason,actorId:s.actorId}]};}else next=applyReviewProposal(row,proposal,{expectedVersion:row.version||1,actor:{id:s.actorId,role:s.actorRole}});update(s=>event({...s,requirementsByProject:{...s.requirementsByProject,[pid]:s.requirementsByProject[pid].map(r=>r.id===id?next:r)}},reason?'保留人工答复':'采用评审建议',id,reason||proposal.reviewId));followOwnTask('requirement',id);return true;}catch(e){toast(e.message,'error');return false;}}
 function submitRequirement(id){if(!businessAllowed('requirement',id,'submit-requirement'))return false;const s=stateRef.current,pid=project.id,row=s.requirementsByProject[pid]?.find(r=>r.id===id);if(s.actorRole!=='SR'||!row?.original?.trim()){toast('请由SR核对客户要求后提交确认','error');return false;}update(s=>event({...s,requirementsByProject:{...s.requirementsByProject,[pid]:s.requirementsByProject[pid].map(r=>r.id===id?{...r,readyForConfirmation:true,status:'待确认'}:r)}},'提交条款确认',id,'应答已提交，技术确认待办已生成'));return true;}
 function onSnapshot(incoming){
  const s=stateRef.current,pid=project.id,previous=s.snapshotsByProject[pid]?.find(t=>t.id===incoming.id);
  try{
   let snapshot;
   if(!previous){
    if(!allow('snapshot:submit'))return false;
    if(getExportIssues(s.requirementsByProject[pid],s.reviewsByProject[pid]).length)throw new Error('条款确认或未关闭事项检查未通过');
    snapshot={...incoming,createdById:s.actorId,createdBy:personName(s,s.actorId),finalReview:getProjectFinalReview(s,pid),status:'审批中'};
    if(!checkSnapshotValidity(snapshot,currentProjectScope(s,pid,snapshot)).valid)throw new Error('提交范围已变化，请重新核对');
   }else if(JSON.stringify(previous.exports||[])!==JSON.stringify(incoming.exports||[])){
    if(!allow('export:download'))return false;
    if(!isFinalReviewApproved(previous)||!checkSnapshotValidity(previous,currentProjectScope(s,pid,previous)).valid)throw new Error('须由SR与技术组完成当前版本评审后才能导出');
    snapshot={...previous,exports:incoming.exports,exportedAt:incoming.exportedAt};
   }else{
    if(!businessAllowed('snapshot',incoming.id,'approve',previous.version||1,previous.round||1))return false;
    if(!checkSnapshotValidity(previous,currentProjectScope(s,pid,previous)).valid)throw new Error('批准范围已变化，请重新提交');
    const side=getRequiredFinalReviewers(previous.finalReview).find(r=>r.actorId===s.actorId)?.side;
    const vote=side==='sr'?incoming.finalReview?.decisions?.sr:incoming.finalReview?.decisions?.technicalByActorId?.[s.actorId];
    if(!vote)throw new Error('缺少本人最终评审结果');
    snapshot=applyFinalReviewDecision(previous,{actorId:s.actorId,side,result:vote.result,reason:vote.reason});
   }
   update(st=>event({...st,snapshotsByProject:{...st.snapshotsByProject,[pid]:[snapshot,...(st.snapshotsByProject[pid]||[]).filter(t=>t.id!==snapshot.id)]}},'更新应答快照',snapshot.id,snapshot.status));return true;
  }catch(e){toast(e.message,'error');return false;}
 }
 function changeProject(patch){if(!allow('project:manage'))return false;if(Object.keys(patch).some(k=>!['name','customer','owner','deadline','equipment','reason'].includes(k))){toast('人员与评审配置请使用项目人员分派入口','error');return false;}update(s=>event({...s,projects:s.projects.map(p=>p.id===project.id?{...p,...patch}:p)},'更新项目设置',project.id,patch.reason||'项目资料已保存'));}
 function invalidate(ids,reason){if(!allow('project:manage'))return false;const pid=project.id;update(s=>event({...s,projects:s.projects.map(p=>p.id===pid?{...p,version:(p.version||1)+1}:p),requirementsByProject:{...s.requirementsByProject,[pid]:(s.requirementsByProject[pid]||[]).map(r=>ids.includes(r.id)?{...r,status:'待确认',version:(r.version||1)+1,reason,confirmedAt:undefined,confirmedBy:undefined}:r)}},'新版本影响核对',pid,`${ids.length} 条要求需重新确认；${reason}`));}
 function applyRevision(incoming,source,reason){
  const current=stateRef.current,pid=project.id;
  if(current.actorRole!=='SR'){toast('请由SR登记客户新版要求','error');return false;}
  try{const result=applyRfqRevision(current.requirementsByProject[pid]||[],incoming,reason,source,project.approvalConfig);if(!result.affectedIds.length){toast('未检测到条款变化');return false;}
   update(s=>event({...s,projects:s.projects.map(p=>p.id===pid?{...p,version:(p.version||1)+1}:p),requirementsByProject:{...s.requirementsByProject,[pid]:result.rows},reviewsByProject:{...s.reviewsByProject,[pid]:(s.reviewsByProject[pid]||[]).map(review=>result.affectedIds.includes(review.requirementId)&&review.status!=='已关闭'?{...refreshReviewForRevision(review,(current.requirementsByProject[pid]||[]).find(row=>row.id===review.requirementId),result.rows.find(row=>row.id===review.requirementId),project.approvalConfig),history:[...(review.history||[]),{time:now(),actor:s.actorRole,action:'客户条款变化，原评审需重新处理',reason}]}:review)}},'新版 RFQ 影响检查',pid,`${result.affectedIds.length} 条要求需重新确认；${reason}`));toast(`新版已应用，${result.affectedIds.length} 条要求需重新确认`);return result;
  }catch(error){toast(error.message,'error');return false;}
 }
 function changeMembers(members){if(!allow('project:manage'))return false;update(s=>event({...s,membersByProject:{...s.membersByProject,[project.id]:structuredClone(members)}},'调整成员职责',project.id,'当前项目成员与审批配置已更新'));}
 const canBusinessAction=(objectType,objectId,action='save')=>{try{return assertBusinessAction(state,{projectId:project.id,objectType,objectId,action,route});}catch{return false;}};
 const taskContextError=getTaskContextError(state,route);
 const activeBuId=state.activeBuId||getPersonnelBu(state);
 const permissionContext={state,actorId:state.actorId,buId:activeBuId,...(PROJECT_PAGES.includes(page)?{projectId:project.id}:{} )};
 const roleNavigation=getRoleNavigation(state.actorRole,{state,actorId:state.actorId,buId:activeBuId}),pageAllowed=canAccessPage(state.actorRole,page,permissionContext)&&(!PROJECT_PAGES.includes(page)||canAccessProject(state,state.actorId,project.id));
 const viewState=selectAccessibleState(state,state.actorId),visibleProjects=viewState.projects;
 const scopedAudit=state.audit.filter(e=>state.actorRole==='后台管理'?e.object==='平台'||/平台目录|系统/.test(e.action):state.actorRole==='BU管理员'?e.buId===activeBuId||state.projects.some(p=>p.buId===activeBuId&&String(e.object).includes(p.id)):visibleProjects.some(p=>String(e.object).includes(p.id))||e.actorId===state.actorId);
 const onPersonnelAction=fn=>{let changed;update(st=>{changed=fn(st);return changed;});toast('人员与规则配置已保存');return true;};
 const identityOptions=Object.values(state.accountsById).filter(a=>a.enabled).flatMap(a=>[...(a.systemAdmin?[{id:a.id,role:'后台管理',buId:activeBuId}]:[]),...(a.managedBuIds||[]).map(buId=>({id:a.id,role:'BU管理员',buId})),...state.businessUnits.flatMap(b=>{const c=getPersonnelContext(state,a.id,b.id);return c.enabled?c.member.roles.map(role=>({id:a.id,role,buId:b.id})):[]})]);
 const common={onSelectBu:buId=>update(st=>({...st,activeBuId:buId})),permissionContext,onPersonnelAction,route,canBusinessAction,taskContextError,onFilesChange:(projectId,files)=>{if(!canPerform(stateRef.current.actorRole,'source:manage',{state:stateRef.current,actorId:stateRef.current.actorId,projectId}))return;if(JSON.stringify(stateRef.current.documentsByProject?.[projectId])!==JSON.stringify(files))update(s=>({...s,documentsByProject:{...s.documentsByProject,[projectId]:files}}));},onExportScope:scope=>{if(!canPerform(stateRef.current.actorRole,'export:configure',{state:stateRef.current,actorId:stateRef.current.actorId,projectId:project.id}))return;if(JSON.stringify(stateRef.current.exportScopesByProject?.[project.id])!==JSON.stringify(scope))update(s=>({...s,exportScopesByProject:{...s.exportScopesByProject,[project.id]:scope}}));},onAdoptReview:adoptReview,onSubmitRequirement:submitRequirement,onAnalysisRun:analysisRun,actorId:state.actorId,appState:['BU管理员','后台管理'].includes(state.actorRole)?state:viewState,onAppUpdate:update,onTransferProject:transferProject,project,requirements,reviews,snapshots,audit:scopedAudit,members:state.membersByProject?.[project.id]??state.members??[],actorRole:state.actorRole,toast,navigate,logEvent};
 const pages={'bu-admin':<BuAdminPage {...common}/>,projects:<ProjectsPage {...common} onCreateProject={createProject} onOpenProject={openProject} onDeleteProject={deleteProject} onRestoreProject={undoDeleteProject}/>,tasks:<TasksPage {...common} onOpenTask={openTask} onTaskAction={taskAction}/>,analysis:<AnalysisRecordsPage {...common} onOpenProject={selectProject}/>,dashboard:state.actorRole==='BU管理员'?<BuDashboardPage {...common}/>:<DashboardPage {...common} onOpenTask={openTask} onOpenProject={openProject}/>,documents:<DocumentsPage {...common} focusedRequirementId={focusedRequirementId} onImport={importRows} onCorrect={correctExtraction}/>,response:<ResponsePage {...common} focusedRequirementId={focusedRequirementId} onUpdateRequirement={updateRequirement} onConfirm={confirm} onCreateReview={createReview} onUpdateReview={updateReview} onConfirmReviewed={confirmReviewed}/>,reviews:<ReviewsPage {...common} initialReviewId={route.reviewId} onUpdateReview={updateReview} onConfirmReviewed={confirmReviewed}/>,export:<ExportPage {...common} onSnapshot={onSnapshot}/>,knowledge:<KnowledgePage {...common} knowledgeType="standard"/>,history:<KnowledgePage {...common} knowledgeType="history"/>,capabilities:<CapabilitiesPage key={activeBuId} {...common}/>,settings:<SettingsPage {...common} onProjectChange={changeProject} onInvalidateRequirements={invalidate} onMembersChange={changeMembers}/>,versions:<VersionsPage {...common} onApplyRevision={applyRevision} onInvalidateRequirements={invalidate}/>,audit:<AuditPage {...common}/>,admin:<PlatformAdminPage {...common}/>};
 const pending=selectMyTasks(state,{actorId:state.actorId,tab:'pending'}).length;
 const summary=getProjectSummary(state,project.id,state.actorId),activeNav=ADMIN_PAGES.includes(page)?'admin':PROJECT_PAGES.includes(page)?'projects':page;
 const content=DETAIL_PAGES.includes(page)?<ResponsePage {...common} focusedRequirementId={focusedRequirementId} onUpdateRequirement={updateRequirement} onConfirm={confirm} onCreateReview={createReview} onUpdateReview={updateReview} onConfirmReviewed={confirmReviewed} detailPanels={{settings:pages.settings,reviews:pages.reviews,versions:pages.versions}}/>:pages[page]||<div className="panel panel-body">页面正在接入统一任务数据。</div>;
 const missingProject=PROJECT_PAGES.includes(page)&&!state.projects.some(p=>p.id===(route.projectId||project.id));
 const body=missingProject?<div className="panel panel-body"><h1>项目不存在或已删除</h1><button className="btn btn-primary" onClick={()=>navigate('projects')}>返回我的 RFQ</button></div>:!pageAllowed?<div className="panel panel-body"><h1>当前身份无权访问此页面</h1><p>系统配置由独立管理员维护；业务人员按职责使用对应入口。</p><button className="btn btn-primary" onClick={()=>navigate('dashboard')}>返回工作台</button></div>:PROJECT_PAGES.includes(page)?<ProjectWorkspace actorRole={state.actorRole} taskContextError={taskContextError} onExitTask={()=>navigate(page,null,{...route,taskId:undefined,action:undefined})} route={route} project={project} summary={summary} task={state.tasksById?.[route.taskId]} onNavigate={key=>navigate(key)} onReturn={()=>navigate(['tasks','export','documents'].includes(route.returnKey)?route.returnKey:'projects',null,{returnKey:undefined,taskId:undefined})}>{content}</ProjectWorkspace>:ADMIN_PAGES.includes(page)?<AdminWorkspace permissionContext={permissionContext} actorRole={state.actorRole} page={page} onNavigate={navigate}>{content}</AdminWorkspace>:content;
 return <div className={`app ${collapsed?'is-collapsed':''}`}><header className="app-header"><button className="brand" onClick={()=>navigate('projects')} aria-label="FEP RFQ 首页"><span className="brand-mark">F</span><strong>FEP RFQ</strong><span className="brand-subtitle">SR应答工作空间</span></button><div className="header-tools"><span className="saved-indicator">本机交互演示</span><button className="icon-btn" title="搜索页面和项目" aria-label="搜索页面和项目" onClick={()=>setGlobalSearch(true)}><Search size={18}/></button><button className="icon-btn" title="使用指南" aria-label="使用指南" onClick={()=>setHelp(true)}><HelpCircle size={18}/></button><button className="icon-btn" title="待办事项" aria-label="待办事项" onClick={()=>navigate('tasks')}><Bell size={18}/>{pending>0&&<i className="notification-dot"/>}</button><span className="header-divider"/><label className="role-switch"><span className="avatar">{personName(state,state.actorId)[0]}</span><select aria-label="演示身份" value={`${state.actorId}|${state.actorRole}|${activeBuId}`} onChange={e=>{const [id,role,buId]=e.target.value.split('|');guarded(()=>{update(st=>event({...st,actorId:id,actorRole:role,activeBuId:buId},'切换演示身份',id,'本机人员模拟'));const dest=canAccessPage(role,pageRef.current)?pageRef.current:'dashboard';rawNavigate(dest,{...(PROJECT_PAGES.includes(dest)?{projectId:project.id}:{}),taskId:undefined,action:undefined});toast(`已切换为${personName(state,id)} · ${role}`);});}}>{identityOptions.map(o=><option key={`${o.id}|${o.role}|${o.buId}`} value={`${o.id}|${o.role}|${o.buId}`}>{personName(state,o.id)} · {o.role}{o.role==='BU管理员'&&state.accountsById[o.id].managedBuIds.length>1?` · ${state.businessUnits.find(b=>b.id===o.buId)?.name}`:''}</option>)}</select></label></div></header>
 <aside className="sidebar"><div className="sidebar-inner"><div className="nav-section-label">工作空间</div>{roleNavigation.map(n=>{const Icon=n.page==='knowledge'?BookOpen:icons[n.key];return <button title={n.label} data-testid={`nav-${n.key}`} className={`nav-item ${activeNav===n.key?'active':''}`} key={n.key} onClick={()=>navigate(n.page)} aria-current={activeNav===n.key?'page':undefined}><Icon size={18}/><span>{n.label}</span>{n.key==='tasks'&&pending>0&&<b className="nav-count">{pending}</b>}</button>;})}</div><div className="sidebar-bottom"><span>交互原型 · 示例匹配</span><button className="icon-btn" aria-label="切换侧栏" onClick={()=>setCollapsed(!collapsed)}>{collapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</button></div></aside>
 <main className="main"><div className="breadcrumb"><span>工作空间</span><ChevronRight size={13}/><span>{pageTitle}</span></div><div className="page-content" key={`${state.actorId}-${state.actorRole}-${activeBuId}-${DETAIL_PAGES.includes(page)?'detail':['knowledge','history'].includes(page)?'knowledge':page}-${project.id}`}>{body}</div><footer className="app-footer"><span>FEP RFQ · 让每一条应答都有依据</span>{canPerform(state.actorRole,'project:manage')&&<button className="text-link" onClick={()=>setReset(true)}><RotateCcw size={12}/>重置演示</button>}</footer></main>
 <div className="toast-stack" aria-live="polite">{messages.map(t=><div key={t.id} className={`toast ${t.type==='error'?'toast-error':''}`}>{t.type==='error'?<AlertCircle size={18}/>:<CheckCircle2 size={18}/>}<span>{t.message}</span><button className="icon-btn" aria-label="关闭提示" onClick={()=>setMessages(m=>m.filter(x=>x.id!==t.id))}><X size={14}/></button></div>)}</div>
 {!missingProject&&pageAllowed&&DETAIL_PAGES.includes(page)&&shouldOpenSourceUpload(route,state.actorRole)&&<SourceUploadDialog project={project} files={state.documentsByProject[project.id]||[]} onSubmit={uploadFromDetail} onClose={()=>{const next=getSourceUploadExitRoute(route,false);rawNavigate(next.page,next);}}/>}
 {help&&<Drawer title="从这里开始体验" onClose={()=>setHelp(false)}><div className="guide-intro"><span className="brand-mark">F</span><h2>一次完整的 RFQ 应答流程</h2><p>所有页面均可点击。默认案例使用真实BHEL RFQ，供应商应答与评审为演示设定。浏览器会保存你的操作进展。</p></div><div className="flow-steps">{[['projects','新建项目','填写基本信息，明确负责人和设备范围。'],['documents','解析客户 RFQ','上传文件元数据，或载入示例，解析后自动进入工作台。'],['response','RFQ细则比对','逐条完善应答，并在偏离处理页签完成方案与批准。'],['export','生成并导出','内部草稿随时下载；正式版需独立批准快照。']].map(([key,title,desc],i)=><button key={key} onClick={()=>{setHelp(false);navigate(key);}}><b>{i+1}</b><span><strong>{title}</strong><small>{desc}</small></span><ArrowRight size={17}/></button>)}</div><div className="inline-notice">顶部“演示身份”可切换SR、技术组成员、BU管理员和后台管理人员。此版本不连接实际 OCR、模型或企业后端。</div></Drawer>}
 {reset&&canPerform(state.actorRole,'project:manage')&&<Modal title="重置核心演示数据" onClose={()=>setReset(false)} footer={<><button className="btn" onClick={()=>setReset(false)}>取消</button><button className="btn btn-primary" onClick={resetDemoData}>重置核心数据</button></>}><p>备份当前本机演示数据，并恢复为五种状态各一条示例。知识、机型和资料维护中的独立演示记录继续保留。</p></Modal>}
 {globalSearch&&<Modal title="搜索页面和项目" onClose={()=>setGlobalSearch(false)}><input autoFocus className="input" aria-label="搜索关键词" placeholder="输入页面名、项目名或项目编号" value={search} onChange={e=>setSearch(e.target.value)}/><div className="search-results">{NAV_ITEMS.map(n=>n.key==='dashboard'&&state.actorRole==='BU管理员'?{...n,label:'BU看板'}:n).filter(n=>canAccessPage(state.actorRole,n.key,permissionContext)&&n.label.includes(search)).map(n=><button key={n.key} onClick={()=>{setGlobalSearch(false);navigate(n.key);}}>{n.label}<ChevronRight size={15}/></button>)}{visibleProjects.filter(p=>`${p.name}${p.id}`.includes(search)).map(p=><button key={p.id} onClick={()=>{setGlobalSearch(false);selectProject(p.id,'response');}}>{p.id} · {p.name}<ChevronRight size={15}/></button>)}</div></Modal>}
 </div>;
}
