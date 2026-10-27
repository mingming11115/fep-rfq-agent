import {getPersonnelContext,canAccessProject,getEligiblePersonnel,canManageBu} from './personnelDomain.js';
const modernRoles=['后台管理','BU管理员','SR','技术'];
const modernPermissions={
 'project:create':['SR'],'project:manage':['SR'],'project:handover':['SR'],'source:manage':['SR'],
 'response:edit':['SR','技术'],'response:submit':['SR'],'response:confirm':['SR','技术'],
 'review:process':['技术'],'review:clarify':['SR'],'review:communicate':['SR'],'review:approve':['SR','技术'],
 'snapshot:submit':['SR'],'snapshot:approve':['SR','技术'],'export:configure':['SR'],'export:download':['SR'],
 'analysis:view':['SR','技术'],'analysis:run':['SR','技术'],'resource:edit':['技术'],'evidence:manage':['技术'],
 'resource:approve':['BU管理员'],'model:configure':['BU管理员'],'catalog:create':['SR','BU管理员'],'audit:view':['BU管理员','后台管理'],'system:manage':['后台管理'],'bu:manage':['BU管理员'],
};
function modernCan(role,action,context){
 if(!modernPermissions[action]?.includes(role))return false;
 // Without context this is a UI capability query. Mutation boundaries always pass state.
 if(!context)return true;
 const {state,actorId=state?.actorId,projectId,requirementId,buId=state?.projects?.find(p=>p.id===projectId)?.buId}=context;
 if(!state||!state.accountsById?.[actorId]?.enabled)return false;
 if(role==='后台管理')return !!state.accountsById[actorId].systemAdmin;
 if(role==='BU管理员'){
  if(!canManageBu(state,actorId,buId))return false;
  if(action==='resource:approve')return !!getPersonnelContext(state,actorId,buId).member?.enabled&&!!getPersonnelContext(state,actorId,buId).member?.resourceQualifications?.includes(context.resourceKind==='capability'?'capability-publish':'knowledge-publish');
  return true;
 }
 const c=getPersonnelContext(state,actorId,buId);if(!c.enabled||!c.member.roles.includes(role))return false;
 if(projectId&&!canAccessProject(state,actorId,projectId))return false;
 if(['project:manage','project:handover'].includes(action)&&state.projects.find(p=>p.id===projectId)?.ownerId!==actorId)return false;
 if(action==='response:edit'&&role==='技术'&&requirementId&&state.requirementsByProject?.[projectId]?.find(r=>r.id===requirementId)?.confirmationAssigneeId!==actorId)return false;
 if(action==='response:confirm'){
  const row=state.requirementsByProject?.[projectId]?.find(r=>r.id===requirementId);
  return !!(row?.confirmationAssigneeId===actorId&&c.member.canConfirm);
 }
 if(['snapshot:approve','review:approve'].includes(action))return getEligiblePersonnel(state,{buId,projectId,duty:'final-review',side:role==='SR'?'sr':'technical'}).some(m=>m.userId===actorId);
 return true;
}
// Legacy labels remain readable to old standalone helpers. Live application
// identities are migrated to the four roles and always use contextual authorization.
const sales = '销售负责人', technical = '技术确认人', approver = '最终审批人';
const roles = [sales, technical, approver];
const permissions = {
  'project:create': [sales], 'project:manage': [sales], 'project:handover': [sales],
  'source:manage': [sales],
  'response:edit': [sales, technical], 'response:submit': [sales], 'response:confirm': [technical],
  'review:process': [technical], 'review:clarify': [sales], 'review:communicate': [sales], 'review:approve': [approver],
  'snapshot:submit': [sales, technical], 'snapshot:approve': [approver],
  'export:configure': [sales], 'export:download': [sales],
  'analysis:view': [sales, technical], 'analysis:run': [sales, technical],
  'resource:edit': [technical], 'evidence:manage': [technical], 'resource:approve': [approver],
  'audit:view': [approver], 'system:manage': [],
};
const sharedPages = ['dashboard','tasks','projects','documents','response','reviews','export','versions','settings','knowledge','history','capabilities'];
export function canPerform(role, action,context) { return modernRoles.includes(role)?modernCan(role,action,context):!context&&roles.includes(role) && (permissions[action]?.includes(role) ?? false); }
export function assertPermission(role, action,context) { if (!canPerform(role, action,context)) throw new Error('当前身份无此操作权限，请由具备对应职责的人员处理'); return true; }
export function assertRequirementPatch(role, current, patch,context) {
  assertPermission(role,'response:edit',context);
  const sourceFields=['original','clause','title','category','source','sourceFileId','sourceVersion','sourcePage','sectionPath'];
  if(sourceFields.some(key=>Object.hasOwn(patch,key)&&JSON.stringify(patch[key])!==JSON.stringify(current[key])))assertPermission(role,'source:manage',context);
  return true;
}
export function canAccessPage(role, page,context) {
  if(modernRoles.includes(role)){
   if(role==='后台管理')return ['dashboard','admin','audit'].includes(page)&&(!context||modernCan(role,'system:manage',context));
   if(role==='BU管理员')return ['dashboard','bu-admin','knowledge','history','capabilities','audit'].includes(page)&&(!context||modernCan(role,'bu:manage',context));
   return [...sharedPages,'analysis'].includes(page)&&(!context||modernCan(role,'analysis:view',context));
  }
  if (!roles.includes(role)) return false;
  if (sharedPages.includes(page)) return true;
  return page === 'analysis' ? canPerform(role,'analysis:view') : page === 'audit' ? canPerform(role,'audit:view') : false;
}
export function getRoleNavigation(role,context) {
  if(modernRoles.includes(role)){
   const base=[{key:'dashboard',page:'dashboard',label:role==='BU管理员'?'BU看板':'工作台'}];
   const items=role==='后台管理'?[{key:'admin',page:'admin',label:'系统配置与运维'},{key:'audit',page:'audit',label:'技术审计'}]:role==='BU管理员'?[{key:'bu-admin',page:'bu-admin',label:'BU管理'},{key:'admin',page:'knowledge',label:'知识库审核'},{key:'audit',page:'audit',label:'BU审计记录'}]:[{key:'projects',page:'projects',label:'我的 RFQ'},{key:'tasks',page:'tasks',label:'任务中心'},{key:'analysis',page:'analysis',label:'AI 分析记录'},{key:'admin',page:'knowledge',label:role==='技术'?'知识库维护':'知识库'}];
   return [...base,...items].filter(n=>canAccessPage(role,n.page,context));
  }
  if (!roles.includes(role)) return [];
  const items = [
    {key:'dashboard',page:'dashboard',label:'工作台'},
    {key:'projects',page:'projects',label:'我的 RFQ'},
    {key:'tasks',page:'tasks',label:'任务中心'},
    {key:'analysis',page:'analysis',label:'AI 分析记录'},
    {key:'admin',page:'knowledge',label: role === technical ? '知识库维护' : role === approver ? '知识库审核' : '知识库'},
  ];
  return items.filter(item => canAccessPage(role,item.page));
}
export function getRoleDescription(role) {
  return {
    'SR':'负责应答整理、条款确认、提交最终评审、SR方评审及正式导出。',
    '技术':'按技术组分工确认条款，处理方案，并按全员或负责人方式参与最终评审。',
    'BU管理员':'维护本BU人员范围、节点资格、项目授权及技术组评审规则。',
    '后台管理':'维护平台账号与BU组织、系统配置和技术审计。',
    [sales]:'负责项目与来源资料、应答起草、客户澄清及批准后的正式导出。',
    [technical]:'负责专业方案、证据核对与条款确认，并维护知识库候选。',
    [approver]:'负责专业方案、最终应答及知识库的独立审批，可批准或退回。',
  }[role] || '当前身份未配置业务职责。';
}
