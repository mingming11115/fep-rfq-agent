import { UiTag, UiButton, BusinessTable, UiInput, UiTextArea, UiSelect, UiCheckbox } from '../components/AntContent';
import ResponseReviewPanel from '../components/ResponseReviewPanel';
import {getReviewActorIds,hasReviewConfirmation} from '../confirmationPolicy';
import InlineReviewSurface from '../components/InlineReviewSurface';
import { guardCardNavigation } from '../responseCardQueue';
import {getProjectFinalReview,getRequiredFinalReviewers,personName} from '../personnelDomain';
import {applyFinalReviewDecision,isFinalReviewApproved} from '../finalReviewDomain';
import {canPerform} from '../permissions';
import {snapshotFingerprint,latestSnapshot,checkSnapshotValidity,currentProjectScope,getFinalReviewScope} from '../snapshotDomain';
import React, { useEffect, useRef, useState } from 'react';
import { FileText, AlertCircle, ArrowRight, Download } from "../components/icons";
import { Modal, Drawer } from '../components/ui';
import { getExportIssues, makeSnapshot } from '../domain';
import { api } from '../authClient';
import { downloadCraftBlob } from '../craftClient';
import {getUnconfirmedComplyRows} from '../responseRecommendation';
import UnconfirmedComplyList from '../components/UnconfirmedComplyList';
import './workflow-pages.css';

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toLocaleString('zh-CN', { hour12: false });
const isPendingReview = (review) => ['待审批', '待批准'].includes(review?.status);
const isClosed = (review) => ['已关闭', '已完成', '批准关闭'].includes(review.status);
const asText = (value) => Array.isArray(value) ? value.map((v) => typeof v === 'string' ? v : v.name || v.title || v.id).filter(Boolean).join('；') : String(value ?? '');
const tone = (status) => /失败|退回|逾期|不满足|失效/.test(status || '') ? 'danger' : /已确认|完成|已关闭|已批准|通过/.test(status || '') ? 'success' : /处理中|待|审批|队列|排队/.test(status || '') ? 'warning' : 'neutral';
function Badge({ value }) { return <UiTag className={`badge ${tone(value)}`}>{value || '未设置'}</UiTag>; }
function Notice({ children, type = 'info' }) { return <div className={`flow-notice flow-notice-${type}`}><AlertCircle size={16} /><div>{children}</div></div>; }
function NoRows({ title = '暂无数据', children }) { return <div className="empty-state"><FileText size={34} /><strong>{title}</strong><p>{children}</p></div>; }
function Field({ label, children, required = false, wide = false }) { return <label className={`field ${wide ? 'flow-field-wide' : ''}`}><span>{required && <i className="flow-required">*</i>}{label}</span>{children}</label>; }
function Pager({ count, page = 1, pageSize = 6, onChange }) {
  const last = Math.max(1, Math.ceil(count / pageSize));
  return <div className="flow-pager"><span>共 {count} 条记录</span><div><UiButton className="btn btn-sm" disabled={page <= 1} onClick={() => onChange?.(page - 1)}>上一页</UiButton><UiButton className="btn btn-sm flow-page-number">{page}</UiButton><UiButton className="btn btn-sm" disabled={page >= last} onClick={() => onChange?.(page + 1)}>下一页</UiButton><span>{pageSize} 条 / 页</span></div></div>;
}
const metadataStorage = (projectId) => `fep-rfq-documents:${projectId}`;
function readDocumentState(projectId) { try { return JSON.parse(localStorage.getItem(metadataStorage(projectId)) || 'null'); } catch { return null; } }

