import { UiButton } from './AntContent';
import React, {useEffect,useState} from 'react';
import {UserRoundCog} from "./icons";
import {Modal} from './ui';
import {confirmationCandidates} from '../confirmationAssignmentClient';
import PersonPicker from './PersonPicker';
import {personName} from '../personnelDomain';
import {assignResponse, getResponseAssignmentContext} from '../responseAssignment';

function AssignmentDialog({state, project, requirementId, route, onPersonnelAction, onAssignConfirmation, onClose}) {
  const context = getResponseAssignmentContext(state, project.id, requirementId);
  const [baseline] = useState(() => ({expectedVersion:context.row.version || 1, expectedAssigneeIds:context.actorIds}));
  const [selected, setSelected] = useState(context.actorIds[0] || '');
  const reason=context.actorIds.length?'改派确认人':'指派确认人';
  const [error, setError] = useState('');
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(state.dataSource==='mysql');
  const [people,setPeople]=useState(state.dataSource==='mysql'?[]:context.people);
  const [backendVersion]=useState(context.row.backendVersion??context.row.version??0);
  useEffect(()=>{if(state.dataSource!=='mysql')return;let active=true;
    confirmationCandidates(requirementId).then(rows=>{if(active)setPeople(rows);}).catch(cause=>{if(active)setError(cause.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[requirementId,state.dataSource]);
  const valid = !busy && !loading && context.canAssign && !!selected
    && people.some(person => person.userId === selected)
    && (baseline.expectedAssigneeIds.length !== 1 || selected !== baseline.expectedAssigneeIds[0]);
  async function save() {
    if(!valid)return;
    setBusy(true);setError('');
    try {
      if(state.dataSource==='mysql'){
        await onAssignConfirmation(project.id,requirementId,{userId:selected,version:backendVersion,reason:reason.trim()});
      }else if (onPersonnelAction(current => assignResponse(current, {projectId:project.id,requirementId,userIds:[selected],
        reason,route,...baseline})) === false) return;
      onClose();
    } catch (cause) { setError(cause.message); } finally {setBusy(false);}
  }
  return <Modal title={context.label} onClose={()=>{if(!busy)onClose();}} width={540}
    footer={<><UiButton className="btn" disabled={busy} onClick={onClose}>取消</UiButton><UiButton className="btn btn-primary" disabled={!valid} onClick={save}>保存确认分工</UiButton></>}>
    <div className="field"><span>新确认人 *</span>
      <PersonPicker disabled={busy||loading} label="新确认人" people={people} value={selected} onChange={setSelected}
        resolveName={id => personName(state,id)} emptyLabel="暂无具备确认资格和项目授权的人员"/>
    </div>
    {context.row?.status === '已确认'
      ? <p className="muted">保存后调整后续确认人，保留本版确认及原确认人记录。</p>
      : context.review && context.review.status !== '已关闭' && <p className="muted">评审继续由原评审人处理，评审完成后交由新确认人确认本条。</p>}
    {loading&&<p role="status">正在读取有项目授权的确认人…</p>}
    {error && <p className="response-error" role="alert">{error}</p>}
  </Modal>;
}

export default function ResponseAssignmentControl({state, project, requirementId, route, disabled=false, onRequestOpen, onPersonnelAction,onAssignConfirmation}) {
  const [open, setOpen] = useState(false);
  const context = getResponseAssignmentContext(state, project.id, requirementId);
  const title = !context.canAssign ? '当前人员没有本条确认人分派权限' : disabled ? '请在当前有效条款中操作' : '调整本条确认责任人';
  return <><UiButton type="button" className="btn" disabled={disabled || !context.canAssign} title={title}
    onClick={() => onRequestOpen(() => setOpen(true))}><UserRoundCog size={14}/>{context.label}</UiButton>
    {open && <AssignmentDialog state={state} project={project} requirementId={requirementId} route={route} onPersonnelAction={onPersonnelAction} onAssignConfirmation={onAssignConfirmation} onClose={() => setOpen(false)}/>}</>;
}
