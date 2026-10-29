import React, {useState} from 'react';
import {UserRoundCog} from 'lucide-react';
import {Modal} from './ui';
import PersonPicker from './PersonPicker';
import {personName} from '../personnelDomain';
import {assignResponse, getResponseAssignmentContext} from '../responseAssignment';

function AssignmentDialog({state, project, requirementId, route, onPersonnelAction, onClose}) {
  const context = getResponseAssignmentContext(state, project.id, requirementId);
  const [baseline] = useState(() => ({expectedVersion:context.row.version || 1, expectedAssigneeIds:context.actorIds,
    expectedReviewId:context.review?.id || null, expectedReviewVersion:context.review?.version || 1, expectedRound:context.review?.round || 1}));
  const [selected, setSelected] = useState(context.actorIds);
  const [reason, setReason] = useState('');
  const [deadline, setDeadline] = useState(context.review?.deadline || project.deadline || '');
  const [error, setError] = useState('');
  const reviewMode = !!baseline.expectedReviewId;
  const valid = context.canAssign && reason.trim() && selected.length > 0
    && selected.every(id => context.people.some(person => person.userId === id))
    && (reviewMode ? !!deadline : selected.length === 1 && selected[0] !== baseline.expectedAssigneeIds[0]);
  function save() {
    try {
      if (onPersonnelAction(current => assignResponse(current, {projectId:project.id,requirementId,userIds:selected,
        reason,deadline,route,...baseline})) === false) return;
      onClose();
    } catch (cause) { setError(cause.message); }
  }
  return <Modal title={reviewMode ? '改派评审人' : `${context.label}确认责任人`} onClose={onClose} width={540}
    footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn btn-primary" disabled={!valid} onClick={save}>保存分工</button></>}>
    <p>条款 {context.row?.clause} · {context.row?.title}</p>
    <p className="muted">当前确认责任人：{context.actorIds.map(id => personName(state,id)).join('、') || '未配置'}</p>
    <div className="field"><span>{reviewMode ? '评审人（可多选）' : '确认责任人'} *</span>
      <PersonPicker label={reviewMode ? '改派评审人' : '指派确认责任人'} multiple={reviewMode}
        people={context.people} value={reviewMode ? selected : selected[0] || ''}
        onChange={value => setSelected(reviewMode ? value : value ? [value] : [])}
        resolveName={id => personName(state,id)} emptyLabel="暂无具备确认资格和项目授权的人员"/>
    </div>
    {reviewMode && <label className="field"><span>截止时间 *</span><input type="date" className="input" aria-label="分工截止时间" value={deadline} onChange={event => setDeadline(event.target.value)}/></label>}
    <label className="field"><span>{context.label}原因 *</span><textarea className="input" aria-label="指派或改派原因" value={reason} onChange={event => setReason(event.target.value)} placeholder="说明本次分工调整的原因"/></label>
    <p className="muted">{reviewMode
      ? context.reopensReview ? '保存后重新开启评审，所有所选评审人需要确认新一轮；原确认保留在历史记录中。' : '保存后所有所选评审人需要重新确认，历史记录保留。'
      : context.row?.status === '已确认' ? '本次仅调整后续确认分工，保留本版确认和原确认人；需要重新确认时，请发起重新评审。' : '保存后，未完成的确认待办交由新责任人处理；应答内容和结论保持当前值。'}</p>
    {error && <p className="response-error" role="alert">{error}</p>}
  </Modal>;
}

export default function ResponseAssignmentControl({state, project, requirementId, route, disabled=false, onRequestOpen, onPersonnelAction}) {
  const [open, setOpen] = useState(false);
  const context = getResponseAssignmentContext(state, project.id, requirementId);
  const title = !context.canAssign ? '当前人员没有本条分派权限' : disabled ? '请在当前有效条款中操作' : context.review ? '调整本条评审人' : '调整本条确认责任人';
  return <><button type="button" className="btn" disabled={disabled || !context.canAssign} title={title}
    onClick={() => onRequestOpen(() => setOpen(true))}><UserRoundCog size={14}/>{context.label}</button>
    {open && <AssignmentDialog state={state} project={project} requirementId={requirementId} route={route} onPersonnelAction={onPersonnelAction} onClose={() => setOpen(false)}/>}</>;
}