export function ReviewsPage({project,requirements=[],reviews=[],onUpdateReview,onAdoptReview,toast,navigate,actorRole,actorId,appState,canBusinessAction,embedded=false,inline=false,registerNavigationGuard,initialReviewId=null,initialAction=null,onCloseEmbedded}){
 const [query,setQuery]=useState(''),[status,setStatus]=useState('全部'),[type,setType]=useState('全部类别'),[mine,setMine]=useState(false),[activeId,setActiveId]=useState(initialReviewId);
 const normalGuard=useRef(null);
 const active=reviews.find(r=>r.id===activeId),row=requirements.find(r=>r.id===active?.requirementId),Surface=inline?InlineReviewSurface:Drawer;
 const guard=next=>normalGuard.current?normalGuard.current(next):true;
 useEffect(()=>{const previous=registerNavigationGuard?null:window.__rfqRequestNavigation;const hook=next=>guard(next)&&(!previous||previous(next));if(registerNavigationGuard)return registerNavigationGuard(hook);window.__rfqRequestNavigation=hook;return()=>{if(window.__rfqRequestNavigation===hook)window.__rfqRequestNavigation=previous;};},[registerNavigationGuard]);
 useEffect(()=>{if(initialReviewId)setActiveId(initialReviewId);},[initialReviewId]);
 useEffect(()=>{if(embedded&&!activeId)onCloseEmbedded?.();},[embedded,activeId]);
 const open=r=>{const next=()=>setActiveId(r.id);if(guard(next))next();};
 const close=()=>setActiveId(null);
 const filtered=reviews.filter(r=>`${r.title} ${r.id} ${r.description||''} ${r.owner||''}`.toLowerCase().includes(query.toLowerCase())&&(status==='全部'||status==='已完成'?status==='全部'||isClosed(r):!isClosed(r))&&(type==='全部类别'||r.type===type)&&(!mine||getReviewActorIds(r).includes(actorId)));
 return <div className={`flow-page ${inline?'response-inline-review':''}`}>
  {!embedded&&<><div className="workbench-view-heading"><p className="muted">查看评审进度；全部评审人确认同一版应答后完成。</p></div><section className="panel"><div className="flow-filterbar flow-review-filters"><Field label="搜索事项"><UiInput className="input" placeholder="事项编号、名称或评审人" value={query} onChange={e=>setQuery(e.target.value)}/></Field><Field label="评审类别"><UiSelect className="select" value={type} onChange={e=>setType(e.target.value)}><option>全部类别</option>{[...new Set(reviews.map(r=>r.type).filter(Boolean))].map(t=><option key={t}>{t}</option>)}</UiSelect></Field><Field label="处理状态"><UiSelect className="select" value={status} onChange={e=>setStatus(e.target.value)}>{['全部','未完成','已完成'].map(s=><option key={s}>{s}</option>)}</UiSelect></Field><label className="flow-checkbox-label"><UiCheckbox type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)}/>仅看本人评审</label></div><div className="table-wrap"><BusinessTable className="data-table"><thead><tr><th>事项 / 关联应答</th><th>评审类别</th><th>评审人</th><th>确认进度</th><th>截止时间</th><th>操作</th></tr></thead><tbody>{filtered.map(r=>{const req=requirements.find(v=>v.id===r.requirementId),ids=getReviewActorIds(r);return <tr key={r.id}><td><UiButton className="text-link" onClick={()=>open(r)}>{r.title}</UiButton><small>{req?.clause} · {r.id}</small></td><td>{r.type||'—'}</td><td>{ids.map(id=>personName(appState,id)).join('、')||'待选择'}</td><td>{isClosed(r)?'全部已确认':`${ids.filter(id=>hasReviewConfirmation(r,req,id)).length} / ${ids.length} 人已确认`}</td><td>{r.deadline||'未设置'}</td><td><UiButton className="text-link" onClick={()=>open(r)}>{isClosed(r)?'查看结果':'处理评审'}</UiButton></td></tr>;})}</tbody></BusinessTable>{!filtered.length&&<NoRows title="暂无符合条件的事项">可从应答项发起评审。</NoRows>}</div></section></>}

  {active&&row&&<ResponseReviewPanel key={active.id} review={active} row={row} project={project} state={appState} actorId={actorId} onUpdateReview={onUpdateReview} onAdoptReview={onAdoptReview} canEdit={canBusinessAction('review',active.id)} Surface={Surface} onClose={close} initialAction={initialAction} registerGuard={fn=>{normalGuard.current=fn;return()=>{normalGuard.current=null;};}}/>}
 </div>;
}

