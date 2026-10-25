// The prototype uses three local identities. Task ownership and version checks
// remain additional conditions; these permissions never replace them.
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
const sharedPages = ['dashboard','tasks','projects','documents','response','reviews','export','versions','settings','knowledge','capabilities','evidence'];
export function canPerform(role, action) { return roles.includes(role) && (permissions[action]?.includes(role) ?? false); }
export function assertPermission(role, action) { if (!canPerform(role, action)) throw new Error('当前身份无此操作权限，请由具备对应职责的人员处理'); return true; }
export function assertRequirementPatch(role, current, patch) {
  assertPermission(role,'response:edit');
  const sourceFields=['original','clause','title','category','source','sourceFileId','sourceVersion','sourcePage','sectionPath'];
  if(sourceFields.some(key=>Object.hasOwn(patch,key)&&JSON.stringify(patch[key])!==JSON.stringify(current[key])))assertPermission(role,'source:manage');
  return true;
}
export function canAccessPage(role, page) {
  if (!roles.includes(role)) return false;
  if (sharedPages.includes(page)) return true;
  return page === 'analysis' ? canPerform(role,'analysis:view') : page === 'audit' ? canPerform(role,'audit:view') : false;
}
export function getRoleNavigation(role) {
  if (!roles.includes(role)) return [];
  const items = [
    {key:'dashboard',page:'dashboard',label:'工作台'}, {key:'tasks',page:'tasks',label:'任务中心'},
    {key:'projects',page:'projects',label:'我的 RFQ'},
    {key:'analysis',page:'analysis',label:'AI 分析记录'},
    {key:'admin',page:'knowledge',label: role === technical ? '业务资料维护' : role === approver ? '业务资料审核' : '业务资料'},
  ];
  return items.filter(item => canAccessPage(role,item.page));
}
export function getRoleDescription(role) {
  return {
    [sales]:'负责项目与来源资料、应答起草、客户澄清及批准后的正式导出。',
    [technical]:'负责专业方案、证据核对与条款确认，并维护业务资料候选。',
    [approver]:'负责专业方案、最终应答及业务资料的独立审批，可批准或退回。',
  }[role] || '当前身份未配置业务职责。';
}
