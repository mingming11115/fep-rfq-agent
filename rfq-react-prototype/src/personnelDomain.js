// BU membership is the authorization source; display labels never identify a person.
export const normalizeRole=role=>({'销售负责人':'SR','技术确认人':'技术','最终审批人':'技术','系统管理员':'后台管理'}[role]||role);
export const personName=(state,id)=>state.accountsById?.[id]?.name||id||'未配置';
export function selectPlatformDirectoryAccounts(state,buId='') {
 const accounts=Object.values(state.accountsById||{}).map(account=>({...account,
  buIds:(state.businessUnits||[]).filter(b=>account.managedBuIds?.includes(b.id)||(state.buPersonnelByBuId?.[b.id]||[]).some(m=>m.userId===account.id)).map(b=>b.id),
 }));
 // Directory maintenance includes disabled accounts and retained BU memberships.
 return buId?accounts.filter(account=>account.buIds.includes(buId)):accounts;
}
export function getPersonnelContext(state,actorId,buId) {
 const account=state.accountsById?.[actorId],member=state.buPersonnelByBuId?.[buId]?.find(m=>m.userId===actorId);
 const exists=state.businessUnits?.some(b=>b.id===buId);
 return {account,member,managed:!!(exists&&account?.enabled&&account.managedBuIds?.includes(buId)),enabled:!!(exists&&account?.enabled&&member?.enabled&&member.roles?.some(r=>['SR','技术'].includes(r)))};
}
export const canManageBu=(state,actorId,buId)=>getPersonnelContext(state,actorId,buId).managed;
export function canAccessProject(state,actorId,projectId) {
 const project=state.projects?.find(p=>p.id===projectId);if(!project)return false;
 const {enabled}=getPersonnelContext(state,actorId,project.buId);
 return enabled&&!!project.participantIds?.includes(actorId);
}
export function getEligiblePersonnel(state,{buId,projectId,duty,side}) {
 if(!['confirm','final-review'].includes(duty)||duty==='final-review'&&!['sr','technical'].includes(side))return [];
 return (state.buPersonnelByBuId?.[buId]||[]).filter(m=>{
  const c=getPersonnelContext(state,m.userId,buId);
  return c.enabled&&(m.canConfirm||duty==='confirm'&&m.roles.includes('SR'))&&(duty!=='final-review'||m.canFinalReview&&m.roles.includes(side==='sr'?'SR':'技术'))&&(!projectId||state.projects?.find(p=>p.id===projectId)?.buId===buId&&canAccessProject(state,m.userId,projectId));
 }).map(m=>({...m,name:personName(state,m.userId)}));
}
export function getRequiredFinalReviewers(review) {
 const {srId,technicalIds,technicalRepresentativeId}=review?.reviewers||{};
 if(review?.policy!=='sr-and-technical'||!['all','representative'].includes(review.technicalMode)||!srId||!Array.isArray(technicalIds)||!technicalIds.length||technicalIds.some(id=>!id||id===srId)||new Set(technicalIds).size!==technicalIds.length)throw new Error('请配置有效的SR和不重复的技术组成员');
 if(review.technicalMode==='representative'&&!technicalIds.includes(technicalRepresentativeId))throw new Error('请选择技术组内的负责人');
 return [{actorId:srId,side:'sr'},...(review.technicalMode==='all'?technicalIds:[technicalRepresentativeId]).map(actorId=>({actorId,side:'technical'}))];
}
function reasonRequired(reason){if(!reason?.trim())throw new Error('请填写变更原因');}
function audited(state,actorId,buId,action,before,after,reason){return {...state,audit:[{id:crypto.randomUUID(),time:new Date().toISOString(),actor:personName(state,actorId),actorId,role:state.actorRole,buId,action,object:buId,result:'成功',reason,before,after,detail:reason},...(state.audit||[])]};}
function requireBu(state,actorId,buId){if(!canManageBu(state,actorId,buId))throw new Error('无此BU的管理权限');}
function projectManager(state,actorId,projectId){const project=state.projects?.find(p=>p.id===projectId);if(!project)throw new Error('项目不存在');const c=getPersonnelContext(state,actorId,project.buId);if(!c.managed&&!(canAccessProject(state,actorId,projectId)&&c.member.roles.includes('SR')&&project.ownerId===actorId))throw new Error('当前人员没有项目分派权限');return project;}
export function updateBuMember(state,{actorId,buId,userId,patch,reason}) {
 requireBu(state,actorId,buId);reasonRequired(reason);
 const allowed=['roles','enabled','canConfirm','canFinalReview','resourceQualifications'];
 if(Object.keys(patch).some(k=>!allowed.includes(k)))throw new Error('存在无权配置的字段');
 if(!state.accountsById?.[userId]||state.accountsById[userId].systemAdmin)throw new Error('请选择有效的业务账号');
 const before=state.buPersonnelByBuId?.[buId]?.find(m=>m.userId===userId)||null;
 const next={userId,roles:[],enabled:true,canConfirm:false,canFinalReview:false,resourceQualifications:[],...before,...structuredClone(patch)};
 if(!Array.isArray(next.roles)||next.roles.some(r=>!['SR','技术'].includes(r)))throw new Error('只能配置SR或技术业务角色');
 if(!Array.isArray(next.resourceQualifications)||next.resourceQualifications.some(r=>!['knowledge-publish','capability-publish'].includes(r)))throw new Error('无效的资料发布权限');
 if(!next.canConfirm||!next.enabled)next.canFinalReview=false;
 const rows=state.buPersonnelByBuId?.[buId]||[];
 return audited({...state,buPersonnelByBuId:{...state.buPersonnelByBuId,[buId]:before?rows.map(m=>m.userId===userId?next:m):[...rows,next]}},actorId,buId,'更新BU人员范围',before,next,reason);
}
export function updateBuReviewSettings(state,{actorId,buId,technicalMode,reason}) {
 requireBu(state,actorId,buId);reasonRequired(reason);if(!['all','representative'].includes(technicalMode))throw new Error('无效的技术组评审方式');
 const before=state.buReviewSettingsByBuId?.[buId],after={technicalMode,version:(before?.version||0)+1};
 return audited({...state,buReviewSettingsByBuId:{...state.buReviewSettingsByBuId,[buId]:after}},actorId,buId,'变更技术组评审规则',before,after,reason);
}
export function getProjectReviewSettings(state,projectId) {
 const project=state.projects?.find(p=>p.id===projectId);
 return project?.technicalReviewSettings||state.buReviewSettingsByBuId?.[project?.buId];
}
export function assertProjectAssignment(state,{actorId,projectId,userId,duty,side}) {
 const project=projectManager(state,actorId,projectId);
 if(!getEligiblePersonnel(state,{buId:project.buId,projectId,duty,side}).some(m=>m.userId===userId))throw new Error('人员不在本BU有效资格或项目授权范围');
 return true;
}
export function assignProjectDuty(state,{actorId,projectId,userId,duty,side,requirementId,reason}) {
 reasonRequired(reason);if(userId)assertProjectAssignment(state,{actorId,projectId,userId,duty,side});else projectManager(state,actorId,projectId);
 const project=state.projects.find(p=>p.id===projectId);
 if(duty!=='confirm')throw new Error('请使用项目评审组配置分派最终评审');
 const row=state.requirementsByProject?.[projectId]?.find(r=>r.id===requirementId);if(!row)throw new Error('条款不存在');
 const rows=state.requirementsByProject[projectId].map(r=>r.id===requirementId?{...r,confirmationAssigneeId:userId,confirmationAssignmentSource:'explicit'}:r);
 const next=audited({...state,requirementsByProject:{...state.requirementsByProject,[projectId]:rows}},actorId,project.buId,'分派条款确认人',row.confirmationAssigneeId,userId,reason);next.audit[0]={...next.audit[0],projectId,requirementId};return next;
}
export function configureProjectFinalReviewers(state,{actorId,projectId,srId,technicalIds,technicalRepresentativeId=null,reason}) {
 reasonRequired(reason);const project=projectManager(state,actorId,projectId),settings=getProjectReviewSettings(state,projectId);
 const reviewers={srId,technicalIds,technicalRepresentativeId};getRequiredFinalReviewers({policy:'sr-and-technical',technicalMode:settings?.technicalMode,reviewers});
 assertProjectAssignment(state,{actorId,projectId,userId:srId,duty:'final-review',side:'sr'});
 for(const userId of technicalIds)assertProjectAssignment(state,{actorId,projectId,userId,duty:'final-review',side:'technical'});
 return audited({...state,projects:state.projects.map(p=>p.id===projectId?{...p,approvalConfig:{...p.approvalConfig,finalReviewers:structuredClone(reviewers)}}:p)},actorId,project.buId,'配置项目最终评审组',project.approvalConfig?.finalReviewers,reviewers,reason);
}
export function assignReviewApprover(state,{actorId,projectId,reviewId,userId,reason}) {
 reasonRequired(reason);const project=projectManager(state,actorId,projectId),review=state.reviewsByProject?.[projectId]?.find(r=>r.id===reviewId);
 if(!review||['已关闭','已取消'].includes(review.status))throw new Error('专业事项已关闭或不存在');
 const candidates=['sr','technical'].flatMap(side=>getEligiblePersonnel(state,{buId:project.buId,projectId,duty:'final-review',side}));
 if(!candidates.some(m=>m.userId===userId)||review.submittedById===userId)throw new Error('专业批准人须具有独立资格，不能是方案提交人');
 return audited({...state,reviewsByProject:{...state.reviewsByProject,[projectId]:state.reviewsByProject[projectId].map(r=>r.id===reviewId?{...r,approverId:userId}:r)}},actorId,project.buId,'改派专业批准人',review.approverId,userId,reason);
}
export function updateProjectAccess(state,{actorId,projectId,userId,enabled,reason}) {
 const project=state.projects?.find(p=>p.id===projectId);if(!project)throw new Error('项目不存在');requireBu(state,actorId,project.buId);reasonRequired(reason);
 if(!getPersonnelContext(state,userId,project.buId).enabled)throw new Error('人员不在本BU有效范围');
 const ids=project.participantIds||[],after=enabled?[...new Set([...ids,userId])]:ids.filter(id=>id!==userId);
 return audited({...state,projects:state.projects.map(p=>p.id===projectId?{...p,participantIds:after}:p)},actorId,project.buId,'调整项目授权',ids,after,reason);
}
export function getProjectFinalReview(state,projectId) {
 const project=state.projects?.find(p=>p.id===projectId),settings=getProjectReviewSettings(state,projectId);
 const finalReview={policy:'sr-and-technical',technicalMode:settings?.technicalMode,ruleVersion:settings?.version,reviewers:structuredClone(project?.approvalConfig?.finalReviewers),decisions:{sr:null,technicalByActorId:{}}};
 getRequiredFinalReviewers(finalReview);
 for(const [side,ids]of [['sr',[finalReview.reviewers.srId]],['technical',finalReview.reviewers.technicalIds]])for(const id of ids)if(!getEligiblePersonnel(state,{buId:project.buId,projectId,duty:'final-review',side}).some(m=>m.userId===id))throw new Error('最终评审人员资格或项目授权已变化，请重新配置');
 return finalReview;
}
export function getReviewPersonnel(state,projectId,requirementId) {
 const project=state.projects?.find(p=>p.id===projectId),row=state.requirementsByProject?.[projectId]?.find(r=>r.id===requirementId);
 const technical=(state.buPersonnelByBuId?.[project?.buId]||[]).filter(m=>m.roles.includes('技术')&&getPersonnelContext(state,m.userId,project.buId).enabled&&canAccessProject(state,m.userId,projectId));
 const ownerId=technical.find(m=>m.userId===row?.confirmationAssigneeId)?.userId||technical[0]?.userId;
 if(!ownerId)throw new Error('请先配置有项目授权的技术处理人员');
 const approvers=['sr','technical'].flatMap(side=>getEligiblePersonnel(state,{buId:project.buId,projectId,duty:'final-review',side})).filter(m=>m.userId!==ownerId);
 const approverId=approvers.find(m=>m.userId==='demo-approver')?.userId||approvers[0]?.userId;
 if(!approverId)throw new Error('请先配置独立的专业批准人员');
 return {ownerId,approverId};
}
export function updatePlatformDirectory(state,{actorId,kind,record,reason}) {
 if(!state.accountsById?.[actorId]?.enabled||!state.accountsById[actorId].systemAdmin)throw new Error('当前账号无平台管理权限');
 reasonRequired(reason);if(!record.id?.trim()||!record.name?.trim())throw new Error('请填写编号和名称');
 let next;
 if(kind==='account'){
  if((record.managedBuIds||[]).some(id=>!state.businessUnits.some(b=>b.id===id)))throw new Error('管理BU不存在');
  if(record.id===actorId&&record.enabled===false)throw new Error('不能停用当前管理账号');
  const before=state.accountsById[record.id];
  const account={id:record.id,name:record.name.trim(),enabled:record.enabled!==false,systemAdmin:!!before?.systemAdmin,managedBuIds:[...new Set(record.managedBuIds||[])]};
  next={...state,accountsById:{...state.accountsById,[record.id]:account}};
 }else if(kind==='bu'){
  const bu={id:record.id,name:record.name.trim()};next={...state,businessUnits:[...state.businessUnits.filter(b=>b.id!==bu.id),bu],buPersonnelByBuId:{...state.buPersonnelByBuId,[bu.id]:state.buPersonnelByBuId[bu.id]||[]},buReviewSettingsByBuId:{...state.buReviewSettingsByBuId,[bu.id]:state.buReviewSettingsByBuId[bu.id]||{technicalMode:'all',version:1}}};
 }else throw new Error('不支持的目录配置');
 return audited(next,actorId,kind==='bu'?record.id:'平台','更新平台目录',null,record,reason);
}