const exportColumns = [
  { key: 'clause', label: '条款编号' }, { key: 'original', label: '客户要求' },
  { key: 'conclusion', label: '应答结论' }, { key: 'draft', label: '对外答复' },
  { key: 'conditions', label: '适用条件' }, { key: 'status', label: '确认状态' },
];
const defaultMapping = Object.fromEntries(exportColumns.map(({key}) => [key, key]));
const defaultTemplate = { id: 'standard', title: '标准 RFQ 应答矩阵', version: 'V2.1', description: '逐条列出客户要求、结论与最终答复，适合技术应答。' };

export function ExportPage({ project, requirements = [], reviews = [], snapshots = [], appState, permissionContext, onSnapshot, onExportScope,route,canBusinessAction,taskContextError,toast, navigate, actorRole,actorId, launchOnly = false, onClose, onSubmitted, logEvent = () => {} }) {
  const databaseBacked=appState?.dataSource==='mysql';
  const canDownload=canPerform(actorRole,'export:download',permissionContext);
  const canSubmit=canPerform(actorRole,'snapshot:submit',permissionContext);
  const projectSnapshots = snapshots.filter(s => s.projectId === project.id);
  const latest = latestSnapshot(projectSnapshots);
  const storedScope = appState?.exportScopesByProject?.[project.id] || latest?.approvalScope;
  const activeTemplate = storedScope?.template || defaultTemplate;
  const mapping = { ...(storedScope?.mapping || defaultMapping) };
  // Earlier versions let users leave a required field unmapped in a draft.
  for (const {key} of exportColumns) if (key !== 'status') mapping[key] = key;
  const [detailId, setDetailId] = useState(route?.snapshotId||null);
  const [action, setAction] = useState(launchOnly?'submit':null);
  useEffect(()=>setDetailId(route?.snapshotId||null),[route]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const detail = projectSnapshots.find((s) => s.id === detailId);
  const savedApproval = (() => { if(databaseBacked)return null;try { return JSON.parse(localStorage.getItem(`fep-rfq-management-approval-${project.id}`) || 'null'); } catch { return null; } })();
  const effectiveApproval = project.approvalConfig !== undefined ? project.approvalConfig : savedApproval || { final: '最终审批人' };
  const finalReviewConfig=(()=>{try{return {value:getProjectFinalReview(appState,project.id),error:''};}catch(e){return {value:null,error:e.message};}})();
  const requiredFinalReviewers=finalReviewConfig.value?getRequiredFinalReviewers(finalReviewConfig.value):[];
  const approvalConfigIssues=finalReviewConfig.error?[{id:'approval-config',label:'SR与技术组最终评审配置',message:finalReviewConfig.error}]:[];
  const storedDocuments=databaseBacked?null:readDocumentState(project.id),currentFiles=appState?.documentsByProject?.[project.id];
  const documentState = currentFiles !== undefined ? { files: currentFiles, parsed: (storedDocuments?.parsed||[]).filter(row=>currentFiles.some(file=>file.id===row.sourceFileId)) } : storedDocuments;
  const unimportedParsed = (documentState?.parsed || []).filter((r) => !requirements.some((current) => current.id === r.id));
  const unfinishedFiles = (documentState?.files || []).filter((f) => f.purpose === '要求来源' && !(documentState?.files || []).some((newer) => newer.previousVersionId === f.id) && ['排队中', '处理中', '失败'].includes(f.status));
  const documentIssues = [...unimportedParsed.map((r) => ({ id: `document-${r.id}`, label: `${r.clause} ${r.title}`, message: '解析条目尚未自动同步，请返回解析页完成同步' })), ...unfinishedFiles.map((f) => ({ id: `document-${f.id}`, label: f.name, message: f.status === '失败' ? `要求来源解析失败：${f.error || '请重试或补录'}` : `要求来源仍在${f.status}，请等待解析完成` }))];
  const exportIssues = getExportIssues(requirements, reviews, project.id);
  const issues = [...exportIssues, ...documentIssues, ...approvalConfigIssues];
  const unconfirmedComply=getUnconfirmedComplyRows(requirements,project.id);
  const approvalScope={...(databaseBacked?{format:'mysql-business-v1'}:{}),rows:requirements,sourceVersions:(documentState?.files||[]).filter(f=>f.purpose==='要求来源').map(f=>`${f.id}:${f.version}`),configuration:{equipment:project.equipment,approvalConfig:effectiveApproval,personnel:getFinalReviewScope(appState,project.id)},template:activeTemplate,mapping,attachments:[]};
  useEffect(()=>{onExportScope?.(approvalScope);},[JSON.stringify(approvalScope)]);
  const signature = (rows) => JSON.stringify(rows.map((r) => ({ id: r.id, version: r.version, status: r.status, original: r.original, conclusion: r.conclusion, draft: r.draft, conditions: r.conditions, evidence: r.evidence, reason: r.reason, owner: r.owner })).sort((a, b) => a.id.localeCompare(b.id)));
  function validity(snapshot) {
    if (!snapshot) return { valid: false, message: '未选择批准快照' };
    if (approvalConfigIssues.length) return { valid: false, message: approvalConfigIssues[0].message };
    if (snapshot.status !== '已批准') return { valid: false, message: snapshot.status === '审批中' ? '快照尚在审批中' : '快照未经批准' };
    if (!isFinalReviewApproved(snapshot)) return { valid: false, message: 'SR与技术组尚未完成本版本所需的全部评审' };
    if (documentIssues.length) return { valid: false, message: '来源资料仍有失败任务或未同步条目，请完成解析后重新提交' };
    const scope=databaseBacked?currentProjectScope(appState,project.id,snapshot):approvalScope;
    const scopeCheck=checkSnapshotValidity(snapshot,scope,latest);if(!scopeCheck.valid)return {valid:false,message:scopeCheck.reasons.join('；')};
    if (signature(snapshot.rows || []) !== signature(requirements)) return { valid: false, message: '当前工作内容或条目版本已变化，请重新提交新快照' };
    if (exportIssues.length) return { valid: false, message: '当前工作版本存在未确认内容或未关闭事项' };
    return { valid: true, message: '与当前工作版本一致，可以正式导出' };
  }
  const exportCheck = validity(latest);
  const previewRows = exportCheck.valid ? latest.rows : requirements;
  function locateIssue(issue) {
    closeAction();
    if(issue.route){navigate(issue.route.page,issue.route.requirementId,{...issue.route,returnKey:'export'});return;}
    if (issue.id === 'approval-config') navigate('settings');
    else navigate('response');
  }
  function closeAction() { if(launchOnly)onClose?.();else setAction(null); }
  function startAction(kind) { setAction(kind); setReason(''); setError(''); }
  function submitSnapshot() {
    if(!canSubmit)return setError('当前身份无提交快照权限');
    if (issues.length) { setError(`当前仍有 ${issues.length} 个检查项未通过，请返回修正。`); return; }
    if (latest?.status==='审批中'&&!latest.stale&&latest.approvalFingerprint===snapshotFingerprint(approvalScope)) {
      setAction(null); setDetailId(latest.id); toast('当前版本已在最终评审中'); onSubmitted?.(latest.id); return;
    }
    const returned=latest?.status==='已退回'?latest:null;
    const snapshot = { ...makeSnapshot(project.id, requirements, actorRole), ...(returned?{revisionOf:returned.id}:{}), approvalFingerprint:snapshotFingerprint(approvalScope),approvalScope:structuredClone(approvalScope),createdById:actorId,finalReview:structuredClone(finalReviewConfig.value),template: { ...activeTemplate }, mapping: { ...mapping }, approvalConfig: { ...effectiveApproval }, submissionReason: reason.trim() || '必需人工确认已完成，系统推荐Comply未人工确认项交由本轮评审核对', history: [{ id: uid('EVENT'), action: '提交快照审批', actor: actorRole, time: now(), reason: reason.trim() || '检查通过，冻结应答快照' }], attachments: [] };
    if(onSnapshot(snapshot)===false)return; logEvent('提交快照审批', snapshot.id, `${requirements.length} 条要求；系统推荐Comply未人工确认 ${unconfirmedComply.length} 条`); toast('已冻结快照，等待指定SR与技术组评审'); setAction(null); setDetailId(snapshot.id); onSubmitted?.(snapshot.id);
  }
  function reviewSnapshot() {
    const current = projectSnapshots.find((s) => s.id === detailId);
    if (!current || current.status !== '审批中') { setError('对象状态已变化，请返回快照列表核对'); return; }
    if (approvalConfigIssues.length) { setError(approvalConfigIssues[0].message); return; }
    if(!canBusinessAction('snapshot',current.id,'approve'))return setError('当前人员没有本轮最终评审任务');
    if (action === 'reject' && !reason.trim()) { setError('退回必须填写具体原因'); return; }
    if(action==='approve'&&!checkSnapshotValidity(current,approvalScope,latest).valid){setError('批准范围已经变化，请重新提交快照');return;}
    if (action === 'approve' && (signature(current.rows || []) !== signature(requirements) || exportIssues.length || documentIssues.length)) { setError('当前工作数据已变化或检查未通过，请退回原快照并提交新快照'); return; }
    const label = action === 'approve' ? '批准定稿' : '退回快照';
    let patch;
    try{const side=getRequiredFinalReviewers(current.finalReview).find(r=>r.actorId===actorId)?.side;patch=applyFinalReviewDecision(current,{actorId,side,result:action==='approve'?'approved':'rejected',reason});}catch(e){setError(e.message);return;}
    if(onSnapshot(patch)===false)return; logEvent(label,current.id,reason);toast(patch.status==='已批准'?'SR与技术组已全部通过，可正式导出':patch.status==='已退回'?'快照已退回，修改重提后需重新评审':'本人已通过，继续等待其他必需评审人');setAction(null);
  }

  async function downloadFormal() {
    if (!canDownload || !exportCheck.valid || exporting) return;
    setExporting(true);
    try {
      const path = `/projects/${encodeURIComponent(project.id)}/snapshots/${encodeURIComponent(latest.id)}/annotated-export`;
      const { blob, filename } = await api.download(path);
      downloadCraftBlob(blob, filename);
      toast('已生成带批注的正式应答');
    } catch (err) {
      toast(`导出失败：${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  }
  function snapshotTable(snapshot) { const priority=new Set(snapshot.unconfirmedComplyIds||[]),rows=[...(snapshot.rows||[])].sort((a,b)=>Number(priority.has(b.id))-Number(priority.has(a.id)));return <div className="table-wrap flow-snapshot-table"><BusinessTable className="data-table"><thead><tr><th>条款</th><th>客户要求</th><th>最终结论</th><th>冻结答复</th><th>必要条件</th><th>人工确认</th><th>版本</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.clause}</td><td>{r.original}</td><td><Badge value={r.conclusion} /></td><td>{r.draft}</td><td>{asText(r.conditions) || '—'}</td><td>{priority.has(r.id)?'未人工确认 · 系统推荐Comply':r.status==='已确认'?'已人工确认':r.status}</td><td>V{r.version || 1}</td></tr>)}</tbody></BusinessTable></div>; }

  const actionDialog = action && <Modal
    title={{ submit: '发起最终评审', approve: '通过本方最终评审', reject: '退回应答快照' }[action]}
    width={720} onClose={closeAction}
    footer={<>
      <UiButton className="btn" onClick={closeAction}>取消</UiButton>
      <UiButton className={action === 'reject' ? 'btn btn-danger' : 'btn btn-primary'}
        disabled={action === 'submit' && (issues.length > 0 || !!taskContextError)}
        onClick={action === 'submit' ? submitSnapshot : reviewSnapshot}>
        {{ submit: '确认发起', approve: '确认通过本方评审', reject: '确认退回' }[action]}
      </UiButton>
    </>}>
    {action === 'submit' ? <>
      <UnconfirmedComplyList rows={unconfirmedComply} onLocate={row=>locateIssue({id:row.id,route:{page:'response',requirementId:row.id,fileId:row.sourceFileId,sourceVersion:row.sourceVersion}})}/>
      <Notice type={issues.length ? 'warning' : 'info'}>{issues.length
        ? <>检查未通过，共 {issues.length} 个阻断项。修正后可再次提交。</>
        : <>检查通过，将冻结 {requirements.length} 条要求。提交后由指定 SR 与技术组按本轮规则评审。</>}</Notice>
      {issues.length > 0 && <div className="flow-modal-issues">{issues.map((issue, index) => <div key={issue.id+'-'+index}><strong>{issue.label}</strong><p>{issue.message}</p><UiButton className="text-link" onClick={() => locateIssue(issue)}>定位修正<ArrowRight size={13} /></UiButton></div>)}</div>}
      <dl className="flow-description">
        <dt>项目</dt><dd>{project.name}</dd>
        <dt>人工确认</dt><dd>{requirements.filter(row=>row.status==='已确认').length} / {requirements.length} 条已确认 · 系统推荐 Comply 未人工确认 {unconfirmedComply.length} 条</dd>
        <dt>SR 评审人</dt><dd>{requiredFinalReviewers.filter(r=>r.side==='sr').map(r=>personName(appState,r.actorId)).join('、')||'尚未配置'}</dd>
        <dt>技术评审人</dt><dd>{requiredFinalReviewers.filter(r=>r.side==='technical').map(r=>personName(appState,r.actorId)).join('、')||'尚未配置'}</dd>
        <dt>通过规则</dt><dd>SR 方通过 + {finalReviewConfig.value?.technicalMode==='representative'?'技术负责人代表通过':'技术组全员通过'}</dd>
        <dt>提交身份</dt><dd>{personName(appState,actorId)} · {actorRole}</dd>
        <dt>对外附件</dt><dd>0 个 · 不包含内部证据</dd>
      </dl>
    </> : <>
      <div className="flow-modal-object"><strong className="flow-snapshot-id">{detail?.id || '快照不可用'}</strong><span>{detail?.rows?.length || 0} 条</span></div>
      <Notice>{action === 'approve' ? '核对冻结内容及必要条件后批准。批准仅绑定本快照。' : '退回原因会保存至快照历史，修订后需重新提交评审。'}</Notice>
    </>}
    <Field label={action === 'reject' ? '退回原因' : action === 'submit' ? '发起说明' : '处理意见'} required={action === 'reject'} wide>
      <UiTextArea className="input flow-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === 'reject' ? '请说明需要修订的条目和原因' : '补充说明（选填）'} />
    </Field>
    {error && <p className="flow-error-inline" role="alert">{error}</p>}
  </Modal>;
  if(launchOnly)return actionDialog;
  return <div className="flow-page">

    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>条款结果预览</h2>
          <span className="muted flow-small">{exportCheck.valid ? '已批准快照' : '当前工作版本'} · {previewRows.length} 条</span>
        </div>
        <UiButton className="btn btn-primary" disabled={!canDownload || !exportCheck.valid} loading={exporting} onClick={downloadFormal}>
          <Download size={16}/>导出文档
        </UiButton>
      </div>
      {(!canDownload || !exportCheck.valid) && <Notice>{canDownload ? exportCheck.message : '正式文档仅由 SR 导出。'}</Notice>}
      {previewRows.length ? <>
        <div className="table-wrap"><BusinessTable className="data-table">
          <thead><tr>{exportColumns.map(({key,label}) => <th key={key}>{label}</th>)}</tr></thead>
          <tbody>{previewRows.slice((page - 1) * 6, page * 6).map(row => <tr key={row.id}>
            <td>{row.clause || '—'}</td>
            <td className="flow-preview-requirement">{row.original}</td>
            <td><Badge value={row.conclusion}/></td>
            <td className="flow-preview-reply">{row.draft || '—'}</td>
            <td>{asText(row.conditions) || '—'}</td>
            <td>{row.status && <Badge value={exportCheck.valid && latest.unconfirmedComplyIds?.includes(row.id) ? '最终评审已通过（未逐条人工确认）' : row.status}/>}</td>
          </tr>)}</tbody>
        </BusinessTable></div>
        <Pager count={previewRows.length} page={page} onChange={setPage}/>
      </> : <NoRows title="暂无可预览条款">解析客户要求后可在这里查看条款结果。</NoRows>}
    </section>
    {detail && <Drawer title="应答快照 · 只读审批" width={1000} onClose={() => setDetailId(null)} footer={<><UiButton className="btn" onClick={() => setDetailId(null)}>关闭</UiButton>{detail.status === '审批中' && <><UiButton className="btn btn-danger" disabled={!canBusinessAction('snapshot',detail.id,'approve')} onClick={() => startAction('reject', detail.id)}>退回</UiButton><UiButton className="btn btn-primary" disabled={!canBusinessAction('snapshot',detail.id,'approve')} onClick={() => startAction('approve', detail.id)}>通过本方评审</UiButton></>}</>}><UnconfirmedComplyList frozen rows={(detail.rows||[]).filter(row=>detail.unconfirmedComplyIds?.includes(row.id))}/><div className="flow-detail-top"><div><span className="muted flow-small">固定快照编号</span><h3 className="flow-snapshot-id">{detail.id}</h3></div><Badge value={detail.status} /></div><dl className="flow-description"><dt>提交人 / 时间</dt><dd>{detail.createdBy} / {new Date(detail.createdAt).toLocaleString('zh-CN', { hour12: false })}</dd><dt>批准人</dt><dd>{detail.reviewedBy || '查看下方逐人评审记录'}</dd><dt>处理意见</dt><dd>{detail.reviewReason || detail.submissionReason || '—'}</dd><dt>外发附件</dt><dd>0 个；内部证据不自动作为对外附件</dd></dl><Notice type={detail.status === '已批准' && !validity(detail).valid ? 'warning' : 'info'}>{detail.stale ? '本轮快照已失效，请按当前人员与规则重新提交。' : detail.status === '已批准' ? validity(detail).message : '此处展示冻结快照，不随当前工作内容修改。当前身份：' + actorRole + '；SR与技术组均须通过。'}</Notice><FinalReviewProgress snapshot={detail} appState={appState}/><h4 className="flow-spaced">冻结应答内容（{detail.rows?.length || 0} 条）</h4>{snapshotTable(detail)}<h4 className="flow-spaced">审批与导出记录</h4><div className="flow-timeline">{(detail.history || []).map((entry, index) => <div className="flow-timeline-item" key={entry.id || index}><i /><strong>{entry.action}</strong><small>{entry.time} · {entry.actor}</small><p>{entry.reason}</p></div>)}{(detail.exports || []).map((record) => <div className="flow-timeline-item" key={record.id}><i /><strong>正式导出 CSV</strong><small>{record.createdAt} · {record.actor}</small><p>{record.filename}</p></div>)}</div></Drawer>}
    {actionDialog}
  </div>;
}

function FinalReviewProgress({snapshot,appState}){
 let required;try{required=getRequiredFinalReviewers(snapshot.finalReview);}catch{return <Notice>历史快照缺少SR与技术组完整评审记录；重新提交后才能按新规则正式导出。</Notice>;}
 return <section className="panel personnel-panel"><div className="panel-header"><h3>本轮逐人最终评审</h3><UiTag className="badge">{snapshot.finalReview.technicalMode==='all'?'技术组全员通过':'技术负责人代表通过'}</UiTag></div><div className="table-wrap"><BusinessTable className="data-table"><thead><tr><th>评审方</th><th>指定人员</th><th>结果</th><th>意见</th></tr></thead><tbody>{required.map(r=>{const vote=r.side==='sr'?snapshot.finalReview.decisions?.sr:snapshot.finalReview.decisions?.technicalByActorId?.[r.actorId];return <tr key={r.actorId}><td>{r.side==='sr'?'SR方':'技术方'}</td><td>{personName(appState,r.actorId)}</td><td>{vote?.result==='approved'?'已通过':vote?.result==='rejected'?'已退回':snapshot.stale?'本轮已失效':snapshot.status==='已退回'?'本轮已取消':'待评审'}</td><td>{vote?.reason||'—'}</td></tr>;})}</tbody></BusinessTable></div></section>;
}
