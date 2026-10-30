import React, {useState} from 'react';
import {UserRoundCog} from 'lucide-react';
import {Modal} from './ui';
import PersonPicker from './PersonPicker';
import {personName} from '../personnelDomain';
import {assignResponse, getResponseAssignmentContext} from '../responseAssignment';

function AssignmentDialog({state, project, requirementId, route, onPersonnelAction, onClose}) {
  const context = getResponseAssignmentContext(state, project.id, requirementId);
  const [baseline] = useState(() => ({expectedVersion:context.row.version || 1, expectedAssigneeIds:context.actorIds}));
  const [selected, setSelected] = useState(context.actorIds[0] || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const valid = context.canAssign && reason.trim() && !!selected
    && context.people.some(person => person.userId === selected)
    && (baseline.expectedAssigneeIds.length !== 1 || selected !== baseline.expectedAssigneeIds[0]);
  function save() {
    try {
      if (onPersonnelAction(current => assignResponse(current, {projectId:project.id,requirementId,userIds:[selected],
        reason,route,...baseline})) === false) return;
      onClose();
    } catch (cause) { setError(cause.message); }
  }
  return <Modal title={context.label} onClose={onClose} width={540}
    footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn btn-primary" disabled={!valid} onClick={save}>保存确认分工</button></>}>
    <p>条款 {context.row?.clause} · {context.row?.title}</p>
    <p className="muted">当前确认责任人：{context.actorIds.map(id => personName(state,id)).join('、') || '未配置'}</p>
    <div className="field"><span>新确认人 *</span>
      <PersonPicker label="新确认人" people={context.people} value={selected} onChange={setSelected}
        resolveName={id => personName(state,id)} emptyLabel="暂无具备确认资格和项目授权的人员"/>
    </div>
    <label className="field"><span>分工原因 *</span><textarea className="input" aria-label="指派或改派原因" value={reason} onChange={event => setReason(event.target.value)} placeholder="说明本次确认人调整的原因"/></label>
    {context.row?.status === '已确认'
      ? <p className="muted">保存后调整后续确认人，保留本版确认及原确认人记录。</p>
      : context.review && context.review.status !== '已关闭' && <p className="muted">评审继续由原评审人处理，评审完成后交由新确认人确认本条。</p>}
    {error && <p className="response-error" role="alert">{error}</p>}
  </Modal>;
}

export default function ResponseAssignmentControl({state, project, requirementId, route, disabled=false, onRequestOpen, onPersonnelAction}) {
  const [open, setOpen] = useState(false);
  const context = getResponseAssignmentContext(state, project.id, requirementId);
  const title = !context.canAssign ? '当前人员没有本条确认人分派权限' : disabled ? '请在当前有效条款中操作' : '调整本条确认责任人';
  return <><button type="button" className="btn" disabled={disabled || !context.canAssign} title={title}
    onClick={() => onRequestOpen(() => setOpen(true))}><UserRoundCog size={14}/>{context.label}</button>
    {open && <AssignmentDialog state={state} project={project} requirementId={requirementId} route={route} onPersonnelAction={onPersonnelAction} onClose={() => setOpen(false)}/>}</>;
}
