import AnnotationConnector from '../components/AnnotationConnector';
import AnnotationPanel from '../components/AnnotationPanel';
import ProjectActivityPanel from '../components/ProjectActivityPanel';
import './rfq-detail.css';
import SourceDocumentPane from '../components/SourceDocumentPane';
import SourceProcessingPane from '../components/SourceProcessingPane';
import {getProjectSourceSummary} from '../projectSelectors';
import RequirementOutline from '../components/RequirementOutline';
import {makeSourceAnchor} from '../documentAnchors';
import {makeDocumentDemo} from '../documentMocks';
import {canPerform} from '../permissions';
import {resourceStorageKey,selectReadableResources} from '../resourceVisibility';
import {MODELS,PROCESSES,CAPABILITIES} from '../modelProcessSeeds';
import {assertCapabilityProcess} from '../modelProcessDomain';
import {getSourceUploadRoute} from '../navigation';
import React, { useEffect, useRef, useState } from 'react';
import { Search, RefreshCw, ArrowRight, Check, ChevronLeft, ChevronRight, ChevronDown, FileText, Layers, BookOpen, History, AlertCircle, ExternalLink, Plus, Save, Send, X, Filter, CheckCircle2, MoreHorizontal } from 'lucide-react';
import { Modal, Drawer, StatusBadge, EmptyState } from '../components/ui';
import { confirmationValidation } from '../domain';
import './response-page.css';
import { sectionLabel } from '../documentStructure';
import AssessmentPanel from '../components/AssessmentPanel';
import RecommendedWording from '../components/RecommendedWording';
import { generateRecommendedWording } from '../responseAdvice';
import { matchingSuggestion } from '../responseRecommendation';
import ApprovalRoute from '../components/ApprovalRoute';
import { ReviewsPage } from './WorkflowPages';
import { getReviewRoute } from '../rfqWorkflow';
import './rfq-enhancements.css';
import ResponseQueue,{ResponseIssues} from '../components/ResponseQueue';
import {selectResponseQueue,responseQueueCounts,nextResponseRequirement,responseQueueRoute,responseReviewRoute} from '../responseQueue';
import {assertBusinessAction} from '../taskDomain';
import './unified-response.css';