export function initializePersonnel(state) {
 if(state.personnelSchemaVersion)return state;
 const names={'demo-sales':'林晓','demo-technical':'顾工','demo-approver':'赵明','demo-technical-2':'王工','demo-technical-3':'陈工','demo-bu-admin':'BU管理员','demo-system-admin':'后台管理员','demo-directory-tech':'刘工'};
 state.accountsById ||= Object.fromEntries(Object.entries(names).map(([id,name])=>[id,{id,name,enabled:true,systemAdmin:id==='demo-system-admin',managedBuIds:id==='demo-bu-admin'?['BU-DEMO']:[]}]));
 state.businessUnits ||= [{id:'BU-DEMO',name:'FEP事业部（演示）'}];
 state.buPersonnelByBuId ||= {'BU-DEMO':Object.keys(names).filter(id=>!['demo-system-admin','demo-directory-tech'].includes(id)).map(userId=>({userId,roles:userId==='demo-bu-admin'?[]:[userId==='demo-sales'?'SR':'技术'],enabled:true,canConfirm:userId!=='demo-bu-admin',canFinalReview:userId!=='demo-bu-admin',resourceQualifications:userId==='demo-bu-admin'?['knowledge-publish','capability-publish']:[]}))};
 state.buReviewSettingsByBuId ||= {'BU-DEMO':{technicalMode:'all',version:1}};
 state.actorRole=normalizeRole(state.actorRole||'SR');state.actorId ||= 'demo-sales';
 for(const backup of Object.values(state.deletedProjectsById||{})){const p=backup.project;if(backup.deletedBy)p.ownerId ||= backup.deletedBy;p.participantIds ||= p.ownerId?[p.ownerId]:[];}
 for(const project of [...(state.projects||[]),...Object.values(state.deletedProjectsById||{}).map(b=>b.project)]) {
  if(!project.buId&&['demo-sales','demo-technical','demo-approver'].includes(project.ownerId))project.buId='BU-DEMO';
  if(project.buId!=='BU-DEMO')continue;
  const sample=/^RFQ-00[1-5]$/.test(project.id)||project.id.startsWith('RFQ-BHEL-');
  if(sample)project.participantIds=[...new Set([...(project.participantIds||[]),'demo-technical-2','demo-technical-3'])];
  const technicalIds=(project.participantIds||[]).filter(id=>['demo-technical','demo-technical-2','demo-technical-3'].includes(id));
  project.approvalConfig={...project.approvalConfig,finalReviewers:project.approvalConfig?.finalReviewers||{srId:project.ownerId==='demo-sales'?'demo-sales':null,technicalIds,technicalRepresentativeId:technicalIds[0]||null}};
  for(const review of state.reviewsByProject?.[project.id]||[]){review.ownerId ||= review.kind==='clarification'?project.ownerId:'demo-technical';review.approverId ||= 'demo-approver';
   if(['待审批','待批准'].includes(review.status)&&!review.submittedById){review.roundHistory=[...(review.roundHistory||[]),structuredClone(review)];review.status='已退回';review.version=(review.version||1)+1;review.round=(review.round||1)+1;review.history=[...(review.history||[]),{action:'旧方案缺少提交人标识，请重新提交',actor:'系统迁移',time:new Date().toISOString()}];}
  }
 }
 state.personnelSchemaVersion=1;return state;
}
