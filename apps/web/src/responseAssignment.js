import {getConfirmationActorIds, getResponseReview, getSourceContextError} from './confirmationPolicy.js';
import {assignProjectDuty, canAccessProject, canManageBu, getEligiblePersonnel, getPersonnelContext} from './personnelDomain.js';

export function getResponseAssignmentContext(state, projectId, requirementId) {
  const project = state.projects?.find(item => item.id === projectId);
  const row = state.requirementsByProject?.[projectId]?.find(item => item.id === requirementId);
  const review = getResponseReview(state, projectId, requirementId);
  const actorIds = row ? getConfirmationActorIds(state, projectId, row) : [];
  const people = project ? getEligiblePersonnel(state, {buId:project.buId, projectId, duty:'confirm'}) : [];
  const context = getPersonnelContext(state, state.actorId, project?.buId);
  const businessRole = context.enabled && context.member.roles.includes(state.actorRole) && ['SR','技术'].includes(state.actorRole);
  const manager = businessRole && state.actorRole === 'SR' && project?.ownerId === state.actorId;
  const buManager = state.actorRole === 'BU管理员' && canManageBu(state, state.actorId, project?.buId);
  const canAssign = !!row && canAccessProject(state, state.actorId, projectId) && (manager || buManager);
  return {row, review, actorIds, people, canAssign:!!canAssign,
    label:review || row?.confirmationAssignmentSource === 'explicit' ? '改派确认人' : '指派确认人'};
}

export function assignResponse(state, {projectId, requirementId, userIds=[], reason='', expectedVersion,
  expectedAssigneeIds, route={}}) {
  const context = getResponseAssignmentContext(state, projectId, requirementId);
  const {row} = context;
  if (!context.canAssign) throw new Error('当前人员没有本条指派或改派权限');
  const sourceError = getSourceContextError(row, route);
  if (sourceError) throw new Error(sourceError);
  if (expectedVersion !== undefined && (row.version || 1) !== expectedVersion) throw new Error('应答版本已变化，请重新打开指派窗口');
  if (!reason.trim()) throw new Error('请填写指派或改派原因');
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) throw new Error('请选择接收人');
  if (expectedAssigneeIds && JSON.stringify(context.actorIds) !== JSON.stringify(expectedAssigneeIds)) throw new Error('确认分工已变化，请重新打开指派窗口');
  if (ids.length !== 1) throw new Error('每条应答只能指派一位确认人');
  if (ids[0] === context.actorIds[0]) throw new Error('请选择其他确认责任人');
  return assignProjectDuty(state, {actorId:state.actorId, projectId, requirementId, duty:'confirm',userId:ids[0],reason:reason.trim()});
}