const uid = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5)}`;
const timestamp = () => new Date().toLocaleString('zh-CN', { hour12: false });
const read = (key, fallback = []) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
const toForm = (row) => ({ original: row?.original || '', conclusion: row?.conclusion || '待确认', draft: row?.draft || '', conditions: row?.conditions || '', reason: row?.reason || '', evidence: row?.evidence || '' });
const formFields = ['original', 'conclusion', 'draft', 'conditions', 'reason', 'evidence'];
function Notice({ children, warning = false }) { return <div className={`response-notice ${warning ? 'response-notice-warning' : ''}`}><AlertCircle size={15} /><div>{children}</div></div>; }
function Field({ label, required, children, wide }) { return <label className={`field ${wide ? 'response-wide' : ''}`}><span>{required && <i className="response-required">*</i>}{label}</span>{children}</label>; }
function Description({ rows }) { return <dl className="response-description">{rows.map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value || '—'}</dd></React.Fragment>)}</dl>; }

export function ResponsePage({ detailPanels = {}, project, requirements = [], reviews = [], onUpdateRequirement, onConfirm, onCreateReview, onUpdateReview, onConfirmReviewed, toast, navigate, actorRole, focusedRequirementId, route, appState,onAppUpdate,actorId,canBusinessAction,onAdoptReview,onSubmitRequirement,onAnalysisRun, logEvent = () => {} }) {
  const initialRow = requirements.find((row) => row.id === focusedRequirementId) || requirements.find(row => /\.docx?$/i.test(row.source || '')) || requirements[0];
  const [activeId, setActiveId] = useState(initialRow?.id || null);
  const active = requirements.find((r) => r.id === activeId) || requirements[0];
  const [form, setForm] = useState(() => toForm(initialRow));
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const baseline = useRef({ id: initialRow?.id, version: initialRow?.version, status: initialRow?.status });
  const savedFilters=read(`rfq.response.filters.${project.id}`,{});
  const [query, setQuery] = useState(savedFilters.query||'');
  const [status, setStatus] = useState(savedFilters.status||'全部状态');
  const [section, setSection] = useState(savedFilters.section||'全部章节');
  const [owner, setOwner] = useState('全部责任人');
  const [special, setSpecial] = useState('全部要求');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [quoteDraft,setQuoteDraft]=useState(null),[proposalReason,setProposalReason]=useState('');
  const [detailTab, setDetailTab] = useState(['response','reviews'].includes(route?.page) ? 'response' : route?.page || 'settings');
  const [queueFilter,setQueueFilter]=useState('all'),[queueQuery,setQueueQuery]=useState(''),[issuesOpen,setIssuesOpen]=useState(false);
  const [queueVisible,setQueueVisible]=useState(true),[actionFeedback,setActionFeedback]=useState(null);
  const confirmationLock=useRef(0);
  const [outlineOpen, setOutlineOpen] = useState(false), [activeCommentId, setActiveCommentId] = useState(null);
  const detailLayoutRef = useRef(null), detailSideRef = useRef(null);
  const projectComments = appState.commentsByProject?.[project.id] || [];
  useEffect(() => { setDetailTab(route?.page==='reviews'?'response':route?.page || 'response'); }, [route?.page]);
  const [processTab,setProcessTab]=useState('差距与应答'),[showResponses,setShowResponses]=useState(true);
  useEffect(() => { if (!(detailTab === 'response' && processTab === '批注与记录' && activeCommentId)) detailSideRef.current?.scrollTo({ top: 0 }); }, [detailTab]);
  const [rightTab, setRightTab] = useState(initialRow?.matchLevel === 'history' ? 'history' : ['capability', 'none'].includes(initialRow?.matchLevel) ? 'capability' : 'standard');
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmNext, setConfirmNext] = useState(true);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [batchResults, setBatchResults] = useState(null);
  const [batchSummary, setBatchSummary] = useState({ total: 0, eligible: 0, excluded: 0 });
  const automaticReviews = useRef(new Set());
  const [transition, setTransition] = useState(null);
  const [adoption, setAdoption] = useState(null);
  const [reviewForm, setReviewForm] = useState(null);
  const [inlineReviewId, setInlineReviewId] = useState(null), [inlineReviewAction,setInlineReviewAction] = useState(null);
  const linkedReviews = reviews.filter((review) => review.requirementId === active?.id);
  const openReview = linkedReviews.find(review => !['已关闭','已取消'].includes(review.status));
  const closedReview = linkedReviews.find(review => review.status === '已关闭' && review.kind !== 'clarification');
  const reassessing = !openReview && (active?.status === '已确认' || !!closedReview);
  function showInlineReview(id,action=null){const review=reviews.find(item=>item.id===id),row=requirements.find(item=>item.id===review?.requirementId)||active;if(row)navigate('reviews',row.id,responseReviewRoute(row,id,{route,task:appState.tasksById?.[route?.taskId]}));setInlineReviewId(id);setInlineReviewAction(action);}
  function openInlineReview(id, action = null) { const next = () => showInlineReview(id,action); if (requestTransition(next)) next(); }
  function startAssessment() { if(reassessing&&closedReview)openInlineReview(closedReview.id,'reopen');else startReview(reassessing?'rereview':'review'); }
  const [capabilityForm, setCapabilityForm] = useState(null);
  const [savedCandidate, setSavedCandidate] = useState(null);
  const [historyDetail, setHistoryDetail] = useState(null);
  const [activities, setActivities] = useState(() => read(`rfq.response.events.${project.id}`, []));
  const [matching, setMatching] = useState(false);
  const [retrievalMode, setRetrievalMode] = useState('normal');
  const [retrievalById, setRetrievalById] = useState({});
  const timer = useRef(null);
  const candidateDirty = useRef(false);
  const staleSource=route?.requirementId===active?.id&&((route?.sourceVersion&&route.sourceVersion!==String(active?.sourceVersion||'1'))||(route?.fileId&&route.fileId!==(active?.sourceFileId||active?.source)));
  const canEdit = actorRole !== '最终审批人'&&!staleSource&&canBusinessAction('requirement',active?.id);
  const canConfirm = ['SR','技术'].includes(actorRole)&&!staleSource&&canBusinessAction('requirement',active?.id,'confirm');
  const suggestion = matchingSuggestion(active, project.id);
  const recommendedWording = generateRecommendedWording({ ...active, ...form });
  const retrieval = retrievalById[active?.id] || 'normal';
  const states = active ? { standard: active.matchLevel === 'standard' && active.score > 80 ? '命中' : '未命中', history: active.matchLevel === 'standard' && active.score > 80 ? '未执行' : active.matchLevel === 'history' ? '命中' : '未命中', capability: (active.matchLevel === 'standard' && active.score > 80) || active.matchLevel === 'history' ? '未执行' : active.matchLevel === 'capability' ? '命中' : '未命中' } : {};
  if (retrieval === 'failed') Object.assign(states, { standard: '失败', history: '未执行', capability: '未执行' });
  if (retrieval === 'denied') Object.assign(states, { standard: '无权限', history: '未执行', capability: '未执行' });
  const conflicted = active && baseline.current.id === active.id && dirty && (baseline.current.version !== active.version || baseline.current.status !== active.status);
  const filtered = requirements.filter((r) => `${r.clause} ${r.title} ${r.original}`.toLowerCase().includes(query.toLowerCase()) && (status === '全部状态' || r.status === status) && (section === '全部章节' || JSON.stringify([r.sourceFileId || r.source, sectionLabel(r)]) === section) && (owner === '全部责任人' || r.owner === owner) && (special === '全部要求' || special === '无历史命中' && ['capability', 'none'].includes(r.matchLevel) || special === '条件差异' && r.conclusion === '有条件 Comply' || special === '关键要求' && (r.keyRequirement || /安全|精度|交货|验收/.test(r.title))));
  const shown = filtered.slice((page - 1) * 6, page * 6);
  const selectedRows = requirements.filter((r) => selected.includes(r.id));
  const batchReasons = (row) => [...(!canConfirm ? ['当前身份无条目确认权限'] : []), ...(row.status === '已确认' ? ['当前版本已确认'] : []), ...(row.status === '评审中' ? ['存在待处理专业评审'] : []), ...((row.matchLevel !== 'standard' || row.score <= 80) ? ['不符合标准回复相似度 >80% 的批量条件，请逐条确认'] : []), ...confirmationValidation(row)];
  const eligibleBatch = selectedRows.filter((r) => batchReasons(r).length === 0);
  const queueMode=actorRole==='SR'?'submit':'confirm';
  function queueCanAct(row,mode=queueMode){try{return assertBusinessAction(appState,{projectId:project.id,objectType:'requirement',objectId:row.id,action:mode==='submit'?'submit-requirement':'confirm',route:{page:'response',projectId:project.id}});}catch{return false;}}
  const queueOptions={filter:queueFilter,query:queueQuery,mode:queueMode,canAct:queueCanAct};
  const queueRows=selectResponseQueue(requirements,reviews,queueOptions);
  const queueCounts=responseQueueCounts(requirements,reviews,queueOptions);
  const nextQueueRow=nextResponseRequirement(queueRows,active?.id,{mode:queueMode,canAct:queueCanAct});
  const candidates = active ? Array.from({ length: showMore ? 5 : 3 }, (_, index) => ({ id: `HIST-${active.clause}-${index + 1}`, project: `历史参考 RFQ-${index === 0 ? '2025-018' : index === 1 ? '2025-011' : `2024-00${index + 1}`}（模拟）`, date: `2025-${String(9 - index).padStart(2, '0')}-18`, model: active.realSource ? 'DEMO-YAG 150 · 模拟历史配置' : index === 0 ? 'DEMO-CUT 300 · V2.1' : 'DEMO-CUT 300 · V2.0', config: index === 0 ? '选配 X / 历史确认配置' : '标准配置 / 工况待比对', original: active.original, answer: suggestion.draft, conditions: suggestion.conditions || '仅适用历史案例记载的材料、厚度、工艺与验收方法；需核对本次条件。', evidence: suggestion.evidence || '模拟历史批准记录 V3，适用性待核对', difference: active.conclusion === '有条件 Comply' ? '本次选配、材料或测试条件尚未全部确认，与历史条件存在差异。' : '设备版本、材料与验收方案需逐项核对；相似要求不代表条件完全一致。', feedback: index === 0 ? '客户已接受（模拟记录）' : '未记录', acceptance: index === 0 ? '未记录' : '未记录', version: `V${3 - Math.min(index, 2)}` })) : [];

  useEffect(()=>{localStorage.setItem(`rfq.response.filters.${project.id}`,JSON.stringify({query,status,section}));},[query,status,section]);
  function addActivity(action, detail, id = active?.id) { const entry = { id: uid('EVT'), requirementId: id, action, detail, time: timestamp(), actor: actorRole }; setActivities((old) => [entry, ...old]); logEvent(action, id || project.id, detail); }
  function clearDirty() { dirtyRef.current = false; setDirty(false); }
  function hydrate(row) { if (!row) return; setActiveId(row.id); setForm(toForm(row)); baseline.current = { id: row.id, version: row.version, status: row.status }; clearDirty(); setRightTab(row.matchLevel === 'history' ? 'history' : ['capability', 'none'].includes(row.matchLevel) ? 'capability' : 'standard'); setCandidateIndex(0); setShowMore(false); setError(''); }
  function edit(field, value) { setForm((old) => ({ ...old, [field]: value })); dirtyRef.current = true; setDirty(true); }
  function requestTransition(next) { if (dirtyRef.current || candidateDirty.current) { setTransition({ next }); return false; } return true; }
  function guardedDetail(next) { if (!window.__rfqRequestNavigation || window.__rfqRequestNavigation(next)) next(); }
  function chooseRow(row) { if (!row) return; guardedDetail(() => { confirmationLock.current=0;hydrate(row); setQuoteDraft(null); setActiveCommentId(null); setActionFeedback(null);setProcessTab('差距与应答');navigate('response', row.id, responseQueueRoute(row)); }); }
  function completeQueueAction(row,mode,advance=true){
    clearDirty();setModal(null);
    const next=advance?nextResponseRequirement(queueRows,row.id,{mode,canAct:candidate=>queueCanAct(candidate,mode)}):null;
    setActionFeedback({id:row.id,clause:row.clause,title:row.title,mode,advanced:!!next,complete:advance&&!next});
    if(next){hydrate(next);setQuoteDraft(null);setActiveCommentId(null);setProcessTab('差距与应答');navigate('response',next.id,responseQueueRoute(next));detailSideRef.current?.scrollTo({top:0,behavior:'smooth'});}
  }
  function submitAndAdvance(){if(Date.now()<confirmationLock.current)return;if(dirty&&!saveDraft())return;confirmationLock.current=Date.now()+450;if(onSubmitRequirement(active.id)===false)return;completeQueueAction(active,'submit');}
  function openProjectReview(review){const row=requirements.find(r=>r.id===review.requirementId);guardedDetail(()=>{setIssuesOpen(false);if(row){hydrate(row);setProcessTab('差距与应答');navigate('response',row.id,responseQueueRoute(row));}setInlineReviewId(review.id);setInlineReviewAction(null);});}
  useEffect(()=>{if(route?.page!=='reviews')return;if(route.reviewId){const review=reviews.find(r=>r.id===route.reviewId);if(review){const row=requirements.find(r=>r.id===review.requirementId);if(row)hydrate(row);setInlineReviewId(review.id);}}else setIssuesOpen(true);},[route?.page,route?.reviewId]);
  function focusSource(anchor, { quote, commentId } = {}) {
    const row = requirements.find(r => r.id === anchor.requirementId);
    if (!row) return;
    const next = () => {
      if (row.id !== active?.id) hydrate(row);
      setDetailTab('response'); setOutlineOpen(false); setActiveCommentId(commentId || null);
      setQuoteDraft(quote ? { quote, anchor } : null);
      setProcessTab(quote || commentId ? '批注与记录' : '差距与应答');
      if (quote) detailSideRef.current?.scrollTo({ top: 0 });
      navigate('response', row.id, {...responseQueueRoute(row),fileId: anchor.fileId, sourceVersion: anchor.sourceVersion});
    };
    guardedDetail(next);
  }
  function changeDetailTab(key) {
    if (key !== 'activity') { navigate(key, active?.id, { fileId: route?.fileId || active?.sourceFileId || active?.source, sourceVersion: route?.sourceVersion || String(active?.sourceVersion || '1') }); return; }
    const next = () => setDetailTab(key);
    if (!window.__rfqRequestNavigation || window.__rfqRequestNavigation(next)) next();
  }
  function goPage(key) { navigate(key); }
  function saveDraft(reasonOverride) {
    if (!active || !canEdit) { toast('当前身份不能修改应答草稿'); return false; }
    if (conflicted) { setError('条目版本已变化，请保留当前输入并返回核对最新版本，不能覆盖保存。'); setModal('conflict'); return false; }
    const patch = { ...form, ...(reasonOverride ? { reason: reasonOverride } : {}) };
    if (onUpdateRequirement(active.id, patch,baseline.current.version||1) === false) return false;
    clearDirty(); addActivity('保存应答草稿', '草稿已保存，未自动确认'); toast('草稿已保存；最终确认状态仍需单独操作'); return true;
  }
  useEffect(() => { localStorage.setItem(`rfq.response.events.${project.id}`, JSON.stringify(activities)); }, [activities, project.id]);
  useEffect(() => { if (!dirtyRef.current && active) { setForm(toForm(active)); baseline.current = { id: active.id, version: active.version, status: active.status }; } }, [active?.id, active?.version, active?.status]);
  useEffect(() => { setPage(1); }, [query, status, section, owner, special]);
  useEffect(() => { const index = requirements.findIndex((row) => row.id === focusedRequirementId); if (index >= 0) {setPage(Math.floor(index / 6) + 1);if(focusedRequirementId!==activeId){confirmationLock.current=0;hydrate(requirements[index]);}} }, [focusedRequirementId]);
  useEffect(() => { setPage((old) => Math.min(old, Math.max(1, Math.ceil(filtered.length / 6)))); }, [filtered.length]);
  useEffect(() => { const previous = window.__rfqRequestNavigation; const hook = (next) => requestTransition(next) && (!previous || previous(next)); window.__rfqRequestNavigation = hook; const beforeUnload = (e) => { if (dirtyRef.current || candidateDirty.current) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', beforeUnload); return () => { if (window.__rfqRequestNavigation === hook) { if (previous) window.__rfqRequestNavigation = previous; else delete window.__rfqRequestNavigation; } window.removeEventListener('beforeunload', beforeUnload); clearTimeout(timer.current); }; }, []);
  useEffect(() => {
    if (!pendingConfirmation) return;
    const current = requirements.find((r) => r.id === pendingConfirmation.id);
    if (!current || !formFields.every((field) => current[field] === pendingConfirmation.expected[field])) return;
    setPendingConfirmation(null);
    const success = onConfirm(current.id,current.version||1);
    if (success !== false) { addActivity('确认应答', `绑定条目版本 V${current.version || 1}`, current.id);completeQueueAction(current,'confirm',pendingConfirmation.next); }
  }, [requirements, pendingConfirmation]);

  function beginConfirm() { setError(''); setConfirmReason(''); setModal('confirm'); }
  function confirmOne() {
    if(Date.now()<confirmationLock.current)return;
    if (!active || !canConfirm) { setError('请切换为技术后确认；最终快照批准由独立最终审批人完成。'); return; }
    const issues = confirmationValidation({ ...active, ...form });
    if (issues.length) { setError(issues.join('；'));setModal('confirm'); return; }
    if (dirty && !confirmReason.trim()) { setError('修改后确认必须填写本次修改原因'); return; }
    if (conflicted) { setModal('conflict'); return; }
    confirmationLock.current=Date.now()+450;
    if (dirty) {
      const expected = { ...form, reason: confirmReason.trim() || form.reason };
      if (onUpdateRequirement(active.id, expected,baseline.current.version||1) === false) return;
      setForm(expected); clearDirty(); setPendingConfirmation({ id: active.id, expected, next: confirmNext });
    } else if (onConfirm(active.id,active.version||1) !== false) { addActivity('确认应答', `绑定条目版本 V${active.version || 1}`);completeQueueAction(active,'confirm',confirmNext); }
  }
  function batchConfirm() {
    if (dirtyRef.current) { setError('当前条目存在未提交修改，请先确认当前条目再执行批量确认'); return; }
    const results = selectedRows.map((row) => { const exclusions = batchReasons(row); if (exclusions.length) return { ...row, result: '已排除', message: exclusions.join('；') }; const ok = onConfirm(row.id,row.version||1) !== false; return { ...row, result: ok ? '确认成功' : '确认失败', message: ok ? `已绑定 V${row.version || 1}` : '重新校验未通过，请查看当前条目或未关闭评审' }; });
    setBatchSummary({ total: selectedRows.length, eligible: eligibleBatch.length, excluded: selectedRows.length - eligibleBatch.length }); setBatchResults(results); setSelected((old) => old.filter((id) => !results.some((r) => r.id === id && r.result === '确认成功'))); addActivity('批量确认结果', `明确选择 ${selectedRows.length} 条，成功 ${results.filter((r) => r.result === '确认成功').length} 条`); setModal('batch-result');
  }
  function adoptSuggestion(next, label) {
    if (!canEdit) return toast('当前身份只读，不能采用或修改应答');
    const proposal = { ...form, conclusion: next.conclusion || suggestion.conclusion, draft: next.answer || next.draft, conditions: next.conditions || '', evidence: next.evidence || '', reason: form.reason };
    if (form.draft.trim() || dirty) { setAdoption({ proposal, label }); return; }
    applyAdoption(proposal, label);
  }
  function applyAdoption(proposal, label) { setForm(proposal); dirtyRef.current = true; setDirty(true); setAdoption(null); addActivity('采用匹配建议', `${label}；保留条件和来源版本；尚未确认`); toast('建议已带入编辑区，请核对条件并保存 / 确认'); }
  function startReview(kind = 'review', candidate = null) {
    if (!active) return;
    setReviewForm({ kind, title: kind === 'rereview' ? `${active.title} · 重新专项评审` : kind === 'reject' ? `${active.title} · 匹配结果未接受` : `${active.title} · ${kind === 'clarify' ? '客户澄清' : '专项评审'}`, type: kind === 'reject' ? '匹配结果未接受' : kind === 'clarify' ? '客户澄清' : active.matchLevel === 'none' ? '知识缺口' : '条件差异', source: kind === 'clarify' ? '客户要求待澄清' : kind === 'rereview' ? '重新评审' : kind === 'reject' ? '用户未接受' : active.matchLevel === 'none' ? '知识库中没有' : active.score < 80 ? '置信度低' : '人工发起专项评审', owner: kind === 'clarify' ? 'SR' : '技术', deadline: project.deadline || '2026-10-28', description: candidate ? `参考 ${candidate.project} ${candidate.version}；${candidate.difference}` : '', evidence: form.evidence, plan: '', impact: '' }); setError('');
  }
  function submitReview() {
    if (!reviewForm.title.trim() || !reviewForm.type || !reviewForm.owner.trim() || !reviewForm.deadline || !reviewForm.description.trim()) { setError('请补齐事项标题、类型、责任人、截止时间和问题说明 / 拒绝理由。'); return; }
    if (dirty && !saveDraft()) return;
    const created = onCreateReview({ kind:reviewForm.kind==='clarify'?'clarification':'review',requirementId: active.id, requirementVersion:active.version||1, title: reviewForm.title, type: reviewForm.type, source: reviewForm.source, owner: reviewForm.owner, deadline: reviewForm.deadline, description: `${reviewForm.description}${reviewForm.evidence ? `\n证据：${reviewForm.evidence}` : ''}`, plan: reviewForm.plan, impact: reviewForm.impact });
    if (created === false) return;
    showInlineReview(created); addActivity(reviewForm.kind === 'clarify' ? '发起客户澄清' : reviewForm.kind === 'reject' ? '明确拒绝本条匹配并建立偏离' : '发起专项评审', reviewForm.description); setReviewForm(null); toast('关联事项已创建，可直接在当前条目处理');
  }
  function rematch() { if(!canPerform(actorRole,'analysis:run')||!canEdit)return; setModal(null); setMatching(true); const id = active.id; timer.current = setTimeout(() => { setRetrievalById((old) => ({ ...old, [id]: retrievalMode })); setMatching(false);onAnalysisRun?.({id:uid('RUN'),fileId:active.sourceFileId||active.source,sourceVersion:active.sourceVersion,type:'match',status:retrievalMode==='normal'?'完成':'失败',startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),successCount:retrievalMode==='normal'?1:0,failedCount:retrievalMode==='normal'?0:1,needsHumanCount:active.matchLevel==='none'?1:0}); addActivity('重新分级匹配', retrievalMode === 'normal' ? '标准回复 → 历史 RFQ → 能力边界；保留人工答复' : retrievalMode === 'failed' ? '检索服务模拟失败；未修改人工答复' : '当前检索来源模拟无权限；不展示名称与摘要', id); toast(retrievalMode === 'normal' ? '匹配结果已刷新，人工答复与确认状态保持当前值' : '检索未完成，请查看状态与重试入口'); }, 900); }
  function openCapability() {
    if(!canPerform(actorRole,'resource:edit',capabilityContext))return;
    if(!capabilityModels.length)return toast('本BU尚无可用机型，请先由BU管理员配置机型与工艺。','error');
    setCapabilityForm({buId:project.buId,projectId:project.id,modelId:'',processId:'',modelContext:project.equipment,config:'',metric:active.title,value:'',valueType:'保证值',conditions:form.conditions,limits:'',evidence:'',sourceLocation:`${project.id} / ${active.id} / ${active.source} 第 ${active.sourcePage} 页`,approver:'BU管理员'}); candidateDirty.current = true; setError('');
  }
  function saveCapability() {
    if(!canPerform(actorRole,'resource:edit',capabilityContext))return false;
    try{assertCapabilityProcess(capabilityForm,{models:capabilityModels,processes:capabilityProcesses,buId:project.buId});}catch(e){setError(e.message);return false;}
    if (!capabilityForm.metric.trim() || !capabilityForm.value.trim() || !capabilityForm.config.trim() || !capabilityForm.conditions.trim()) { setError('请填写能力指标、实际能力值、配置与适用条件；证据可在维护页继续补齐。'); return false; }
    const item = { ...capabilityForm, id: uid('CAP'), version: 1, source: '手动补充', status: '草稿', validity: '未发布', submitterRole: actorRole, submitterId:actorId, refs: [{ id: active.id, title: `${project.id} · ${active.title}` }], history: [{ date: new Date().toISOString().slice(0, 10), text: `${actorRole} 在 RFQ 比对中补充候选；不改变当前应答` }] };
    const key=resourceStorageKey('rfq.reference.capabilities.v1',project.buId);
    localStorage.setItem(key, JSON.stringify([...read(key,project.buId==='BU-DEMO'?CAPABILITIES:[]), item]));
    addActivity('补充能力候选', `${item.id} V1；候选未发布，当前应答不变`); setSavedCandidate(item); setCapabilityForm(null); candidateDirty.current = false; toast(`${item.id} 已保存为能力候选，当前结论未变化`); return true;
  }

  const capabilityContext={state:appState,actorId,buId:project.buId,projectId:project.id};
  const capabilityModels=selectReadableResources(read(resourceStorageKey('rfq.reference.models.v1',project.buId),project.buId==='BU-DEMO'?MODELS:[]),capabilityContext,'catalog');
  const capabilityProcesses=selectReadableResources(read(resourceStorageKey('rfq.reference.processes.v1',project.buId),project.buId==='BU-DEMO'?PROCESSES:[]),capabilityContext,'catalog');
  const capabilityEvidence=selectReadableResources(read(resourceStorageKey('rfq.reference.evidence.v1',project.buId)),capabilityContext,'evidence');
  const sourceSummary=getProjectSourceSummary(appState,project.id);
  const detailNavigation=<div className="rq-topbar"><nav className="rq-tabs" aria-label="RFQ 详情分区">{[['settings','基本信息'],['response','应答项处理'],['versions','历史版本'],['activity','协作记录']].map(([key,label])=><button key={key} className={detailTab===key?'active':''} aria-current={detailTab===key?'page':undefined} onClick={()=>changeDetailTab(key)}>{label}</button>)}</nav><div className="rq-top-actions">{detailTab==='response'&&<button onClick={()=>setQueueVisible(!queueVisible)} aria-expanded={queueVisible}><BookOpen size={14}/>{queueVisible?'收起清单':'应答清单'}</button>}<button onClick={()=>guardedDetail(()=>setIssuesOpen(true))}><Layers size={14}/>项目事项<span>{reviews.length}</span></button></div></div>;
  const projectIssuesPanel=issuesOpen&&<Drawer title="项目评审与澄清" width={760} onClose={()=>setIssuesOpen(false)}><div className="rq-project-issues"><ReviewsPage appState={appState} project={project} requirements={requirements} reviews={reviews} actorRole={actorRole} actorId={actorId} canBusinessAction={canBusinessAction} toast={toast} navigate={navigate} logEvent={logEvent} onUpdateReview={onUpdateReview} onConfirmReviewed={onConfirmReviewed} onSelectReview={openProjectReview}/></div></Drawer>;
  const inlineReviewPanel=inlineReviewId&&<ReviewsPage appState={appState} project={project} requirements={requirements} reviews={reviews} actorRole={actorRole} actorId={actorId} canBusinessAction={canBusinessAction} toast={toast} navigate={navigate} logEvent={logEvent} onUpdateReview={onUpdateReview} onConfirmReviewed={onConfirmReviewed} embedded initialAction={inlineReviewAction} initialReviewId={inlineReviewId} onCloseEmbedded={()=>{setInlineReviewId(null);setInlineReviewAction(null);if(route?.page==='reviews')navigate('response',active?.id,active?responseQueueRoute(active):{taskId:undefined,reviewId:undefined});}}/>;

  if (!requirements.length) return <div className="response-page rfq-detail rq-unified">{detailNavigation}<div className="detail-layout"><div className="detail-document-column">{sourceSummary.status==='empty'?<section className="detail-source detail-no-source"><EmptyState title="还没有 RFQ 原文" description="上传客户文件或载入示例后，在这里阅读原文并处理条款。" action={<button className="btn btn-primary" onClick={() => {const next=getSourceUploadRoute({...route,projectId:project.id},actorRole);navigate(next.page,null,next);}}>{canPerform(actorRole,'source:manage')?'上传与解析资料':'查看来源资料'}<ArrowRight size={15}/></button>}/></section>:<SourceProcessingPane summary={sourceSummary} onOpen={()=>navigate('documents')}/>}</div><div className="response-processing detail-business"><div className="detail-side-content">{detailTab === 'settings' ? detailPanels.settings : detailTab === 'versions' ? detailPanels.versions : detailTab === 'reviews' ? detailPanels.reviews : detailTab === 'activity' ? <ProjectActivityPanel project={project} requirements={requirements} reviews={reviews} snapshots={[]} comments={projectComments} members={appState.membersByProject?.[project.id] || []} audit={appState.audit || []} onLocate={() => {}}/> : <EmptyState title="应答项尚未生成" description={sourceSummary.status==='empty'?'上传并解析客户文件后，可在这里处理应答项。':'当前文件正在解析，完成后可在这里处理应答项。'}/>}</div></div></div>{projectIssuesPanel}{inlineReviewPanel}</div>;
  return <div className="response-page rfq-detail rq-unified">{detailNavigation}
    {staleSource && <Notice warning>当前链接指向旧来源版本，本页只读。<button className="text-link" onClick={() => chooseRow(active)}>打开当前有效来源版本</button></Notice>}
    {actionFeedback&&<div className="rq-feedback" role="status"><CheckCircle2 size={16}/><span><strong>{actionFeedback.clause} 已{actionFeedback.mode==='submit'?'提交技术确认':'确认'}</strong>{actionFeedback.complete?' · 当前队列暂无下一条可处理项':actionFeedback.advanced?' · 已进入下一条待处理项':' · 已保存当前处理结果'}</span><button onClick={()=>{const row=requirements.find(r=>r.id===actionFeedback.id);if(row)chooseRow(row);}}>返回本条<ArrowRight size={13}/></button><button className="rq-dismiss" aria-label="收起处理反馈" onClick={()=>setActionFeedback(null)}><X size={14}/></button></div>}
    <div className={`rq-workspace ${detailTab==='response'&&queueVisible?'with-queue':''}`}>{detailTab==='response'&&queueVisible&&<ResponseQueue rows={queueRows} reviews={reviews} activeId={active.id} counts={queueCounts} query={queueQuery} onQuery={setQueueQuery} filter={queueFilter} onFilter={setQueueFilter} onSelect={chooseRow} onOpenIssues={()=>guardedDetail(()=>setIssuesOpen(true))}/>}
    <div className="response-workbench detail-layout" ref={detailLayoutRef}>
      <div className="detail-document-column">
        <div className="detail-document-header"><button className={`btn btn-sm ${outlineOpen ? 'active' : ''}`} aria-label="展开文档目录" aria-expanded={outlineOpen} onClick={() => setOutlineOpen(!outlineOpen)}><BookOpen size={14}/>目录<span className="count-pill">{requirements.length}</span></button><select className="select" aria-label="应答来源文件" value={active.sourceFileId || active.source || 'manual'} onChange={e => { const row = requirements.find(r => (r.sourceFileId || r.source || 'manual') === e.target.value); if (row) chooseRow(row); }}>{[...new Map(requirements.map(r => [r.sourceFileId || r.source || 'manual', r.source || '人工补录'])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><label className="workspace-check"><input type="checkbox" checked={showResponses} onChange={e => setShowResponses(e.target.checked)}/>显示标注</label></div>
        {outlineOpen && <aside className="detail-outline"><div className="detail-outline-heading"><strong>文件目录与条款</strong><button className="icon-btn" aria-label="关闭文档目录" onClick={() => setOutlineOpen(false)}><X size={15}/></button></div><label className="detail-outline-search"><Search size={14}/><input className="input" aria-label="搜索要求" placeholder="搜索条款或要求" value={query} onChange={e => setQuery(e.target.value)}/></label><select className="select" aria-label="处理状态" value={status} onChange={e => setStatus(e.target.value)}><option>全部状态</option>{[...new Set(requirements.map(r => r.status))].map(v => <option key={v}>{v}</option>)}</select><RequirementOutline rows={filtered.filter(r => (r.sourceFileId || r.source) === (active.sourceFileId || active.source))} selectedId={active.id} onSelect={row => { chooseRow(row); setOutlineOpen(false); }} selected={selected} onCheck={(id, checked) => setSelected(old => checked ? [...new Set([...old, id])] : old.filter(v => v !== id))}/><div className="detail-outline-footer"><button className="text-link" onClick={() => { setQuery(''); setStatus('全部状态'); setSection('全部章节'); setOwner('全部责任人'); setSpecial('全部要求'); }}>重置筛选</button><button className="btn btn-sm" disabled={!selected.length} onClick={() => { setModal('batch'); setError(''); }}>批量确认 {selected.length || ''}</button></div></aside>}
        <SourceDocumentPane focusOnMount={Boolean(route?.requirementId)} file={(appState?.documentsByProject?.[project.id] ?? read(`fep-rfq-documents:${project.id}`, null)?.files ?? makeDocumentDemo(project.id, requirements).files).find(f => f.id === active.sourceFileId)} rows={requirements.filter(r => (r.sourceFileId || r.source) === (active.sourceFileId || active.source)).map(r => ({ ...r, projectId: project.id }))} selectedAnchor={{ ...makeSourceAnchor({ ...active, projectId: project.id }), ...(route?.requirementId === active.id ? { sourceVersion: route.sourceVersion || String(active.sourceVersion || '1'), fileId: route.fileId || active.sourceFileId || active.source || 'manual' } : {}) }} showResponses={showResponses} quoteDraft={quoteDraft} responsePreview={!conflicted && !staleSource ? { ...active, ...form } : undefined} comments={projectComments} activeCommentId={activeCommentId} onQuote={canEdit ? (quote, anchor) => focusSource(anchor, { quote }) : null} onSelectAnchor={anchor => focusSource(anchor)} onSelectComment={(commentId, anchor) => focusSource(anchor, { commentId })}/>
      </div>
      <div className="response-processing detail-business"><div className="detail-side-content" ref={detailSideRef}>
        <div className="detail-settings" style={{display:detailTab === 'settings'?'block':'none'}}>{detailPanels.settings}</div>
        <div className="detail-versions" style={{display:detailTab === 'versions'?'block':'none'}}>{detailPanels.versions}</div>
        {detailTab === 'activity' && <ProjectActivityPanel project={project} requirements={requirements} reviews={reviews} snapshots={appState.snapshotsByProject?.[project.id] || []} comments={projectComments} members={appState.membersByProject?.[project.id] || []} audit={appState.audit || []} onLocate={comment => focusSource(comment.anchor, { commentId: comment.id })}/>}
        <div key={active.id} className="detail-clause-content rq-clause-motion" style={{ display: detailTab === 'response' ? 'block' : 'none' }}><div className="detail-clause-toolbar"><span>当前条款 <b>{active.clause || '无编号'}</b></span><div><button className="icon-btn" aria-label="上一条要求" disabled={requirements.indexOf(active) <= 0} onClick={() => chooseRow(requirements[requirements.indexOf(active) - 1])}><ChevronLeft size={15}/></button><span>{requirements.indexOf(active) + 1} / {requirements.length}</span><button className="icon-btn" aria-label="下一条要求" disabled={requirements.indexOf(active) >= requirements.length - 1} onClick={() => chooseRow(requirements[requirements.indexOf(active) + 1])}><ChevronRight size={15}/></button></div></div><div className="tabs response-processing-tabs">{['差距与应答','匹配依据','批注与记录'].map(t=><button key={t} className={processTab===t?'active':''} onClick={()=>setProcessTab(t)}>{{'差距与应答':'应答编辑','匹配依据':'候选参考依据','批注与记录':'批注讨论'}[t]}</button>)}</div><div style={{display:processTab==='差距与应答'?'contents':'none'}}>
      <section className="panel response-editor"><div className="response-column-heading"><h2>应答编辑</h2><span className={`response-save-state ${dirty ? 'dirty' : ''}`}>{dirty ? '● 未保存' : '✓ 已保存'}</span></div><div className="response-editor-body"><div className="response-active-title"><span className="response-clause">条款 {active.clause || "无编号"}</span><StatusBadge status={active.status} /><h2>{active.title}</h2><span className="muted">工作版本 V{active.version || 1} · {sectionLabel(active)}</span></div><div className="response-customer-requirement"><button className="text-link" onClick={() => navigate('documents', active.id)}><ChevronLeft size={13}/>返回解析定位本条</button><div><span>客户原始要求</span><button className="text-link" onClick={() => { setModal('original'); setError(''); }}>查看 / 修订</button></div><p>{active.original}</p>{active.realSource && <a className="text-link" href={active.sourceUrl} target="_blank" rel="noreferrer">查看英文原PDF · 第{active.sourcePage}页 ↗</a>}<small><FileText size={12} />{active.source} · 第 {active.sourcePage || 1} 页</small></div>
        {conflicted && <Notice warning>条目版本已更新。当前输入仍保留，保存及确认前请核对最新版本。</Notice>}{actorRole === '最终审批人' && <Notice>条款由技术确认，请在最终审批中核对整份应答。<button className="text-link" onClick={() => goPage('export')}>查看最终审批</button></Notice>}{openReview && <Notice warning>{openReview.kind === 'clarification' ? '客户澄清处理中，由SR跟进；解决后再确认本条。' : '专项评审处理中；方案获批后，再核对并确认本条。'}<button className="text-link" onClick={() => openInlineReview(openReview.id)}>查看事项</button></Notice>}
        {active.status==='待确认'&&active.confirmationReason&&<Notice>{active.confirmationReason}</Notice>}{active.pendingReviewProposal&&<Notice warning>有一份{active.pendingReviewProposal.kind==='clarification'?'澄清':'获批评审'}建议待核对；当前人工答复已保留。<button className="text-link" onClick={()=>{setProposalReason('');setModal('review-proposal');}}>核对差异与采用</button></Notice>}<AssessmentPanel row={active} project={project} suggestion={suggestion} retrieval={retrieval} onOpenReference={() => setProcessTab('匹配依据')} />
        <div className="form-grid response-form"><Field label="人工最终结论" required wide><div className="response-conclusion-options">{['Comply', '有条件 Comply', '不满足', '不适用', '待确认'].map((v) => <button type="button" className={form.conclusion === v ? 'active' : ''} key={v} disabled={!canEdit} onClick={() => edit('conclusion', v)}>{v}</button>)}</div></Field><Field label="备注" required={form.conclusion === '不适用'} wide><textarea className="input" value={form.reason} readOnly={!canEdit} onChange={(e) => edit('reason', e.target.value)} placeholder={form.conclusion === '不适用' ? '请说明本条不适用的范围依据' : '填写备注（选填）'} /></Field></div>
        {recommendedWording && <RecommendedWording key={`${active.id}:${recommendedWording}`} recommendation={recommendedWording} currentDraft={form.draft} canEdit={canEdit} onAdopt={wording => { if (!canEdit) return; edit('draft', wording); addActivity('采用推荐话术', `根据${form.conclusion}生成话术并采用为应答草稿`); toast('推荐话术已带入应答草稿，提交或确认后保存'); }}/>}
        {savedCandidate && <Notice>能力候选 <b>{savedCandidate.id}</b> 已保存为草稿。发布前不会改变当前应答。<button className="text-link" onClick={() => goPage('capabilities')}>查看候选</button></Notice>}
        <ResponseIssues reviews={linkedReviews} onOpen={openInlineReview} canCreate={canEdit} onCreate={()=>startReview('review')}/>
        {detailTab==='response'&&<div className="rq-next-preview"><span>接下来</span><strong>{nextQueueRow?`${nextQueueRow.clause||'—'} · ${nextQueueRow.title}`:'暂无下一条本人待办'}</strong>{nextQueueRow&&<button onClick={()=>chooseRow(nextQueueRow)}>稍后处理本条<ChevronRight size={13}/></button>}</div>}
        {actorRole !== '最终审批人' && <div className="response-editor-actions response-workflow-actions">
          {actorRole === 'SR' && <button className="btn btn-primary" disabled={!canEdit || active.readyForConfirmation || !!openReview || !!active.pendingReviewProposal || active.status === '已确认' && !dirty} onClick={submitAndAdvance}><Send size={14}/>{active.status === '已确认' && !dirty ? '技术已确认' : active.readyForConfirmation ? '已提交技术确认' : '提交并下一条'}</button>}
          {(actorRole==='技术'||actorRole==='SR'&&canConfirm) && <button className="btn btn-primary" onClick={()=>{if(dirty)beginConfirm();else confirmOne();}} disabled={!canConfirm || !!openReview || !!active.pendingReviewProposal || active.status === '已确认' && !dirty}><Check size={15}/>{active.status === '已确认' && !dirty ? '本条已确认' : dirty ? '修改后确认并下一条' : '确认并下一条'}</button>}
          {canEdit && <details className="response-problem-actions" key={`${active.id}-${actorRole}`}><summary className="btn">问题处理<ChevronDown size={14}/></summary><div className="response-problem-menu" role="group" aria-label="问题处理选项"><button className="btn" onClick={() => startReview('clarify')}>需要客户澄清</button><button className="btn" onClick={startAssessment} disabled={reassessing && closedReview && !canBusinessAction('review', closedReview.id, 'reopen')}>{reassessing ? '重新专项评审' : '需要专项评审'}</button></div></details>}
        </div>}
        {['SR','技术'].includes(actorRole) && !canConfirm && <p className="response-permission-tip">当前条款仅可查看，请从本人待办进入确认。</p>}
      </div></section>
      </div><div style={{display:processTab==='匹配依据'?'contents':'none'}}><section className="panel response-match"><div className="response-column-heading"><h2><Layers size={16} />候选参考依据</h2><button className="text-link" disabled={matching||!canEdit||!canPerform(actorRole,'analysis:run')} onClick={() => { setModal('rematch'); setRetrievalMode('normal'); }}><RefreshCw size={13} className={matching ? 'response-spin' : ''} />{matching ? '检索中' : '重新匹配'}</button></div><div className="response-matching-path">{[['standard', '标准回复库'], ['history', '历史 RFQ'], ['capability', '能力边界']].map(([key, label], index) => <React.Fragment key={key}><div className={states[key] === '命中' ? 'hit' : ''}><i>{states[key] === '命中' ? <Check size={11} /> : index + 1}</i><strong>{label}</strong><span>{matching ? index === 0 ? '查询中' : '等待' : states[key]}</span></div>{index < 2 && <ChevronRight size={12} />}</React.Fragment>)}</div><div className="tabs response-match-tabs">{[['standard', '标准回复'], ['history', '历史 RFQ'], ['capability', '机型能力']].map(([key, label]) => <button key={key} className={rightTab === key ? 'active' : ''} onClick={() => setRightTab(key)}>{label}</button>)}</div>
        <div className="response-match-body"><p className="response-match-copy">候选资料供核对与采用，请结合适用条件及资料版本核对。</p>{retrieval === 'failed' ? <EmptyState title="检索服务失败" description="标准回复服务暂不可用，后续级别未执行；现有人工答复已保留。" action={<button className="btn btn-primary" onClick={() => { setRetrievalMode('normal'); setModal('rematch'); }}>重试检索</button>} /> : retrieval === 'denied' ? <EmptyState title="当前来源无访问权限" description="受限来源名称与摘要已隐藏，请联系获授权维护人处理。" /> : <>
        {rightTab === 'standard' && (states.standard === '命中' ? <><div className="response-match-label"><StatusBadge status="标准回复命中" /><b>{active.score}%</b></div><h3>标准应答口径 · {suggestion.version}</h3><p className="response-match-copy">相似度超过 80% 阈值，初始建议已自动填入应答草稿，仍需人工确认。</p><div className="response-reference-box"><span>标准答复</span><p>{suggestion.draft}</p></div><Description rows={[["适用条件", suggestion.conditions || '按已确认机型、配置与验收方案执行'], ['候选证据 / 版本', suggestion.evidence], ['发布状态', '已发布 · 模拟标准库'], ['本次判断', '建议可用；请检查条件与承诺边界']]} /><button className="btn response-full-btn" disabled={!canEdit} onClick={() => adoptSuggestion(suggestion, `标准回复 ${suggestion.version}`)}>重新采用标准建议</button></> : <><div className="response-unmatched"><Search size={29} /><strong>标准回复未命中</strong><p>相似度未超过 80% 阈值，按顺序检索历史 RFQ。</p></div><button className="text-link" onClick={() => setRightTab('history')}>查看历史检索结果<ArrowRight size={13} /></button></>)}
        {rightTab === 'history' && (states.history === '未执行' ? <Notice>前级标准回复已命中，本次未执行历史检索。可重新匹配刷新分级结果。</Notice> : states.history === '未命中' ? <><div className="response-unmatched"><History size={29} /><strong>历史 RFQ 无可用命中</strong><p>历史中无可复用批准答复，继续查询能力边界。缺资料不直接判定不满足。</p></div><button className="text-link" onClick={() => setRightTab('capability')}>查看机型能力<ArrowRight size={13} /></button></> : <><div className="response-match-label"><StatusBadge status="历史 RFQ 命中" /><span className="muted">候选前 {showMore ? 5 : 3} 条</span></div>{candidates.map((candidate, index) => <article className={`response-history-card ${candidateIndex === index ? 'selected' : ''}`} key={candidate.id}><button className="response-history-select" onClick={() => setCandidateIndex(index)}><span>{candidate.project}</span><b>{Math.max(62, active.score - index * 6)}%</b></button><div className="response-history-meta">{candidate.date} · {candidate.model} · {candidate.version}</div><p>{candidate.answer}</p><div className="response-difference"><AlertCircle size={12} />{candidate.difference}</div><div className="response-card-actions"><button className="text-link" onClick={() => setHistoryDetail(candidate)}>查看详情</button><button className="text-link" disabled={!canEdit} onClick={() => adoptSuggestion({ ...candidate, conclusion: suggestion.conclusion }, `${candidate.project} ${candidate.version}`)}>修改后复用</button></div></article>)}<button className="text-link response-more" onClick={() => setShowMore(!showMore)}>{showMore ? '收起候选' : '加载更多历史候选'}</button></>)}
        {rightTab === 'capability' && <>{states.capability === '未执行' && <Notice>前级已有命中，本级自动检索未执行。以下为手动参考，不自动改变应答。</Notice>}{active.matchLevel === 'none' ? <><div className="response-unmatched"><Layers size={29} /><strong>缺少可用能力依据</strong><p>三级检索均无可用结果。请补充能力依据，或在应答编辑的「问题处理」中发起专项评审。</p></div></> : <><div className="response-match-label"><StatusBadge status={states.capability === '命中' ? '能力边界命中' : '手动查看'} /><span>候选 V2</span></div><h3>{active.category === '商务' ? '商务基线与交付条件' : '机型能力与要求对照'}</h3><Description rows={[["设备项 / 配置", project.equipment], ['本次客户要求', active.original], ['能力范围', active.id === 'BHEL-REQ-003' ? '演示排产基线：BHEL采购订单后16周（客户要求12周）' : active.title.includes('交货') ? '演示排产基线：合同生效后 12 周' : '按模拟测试报告与已确认配置执行；具体保证范围以证据为准'], ['值类型', /交货|交付/.test(active.title) ? '计划基线' : '保证值 / 指定工况'], ['适用条件', suggestion.conditions || '本次材料、工艺、配置与验收方案须双方确认'], ['限制', '不得将典型值或历史单次结果直接作为本次保证值'], ['候选证据 / 版本', suggestion.evidence]]} /><button className="btn response-full-btn" disabled={!canEdit || states.capability !== '命中'} onClick={() => adoptSuggestion(suggestion, `能力建议 ${suggestion.version}`)}>采用能力建议</button></>}<div className="response-capability-links"><button className="text-link" onClick={openCapability} disabled={!canEdit||!canPerform(actorRole,'resource:edit')}><Plus size={14} />补充能力边界</button><button className="text-link" onClick={() => goPage('capabilities')}>能力维护<ExternalLink size={12} /></button></div></>}
        </>}{active.matchLevel !== 'none' && retrieval === 'normal' && <div className="response-reject"><span>本条匹配结果不适用？</span><button className="text-link" disabled={!canEdit} onClick={() => startReview('reject')}>明确拒绝匹配结果</button><small>需填写理由并建立关联偏离；不采纳候选不会自动拒绝匹配。</small></div>}</div>
      </section></div><div style={{display:processTab==='批注与记录'?'block':'none'}} className="detail-annotations"><AnnotationPanel activeCommentId={detailTab === 'response' && processTab === '批注与记录' ? activeCommentId : null} onSelectComment={setActiveCommentId} comments={projectComments} rows={requirements.map(r=>({...r,projectId:project.id}))} anchor={makeSourceAnchor({...active,projectId:project.id})} actorId={actorId} canEdit={canEdit} quoteDraft={quoteDraft} onClearQuote={()=>setQuoteDraft(null)} onChange={comments=>onAppUpdate(s=>({...s,commentsByProject:{...s.commentsByProject,[project.id]:comments}}))} onLocate={(anchor,commentId)=>focusSource(anchor,{commentId})} onPromote={issue=>{const existing=reviews.find(r=>r.id===issue.id);if(existing){openInlineReview(existing.id);return existing.id;}const id=onCreateReview({...issue,owner:issue.kind==='clarification'?'SR':getReviewRoute(active,project.approvalConfig).owner,deadline:project.deadline,type:issue.kind==='clarification'?'客户澄清':'批注转评审'});if(id)openInlineReview(id);return id;}}/></div>
      </div></div></div>
      <AnnotationConnector containerRef={detailLayoutRef} commentId={detailTab === 'response' && processTab === '批注与记录' ? activeCommentId : null}/>
    </div></div>
    {projectIssuesPanel}{inlineReviewPanel}

    {modal==='review-proposal'&&active.pendingReviewProposal&&<Modal title="核对评审建议与人工答复" width={800} onClose={()=>setModal(null)} footer={<><button className="btn" onClick={()=>setModal(null)}>暂不采用</button><button className="btn" disabled={dirty||!canConfirm||!proposalReason.trim()} onClick={()=>{if(onAdoptReview(active.id,active.pendingReviewProposal,proposalReason))setModal(null);}}>保留人工答复并记录理由</button><button className="btn btn-primary" disabled={dirty||!canConfirm} onClick={()=>{if(onAdoptReview(active.id,active.pendingReviewProposal))setModal(null);}}>采用建议并保存待确认</button></>}><Notice>建议基于条款 V{active.pendingReviewProposal.baseVersion}；采用后仍需单独确认。{dirty?'当前有未保存编辑，请先完成当前条目的提交或确认。':''}</Notice><div className="response-diff-grid"><div><h4>当前人工答复 · V{active.version}</h4><p>{active.draft}</p><small>{active.conditions}</small><p>{active.evidence}</p></div><div><h4>建议 · {active.pendingReviewProposal.reviewId}</h4><p>{active.pendingReviewProposal.proposal.draft}</p><small>{active.pendingReviewProposal.proposal.conditions}</small><p>{active.pendingReviewProposal.proposal.evidence}</p></div></div><label className="field"><span>保留人工答复的理由</span><textarea className="input" value={proposalReason} onChange={e=>setProposalReason(e.target.value)}/></label></Modal>}
    {modal === 'confirm'  && <Modal title={dirty ? '修改后确认当前条目' : '确认当前条目应答'} onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>取消</button><button className="btn btn-primary" disabled={!canConfirm || !!pendingConfirmation} onClick={confirmOne}>{pendingConfirmation ? '保存后确认中…' : '确认本条'}</button></>}><div className="response-modal-title"><span>条款 {active.clause} · V{active.version || 1}</span><h3>{active.title}</h3></div><Description rows={[["最终结论", form.conclusion], ['备注', form.reason]]} /><Notice>确认绑定当前条目版本，不代表最终快照已批准。未关闭评审、结论未明确或权限不足会阻止确认。</Notice>{dirty && <Field label="本次修改原因" required wide><textarea className="input response-conditions" value={confirmReason} onChange={(e) => setConfirmReason(e.target.value)} placeholder="说明本次结论或备注变化的原因" /></Field>}<label className="response-checkbox"><input type="checkbox" checked={confirmNext} onChange={(e) => setConfirmNext(e.target.checked)} />确认后跳转下一未处理条目</label>{error && <p className="response-error" role="alert">{error}</p>}</Modal>}
    {['batch', 'batch-result'].includes(modal) && <Modal title={modal === 'batch' ? '批量确认 · 核对明确选中范围' : '批量确认结果'} width={820} onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>{modal === 'batch-result' ? '完成' : '取消'}</button>{modal === 'batch' && <button className="btn btn-primary" disabled={!eligibleBatch.length || dirty} onClick={batchConfirm}>确认符合条件的 {eligibleBatch.length} 条</button>}</>}><Notice warning={eligibleBatch.length !== selectedRows.length}>明确选中 {modal === 'batch-result' ? batchSummary.total : selectedRows.length} 条；符合批量条件 {modal === 'batch-result' ? batchSummary.eligible : eligibleBatch.length} 条，排除 {modal === 'batch-result' ? batchSummary.excluded : selectedRows.length - eligibleBatch.length} 条。仅本次勾选范围参与，不隐式包含其他页。</Notice><div className="table-wrap response-batch-table"><table className="data-table"><thead><tr><th>条款 / 要求</th><th>状态</th><th>{modal === 'batch' ? '检查结果 / 排除原因' : '执行结果'}</th></tr></thead><tbody>{(modal === 'batch' ? selectedRows : batchResults || []).map((row) => <tr key={row.id}><td>{row.clause} {row.title}</td><td><StatusBadge status={row.status} /></td><td>{modal === 'batch' ? batchReasons(row).length ? <span className="response-error">{batchReasons(row).join('；')}</span> : <span className="response-green">符合批量条件</span> : <><StatusBadge status={row.result} /><p>{row.message}</p></>}</td></tr>)}</tbody></table></div>{dirty && <p className="response-error">当前条目有未保存修改，请取消并先保存。</p>}{error && <p className="response-error">{error}</p>}</Modal>}
    {transition && <Modal title="存在未保存的修改" onClose={() => setTransition(null)} footer={<><button className="btn" onClick={() => setTransition(null)}>取消切换</button><button className="btn" onClick={() => { hydrate(active); candidateDirty.current = false; setCapabilityForm(null); const next = transition.next; setTransition(null); next?.(); }}>放弃修改</button><button className="btn btn-primary" onClick={() => { if (candidateDirty.current && !saveCapability()) return; if (dirtyRef.current && !saveDraft()) return; const next = transition.next; setTransition(null); next?.(); }}>保存后切换</button></>}><p>当前应答或能力候选尚未保存。保存成功后再切换，或放弃本次修改。</p>{error && <p className="response-error">{error}</p>}</Modal>}
    {adoption && <Modal title="采用建议前核对应答差异" onClose={() => setAdoption(null)} width={760} footer={<><button className="btn" onClick={() => setAdoption(null)}>保留当前编辑</button><button className="btn btn-primary" onClick={() => applyAdoption(adoption.proposal, adoption.label)}>采用建议并保留来源条件</button></>}><Notice>当前应答已有内容。采用将替换答复、结论、条件和证据；仍需人工保存与确认。</Notice><div className="response-diff-grid"><div><h4>当前人工答复</h4><p>{form.draft}</p><small>条件：{form.conditions || '未填写'}</small></div><div><h4>{adoption.label}</h4><p>{adoption.proposal.draft}</p><small>条件：{adoption.proposal.conditions || '未填写'}</small></div></div></Modal>}

    {reviewForm && <Drawer
      title={reviewForm.kind === 'clarify' ? '客户澄清' : reviewForm.kind === 'rereview' ? '重新专项评审' : reviewForm.kind === 'reject' ? '明确拒绝匹配并建立偏离' : '专项评审'}
      width={620} onClose={() => setReviewForm(null)}
      footer={<><button className="btn" onClick={() => setReviewForm(null)}>取消</button><button className="btn btn-primary" onClick={submitReview}>{reviewForm.kind === 'clarify' ? '发起客户澄清' : reviewForm.kind === 'rereview' ? '发起重新评审' : '发起专项评审'}</button></>}
    >
      {reviewForm.kind !== 'clarify' && <ApprovalRoute requirement={active} config={{ ...project.approvalConfig, technical: '技术', business: '技术', quality: '技术', service: '技术' }}/>}
      <Notice>{reviewForm.kind === 'clarify' ? '由SR跟进客户回复，解决后回到条款进行技术确认。' : reviewForm.kind === 'reject' ? '请说明匹配结果不适用的原因，由技术评估处理方案。' : '由技术提出方案，指定专业批准人批准后，回到本条核对并确认。'}</Notice>
      <div className="form-grid response-spaced">
        <Field label="关联要求" wide><input className="input" readOnly value={`${active.clause} ${active.title}`} /></Field>
        <Field label="事项标题" required wide><input className="input" value={reviewForm.title} onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })} /></Field>
        {reviewForm.kind !== 'clarify' && <Field label="问题类别" required><select className="select" value={reviewForm.type} onChange={(e) => setReviewForm({ ...reviewForm, type: e.target.value })}>{['条件差异', '知识缺口', '置信度低', '匹配结果未接受', '交期偏离', '质量风险'].map((v) => <option key={v}>{v}</option>)}</select></Field>}
        <Field label={reviewForm.kind === 'clarify' ? '跟进人' : '责任人'}><input className="input" readOnly value={reviewForm.owner} /></Field>
        <Field label="截止时间" required><input className="input" type="date" value={reviewForm.deadline} onChange={(e) => setReviewForm({ ...reviewForm, deadline: e.target.value })} /></Field>
        <Field label={reviewForm.kind === 'clarify' ? '待客户澄清的问题' : reviewForm.kind === 'rereview' ? '重新评审原因' : reviewForm.kind === 'reject' ? '明确拒绝的理由' : '问题说明'} required wide><textarea className="input response-reply" value={reviewForm.description} onChange={(e) => setReviewForm({ ...reviewForm, description: e.target.value })} placeholder={reviewForm.kind === 'clarify' ? '填写需要客户明确的参数、范围或条件' : '说明具体差距、风险及需要评估的方案'} /></Field>
        <Field label="关联证据" wide><textarea className="input" value={reviewForm.evidence} onChange={(e) => setReviewForm({ ...reviewForm, evidence: e.target.value })} /></Field>
        {reviewForm.kind !== 'clarify' && <><Field label="初步方案" wide><textarea className="input" value={reviewForm.plan} onChange={(e) => setReviewForm({ ...reviewForm, plan: e.target.value })} /></Field><Field label="成本 / 交期 / 质量影响" wide><textarea className="input" value={reviewForm.impact} onChange={(e) => setReviewForm({ ...reviewForm, impact: e.target.value })} /></Field></>}
      </div>
      {error && <p className="response-error">{error}</p>}
    </Drawer>}
    {capabilityForm && <Drawer title="补充机型能力边界 · 候选草稿" width={650} onClose={() => { setTransition({ next: () => { setCapabilityForm(null); candidateDirty.current = false; } }); }} footer={<><button className="btn" onClick={() => { setTransition({ next: () => { setCapabilityForm(null); candidateDirty.current = false; } }); }}>取消</button><button className="btn btn-primary" onClick={saveCapability}>保存能力候选</button></>}><Notice>保存为未发布候选，不覆盖当前应答，不自动改变 Comply 结论。请在能力维护页核对条件、证据并独立批准。</Notice><div className="form-grid response-spaced"><Field label="关联机型" required><select className="select" aria-label="补充能力关联机型" value={capabilityForm.modelId} onChange={e=>{const chosen=[...capabilityModels].sort((a,b)=>b.version-a.version).find(m=>m.id===e.target.value);setCapabilityForm({...capabilityForm,modelId:e.target.value,processId:'',config:chosen?.config||''});}}><option value="">请选择本BU的机型及硬件版本</option>{[...new Set(capabilityModels.map(m=>m.id))].map(id=>{const m=[...capabilityModels].filter(m=>m.id===id).sort((a,b)=>b.version-a.version)[0];return <option key={id} value={id}>{m.name} {m.revision} · {m.code}</option>;})}</select></Field><Field label="关联工艺" required><select className="select" aria-label="补充能力关联工艺" value={capabilityForm.processId} onChange={e=>setCapabilityForm({...capabilityForm,processId:e.target.value})}><option value="">请选择机型下的工艺</option>{capabilityProcesses.filter(p=>p.modelId===capabilityForm.modelId&&p.enabled!==false).map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></Field><Field label="配置 / 项目基线" required><input className="input" value={capabilityForm.config} onChange={(e) => setCapabilityForm({ ...capabilityForm, config: e.target.value })} /></Field><Field label="能力指标" required><input className="input" value={capabilityForm.metric} onChange={(e) => setCapabilityForm({ ...capabilityForm, metric: e.target.value })} /></Field><Field label="实际能力值 / 范围" required><input className="input" value={capabilityForm.value} onChange={(e) => setCapabilityForm({ ...capabilityForm, value: e.target.value })} /></Field><Field label="值类型"><select className="select" value={capabilityForm.valueType} onChange={(e) => setCapabilityForm({ ...capabilityForm, valueType: e.target.value })}>{['保证值', '典型值', '范围值', '描述值'].map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="来源"><input className="input" readOnly value="手动补充" /></Field><Field label="适用条件" required wide><textarea className="input response-conditions" value={capabilityForm.conditions} onChange={(e) => setCapabilityForm({ ...capabilityForm, conditions: e.target.value })} placeholder="材料、厚度、工艺、测试方法与工况" /></Field><Field label="限制" wide><textarea className="input" value={capabilityForm.limits} onChange={(e) => setCapabilityForm({ ...capabilityForm, limits: e.target.value })} /></Field><Field label="证据与版本" wide><input className="input" value={capabilityForm.evidence} onChange={(e) => setCapabilityForm({ ...capabilityForm, evidence: e.target.value })} list="response-evidence-options" placeholder="可在能力维护页补齐有效证据" /><datalist id="response-evidence-options">{capabilityEvidence.filter((r) => r.status === '有效').map((r) => <option key={r.id} value={`${r.id} v${r.version}，${r.location || '请补充页码'}`}>{r.name}</option>)}</datalist></Field><Field label="来源定位" wide><textarea className="input" readOnly value={capabilityForm.sourceLocation} /></Field></div>{error && <p className="response-error">{error}</p>}</Drawer>}
    {historyDetail && <Drawer title="历史候选详情 · 模拟参考" width={720} onClose={() => setHistoryDetail(null)} footer={<><button className="btn" onClick={() => { startReview('clarify', historyDetail); setHistoryDetail(null); }}>向客户澄清</button><button className="btn" onClick={() => { startReview('review', historyDetail); setHistoryDetail(null); }}>发起专家评审</button><button className="btn btn-primary" disabled={!canEdit} onClick={() => { adoptSuggestion({ ...historyDetail, conclusion: suggestion.conclusion }, `${historyDetail.project} ${historyDetail.version}`); setHistoryDetail(null); }}>修改后复用</button></>}><h3>{historyDetail.project}</h3><Description rows={[["时间 / 配置", `${historyDetail.date} · ${historyDetail.model} · ${historyDetail.config}`], ['来源版本', `${historyDetail.id} · ${historyDetail.version}`], ['历史要求', historyDetail.original], ['已审核答复', historyDetail.answer], ['审核状态', '已批准（模拟记录）'], ['与本次条件差异', historyDetail.difference], ['历史方案 / 适用条件', historyDetail.conditions], ['候选证据', historyDetail.evidence], ['客户沟通结果', historyDetail.feedback], ['实际验收结果', historyDetail.acceptance], ['建议动作', '核对配置、材料与验收条件后修改复用；不明确时发起评审或客户澄清']]} /><Notice warning>历史客户接受与实际验收分开记录。未知结果显示未记录，不推断为验收通过。</Notice></Drawer>}
    {modal === 'original' && <Drawer title="客户原文与来源修订" width={650} onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>关闭</button><button className="btn btn-primary" disabled={!canEdit} onClick={() => { setModal(null); toast('原文修订保留在当前草稿中，请保存并重新核对匹配结果'); }}>带入当前草稿</button></>}><Description rows={[["来源文件", active.source], ['页码 / 条款', `第 ${active.sourcePage || 1} 页 / ${active.clause}`], ['当前版本', `V${active.version || 1}`]]} /><Field label="客户要求原文" required wide><textarea className="input response-reply" value={form.original} readOnly={!canEdit||!canPerform(actorRole,'source:manage')} onChange={(e) => {if(canPerform(actorRole,'source:manage'))edit('original', e.target.value);}} /></Field><Notice warning>原文修订会影响当前建议及确认有效性。保存后须重新核对，不自动沿用旧版批准。</Notice></Drawer>}
    {modal === 'rematch' && <Modal title="重新执行三级匹配" onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>取消</button><button className="btn btn-primary" onClick={rematch}>开始重新匹配</button></>}><Notice>按“标准回复库 → 历史 RFQ → 能力边界”依次执行；只刷新模拟检索结果与建议，保留当前人工答复和编辑内容。</Notice><Field label="原型演示场景"><select className="select" value={retrievalMode} onChange={(e) => setRetrievalMode(e.target.value)}><option value="normal">正常分级匹配</option><option value="failed">模拟标准检索失败</option><option value="denied">模拟检索来源无权限</option></select></Field></Modal>}
    {modal === 'conflict' && <Modal title="条目版本已变化，无法覆盖保存" width={750} onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>保留我的输入</button><button className="btn btn-primary" onClick={() => { hydrate(active); setModal(null); }}>放弃本次编辑并载入最新版本</button></>}><Notice warning>当前输入与最新版本并排展示，请核对后基于最新版本重新提交；不能强制覆盖确认。</Notice><div className="response-diff-grid"><div><h4>我的输入 · V{baseline.current.version}</h4><p>{form.draft}</p><small>{form.conditions}</small></div><div><h4>最新版本 · V{active.version}</h4><p>{active.draft}</p><small>{active.conditions}</small></div></div></Modal>}
  </div>;
}

export default ResponsePage;
