import {applyCollaborationEdit} from '../craftCommentSync';
import { playContentMotion } from '../contentMotion';
import { UiButton, UiSelect, UiCheckbox, UiInput, UiTextArea, BusinessTable } from '../components/AntContent';
import {buildReviewRequest,reviewEvidenceHref} from '../reviewRequest';
import ReviewerPicker from '../components/ReviewerPicker';
import useContentTransition from '../components/useContentTransition';
import ResponseAssignmentControl from '../components/ResponseAssignmentControl';
import {getConfirmationActorIds,getReviewActorIds,hasReviewConfirmation,hasAssignedConfirmer} from '../confirmationPolicy';
import {personName,canAccessProject} from '../personnelDomain';
import { Grid, Radio, Splitter, Tabs } from 'antd';
import {resizePanelShare} from '../antdAdapters';
import AnnotationConnector from '../components/AnnotationConnector';
import AnnotationPanel from '../components/AnnotationPanel';
import UnlinkedCommentPanel from '../components/UnlinkedCommentPanel';
import ProjectActivityPanel from '../components/ProjectActivityPanel';
import './rfq-detail.css';
import SourceDocumentPane from '../components/SourceDocumentPane';
import { officeCanLeave } from '../officeClient';
import SourceProcessingPane from '../components/SourceProcessingPane';
import {getProjectSourceSummary} from '../projectSelectors';
import RequirementOutline from '../components/RequirementOutline';
import RfqDirectory from '../components/RfqDirectory';
import {craftSourceKey} from '../craftClient';
import {makeSourceAnchor} from '../documentAnchors';
import {makeDocumentDemo} from '../documentMocks';
import {canPerform} from '../permissions';
import {resourceStorageKey,selectReadableResources} from '../resourceVisibility';
import {MODELS,PROCESSES,CAPABILITIES} from '../modelProcessSeeds';
import {assertCapabilityProcess} from '../modelProcessDomain';
import {getSourceUploadRoute} from '../navigation';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Pencil, Search, RefreshCw, ArrowRight, Check, ChevronLeft, ChevronRight, ChevronDown, FileText, BookOpen, History, AlertCircle, ExternalLink, Plus, Save, Send, X, Filter, CheckCircle2, MoreHorizontal, MessageSquarePlus } from "../components/icons";
import { Modal, Drawer, StatusBadge, EmptyState } from '../components/ui';
import { applyRequirementEdit, confirmationValidation } from '../domain';
import './response-page.css';
import { sectionLabel } from '../documentStructure';
import AssessmentPanel from '../components/AssessmentPanel';
import RecommendedWording from '../components/RecommendedWording';
import { generateRecommendedWording } from '../responseAdvice';
import { matchingSuggestion } from '../responseRecommendation';
import InlineReviewSurface from '../components/InlineReviewSurface';
import ResponseCardFilters, { EMPTY_CARD_FILTERS, ResponseCardQuery } from '../components/ResponseCardFilters';
import { selectResponseCards, responseCardStats, nextResponseCard, transitionConfirmedCard, guardCardNavigation, responseStatusLabel, RESPONSE_STATUS_LABELS } from '../responseCardQueue';
import './response-clarification.css';
import { ReviewsPage } from './WorkflowPages';
import './rfq-enhancements.css';

const uid = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5)}`;
const timestamp = () => new Date().toLocaleString('zh-CN', { hour12: false });
const read = (key, fallback = []) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
const toForm = (row) => ({ original: row?.original || '', conclusion: row?.conclusion || '待确认', draft: row?.draft || '', conditions: row?.conditions || '', reason: row?.reason || '', evidence: row?.evidence || '' });
const formFields = ['original', 'conclusion', 'draft', 'conditions', 'reason', 'evidence'];
const detailSection = page => page === 'activity' ? 'activity' : 'response';
function Notice({ children, warning = false }) { return <div className={`response-notice ${warning ? 'response-notice-warning' : ''}`}><AlertCircle size={15} /><div>{children}</div></div>; }
function Field({ label, required, children, wide }) { return <label className={`field ${wide ? 'response-wide' : ''}`}><span>{required && <i className="response-required">*</i>}{label}</span>{children}</label>; }
function Description({ rows }) { return <dl className="response-description">{rows.map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value || '—'}</dd></React.Fragment>)}</dl>; }

export function ResponsePage({ detailPanels = {}, project, requirements = [], reviews = [], onUpdateRequirement, onConfirm, onCreateReview, onUpdateReview, onConfirmReviewed, toast, navigate, actorRole, focusedRequirementId, route, appState,onAppUpdate,onPersonnelAction,actorId,canBusinessAction,onAdoptReview,onSubmitRequirement,onAnalysisRun, logEvent = () => {} }) {
  const screens = Grid.useBreakpoint();
  const narrowWorkbench = !screens.md;
  const mentionPeople = Object.values(appState.accountsById || {}).filter(person => person.enabled !== false && canAccessProject(appState, person.id, project.id));
  const initialRow = requirements.find((row) => row.id === (focusedRequirementId || reviews.find(r => r.id === route?.reviewId)?.requirementId)) || requirements.find(row => /\.docx?$/i.test(row.source || '')) || requirements[0];
  const [activeId, setActiveId] = useState(initialRow?.id || null);
  const active = requirements.find((r) => r.id === activeId) || requirements[0];
  const [form, setForm] = useState(() => toForm(initialRow));
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const baseline = useRef({ id: initialRow?.id, version: initialRow?.version, status: initialRow?.status });
  const savedFilters=read(`rfq.response.filters.${project.id}`,{});
  const [query, setQuery] = useState(savedFilters.query||'');
  const [status, setStatus] = useState(['待确认','待复核'].includes(savedFilters.status)?'待处理':savedFilters.status||'全部状态');
  const [section, setSection] = useState(savedFilters.section||'全部章节');
  const [owner, setOwner] = useState('全部责任人');
  const [special, setSpecial] = useState('全部要求');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [quoteDraft,setQuoteDraft]=useState(null),[proposalReason,setProposalReason]=useState('');
  const [detailTab, setDetailTab] = useState(detailSection(route?.page));
  const [documentOutline,setDocumentOutline]=useState(null);
  const [outlineOpen, setOutlineOpen] = useState(false), [activeCommentId, setActiveCommentId] = useState(null);
  const [commentEditRequest,setCommentEditRequest]=useState(null),[nativeDiscussion,setNativeDiscussion]=useState(null);
  const detailLayoutRef = useRef(null), detailSideRef = useRef(null);
  const [paneShare, setPaneShare] = useState(()=>window.matchMedia('(min-width:768px)').matches?60:55);
  useEffect(() => { const frame=requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));return()=>cancelAnimationFrame(frame); }, [paneShare, narrowWorkbench]);
  function resizeWithKeyboard(event) {
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter'].includes(event.key))return;
    event.preventDefault();
    const box=detailLayoutRef.current?.getBoundingClientRect();
    setPaneShare(current=>resizePanelShare(current,event.key,{span:narrowWorkbench?1100:box?.width||1000,minStart:narrowWorkbench?280:320,minEnd:narrowWorkbench?360:380,vertical:narrowWorkbench,defaultShare:narrowWorkbench?55:60}));
  }
  const allProjectComments = appState.commentsByProject?.[project.id] || [];
  const projectComments = allProjectComments.filter(comment => !comment.nativeDeleted);
  function changeProjectComments(update) {
    onAppUpdate(state => {
      const current=state.commentsByProject?.[project.id]||[];
      const next=typeof update==='function'?update(current):applyCollaborationEdit(current,projectComments,update);
      return {...state,commentsByProject:{...state.commentsByProject,[project.id]:next}};
    });
  }
  useEffect(() => { setDetailTab(detailSection(route?.page)); }, [route?.page]);
  const [processTab,setProcessTab]=useState('差距与应答'),[showResponses,setShowResponses]=useState(true);
  useEffect(() => { if (!(detailTab === 'activity' && activeCommentId)) detailSideRef.current?.scrollTo({ top: 0 }); }, [detailTab]);
  const [rightTab, setRightTab] = useState(initialRow?.matchLevel === 'history' ? 'history' : ['capability', 'none'].includes(initialRow?.matchLevel) ? 'capability' : 'standard');
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [confirmNext, setConfirmNext] = useState(true);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [batchResults, setBatchResults] = useState(null);
  const [batchSummary, setBatchSummary] = useState({ total: 0, eligible: 0, excluded: 0 });
  const automaticReviews = useRef(new Set());
  const [transition, setTransition] = useState(null);
  const [adoption, setAdoption] = useState(null);
  const [reviewForm, setReviewForm] = useState(null);
  const [inlineReviewId, setInlineReviewId] = useState(() => reviews.find(r => r.requirementId === initialRow?.id && !['已关闭', '已取消'].includes(r.status))?.id || null), [inlineReviewAction,setInlineReviewAction] = useState(null);
  const inlineReviewRef = useRef(null);
  const [inlineReviewFocusRequest, setInlineReviewFocusRequest] = useState(0);
  const [cardFilters, setCardFilters] = useState(EMPTY_CARD_FILTERS);
  const [cardFilterDraft, setCardFilterDraft] = useState(EMPTY_CARD_FILTERS);
  const [deferredCards, setDeferredCards] = useState([]);
  const [queueDone, setQueueDone] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const cardRef = useRef(null), cardBusyRef = useRef(false), aliveRef = useRef(true), cardAnimation = useRef(null);
  useContentTransition(detailSideRef, detailTab, { kind:'tab',position:['response','activity'].indexOf(detailTab) });
  useContentTransition(cardRef, active?.id, { kind: 'card-in', enabled: !cardBusy });
  useEffect(() => { cardRef.current?.querySelector('.response-editor-body')?.scrollTo({ top: 0 }); }, [active?.id]);
  const issueGuardRef = useRef(null);
  const registerIssueGuard = useCallback(guard => { issueGuardRef.current = guard; return () => { if (issueGuardRef.current === guard) issueGuardRef.current = null; }; }, []);
  const requirementsRef = useRef(requirements), reviewFormRef = useRef(null);
  requirementsRef.current = requirements;
  reviewFormRef.current = reviewForm;
  const cardRows = selectResponseCards(requirements, reviews, cardFilters);
  const cardStats = responseCardStats(requirements, reviews);
  const cardSources = [...new Set(reviews.flatMap(review => String(review.source || '').split(/[；、]/)).filter(Boolean))];
  const nextCard = nextResponseCard(cardRows, active?.id, deferredCards);
  const cardVisible = active && !queueDone && (cardBusy || cardRows.some(row => row.id === active.id));
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; cardAnimation.current?.cancel(); }; }, []);
  const linkedReviews = reviews.filter((review) => review.requirementId === active?.id);
  const openReview = linkedReviews.find(review => !['已关闭','已取消'].includes(review.status));
  const closedReview = linkedReviews.find(review => review.status === '已关闭');
  const reassessing = !openReview && (active?.status === '已确认' || !!closedReview);
  useEffect(() => {
    if (!inlineReviewFocusRequest) return;
    inlineReviewRef.current?.focus({ preventScroll: true });
    inlineReviewRef.current?.scrollIntoView({ block: 'start', inline: 'nearest' });
  }, [inlineReviewFocusRequest]);
  function openInlineReview(id, action = null) {
    const issue = reviews.find(item => item.id === id);
    const row = requirements.find(item => item.id === issue?.requirementId) || active;
    if (inlineReviewId === id && inlineReviewAction === action && row?.id === active?.id && detailTab === 'response' && !reviewForm) {
      setInlineReviewFocusRequest(value => value + 1);
      return;
    }
    guardedDetail(() => {
      if (row && row.id !== active?.id) hydrate(row);
      revealCard(row); setDetailTab('response'); setReviewForm(null); reviewFormRef.current = null;
      setInlineReviewId(id); setInlineReviewAction(action);
      setInlineReviewFocusRequest(value => value + 1);
    }, row);
  }
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
  const [reconfirmKey, setReconfirmKey] = useState(null);
  const confirmedLocked = active?.status === '已确认' && reconfirmKey !== `${active.id}:${active.version}`;
  const canEdit = !confirmedLocked && actorRole !== '最终审批人'&&!staleSource&&canBusinessAction('requirement',active?.id);
  const canConfirm = ['SR','技术'].includes(actorRole)&&!staleSource&&canBusinessAction('requirement',active?.id,'confirm');
  const suggestion = matchingSuggestion(active, project.id);
  const recommendedWording = generateRecommendedWording({ ...active, ...form });
  const retrieval = retrievalById[active?.id] || 'normal';
  const states = active ? { standard: active.matchLevel === 'standard' && active.score > 80 ? '命中' : '未命中', history: active.matchLevel === 'standard' && active.score > 80 ? '未执行' : active.matchLevel === 'history' ? '命中' : '未命中', capability: (active.matchLevel === 'standard' && active.score > 80) || active.matchLevel === 'history' ? '未执行' : active.matchLevel === 'capability' ? '命中' : '未命中' } : {};
  if (retrieval === 'failed') Object.assign(states, { standard: '失败', history: '未执行', capability: '未执行' });
  if (retrieval === 'denied') Object.assign(states, { standard: '无权限', history: '未执行', capability: '未执行' });
  const conflicted = active && baseline.current.id === active.id && dirty && (baseline.current.version !== active.version || baseline.current.status !== active.status);
  const filtered = requirements.filter((r) => `${r.clause} ${r.title} ${r.original}`.toLowerCase().includes(query.toLowerCase()) && (status === '全部状态' || responseStatusLabel(r, reviews) === status) && (section === '全部章节' || JSON.stringify([r.sourceFileId || r.source, sectionLabel(r)]) === section) && (owner === '全部责任人' || r.owner === owner) && (special === '全部要求' || special === '无历史命中' && ['capability', 'none'].includes(r.matchLevel) || special === '条件差异' && r.conclusion === '有条件 Comply' || special === '关键要求' && (r.keyRequirement || /安全|精度|交货|验收/.test(r.title))));
  const directoryRows = filtered.filter(row => (row.sourceFileId || row.source) === (active?.sourceFileId || active?.source));
  const selectedDirectoryCount = directoryRows.filter(row => selected.includes(row.id)).length;
  const shown = filtered.slice((page - 1) * 6, page * 6);
  const selectedRows = requirements.filter((r) => selected.includes(r.id));
  const batchReasons = (row) => [...(!canBusinessAction('requirement',row.id,'confirm') ? ['当前账号无本条确认权限'] : []), ...(row.status === '已确认' ? ['当前版本已确认'] : []), ...(row.status === '评审中' ? ['存在待处理专业评审'] : []), ...((row.matchLevel !== 'standard' || row.score <= 80) ? ['不符合标准回复相似度 >80% 的批量条件，请逐条确认'] : []), ...confirmationValidation(row)];
  const eligibleBatch = selectedRows.filter((r) => batchReasons(r).length === 0);
  const candidates = active ? Array.from({ length: showMore ? 5 : 3 }, (_, index) => ({ id: `HIST-${active.clause}-${index + 1}`, project: `历史参考 RFQ-${index === 0 ? '2025-018' : index === 1 ? '2025-011' : `2024-00${index + 1}`}（模拟）`, date: `2025-${String(9 - index).padStart(2, '0')}-18`, model: active.realSource ? 'DEMO-YAG 150 · 模拟历史配置' : index === 0 ? 'DEMO-CUT 300 · V2.1' : 'DEMO-CUT 300 · V2.0', config: index === 0 ? '选配 X / 历史确认配置' : '标准配置 / 工况待比对', original: active.original, answer: suggestion.draft, conditions: suggestion.conditions || '仅适用历史案例记载的材料、厚度、工艺与验收方法；需核对本次条件。', evidence: suggestion.evidence || '模拟历史批准记录 V3，适用性待核对', difference: active.conclusion === '有条件 Comply' ? '本次选配、材料或测试条件尚未全部确认，与历史条件存在差异。' : '设备版本、材料与验收方案需逐项核对；相似要求不代表条件完全一致。', feedback: index === 0 ? '客户已接受（模拟记录）' : '未记录', acceptance: index === 0 ? '未记录' : '未记录', version: `V${3 - Math.min(index, 2)}` })) : [];

  useEffect(()=>{localStorage.setItem(`rfq.response.filters.${project.id}`,JSON.stringify({query,status,section}));},[query,status,section]);
  function addActivity(action, detail, id = active?.id) { const entry = { id: uid('EVT'), requirementId: id, action, detail, time: timestamp(), actor: actorRole }; setActivities((old) => [entry, ...old]); logEvent(action, id || project.id, detail); }
  function clearDirty() { dirtyRef.current = false; setDirty(false); }
  function selectDirectoryRows(checked) {
    const ids = new Set(directoryRows.map(row => row.id));
    setSelected(previous => checked ? [...new Set([...previous, ...ids])] : previous.filter(id => !ids.has(id)));
  }
  function hydrate(row) { if (!row) return; setReconfirmKey(null); setActiveId(row.id); setForm(toForm(row)); baseline.current = { id: row.id, version: row.version, status: row.status }; clearDirty(); setRightTab(row.matchLevel === 'history' ? 'history' : ['capability', 'none'].includes(row.matchLevel) ? 'capability' : 'standard'); setCandidateIndex(0); setShowMore(false); setError(''); setQueueDone(false); setReviewForm(null); reviewFormRef.current = null; setInlineReviewId(reviews.find(r => r.requirementId === row.id && !['已关闭', '已取消'].includes(r.status))?.id || null); setInlineReviewAction(null); }
  function edit(field, value) { if (!canEdit) return; setForm((old) => ({ ...old, [field]: value })); dirtyRef.current = true; setDirty(true); }
  function requestTransition(next) { if (cardBusyRef.current) return false; return guardCardNavigation({ dirty: dirtyRef.current || candidateDirty.current || !!reviewFormRef.current, onBlock: action => setTransition({ next: action }), previous: issueGuardRef.current }, next); }
  function guardedDetail(next, sourceRow) {
    const officeSource = sourceRow ? makeSourceAnchor({ ...sourceRow, projectId: project.id }) : undefined;
    const proceed = () => sourceRow && sourceRow.id !== active?.id && detailTab === 'response' && cardRef.current ? fadeToResponse(next) : next();
    const allowed = !window.__rfqRequestNavigation || window.__rfqRequestNavigation(proceed, { officeSource });
    if (allowed) proceed();
    return allowed;
  }
  function revealCard(row) { if (row && !cardRows.some(item => item.id === row.id)) { setCardFilters(EMPTY_CARD_FILTERS); setCardFilterDraft(EMPTY_CARD_FILTERS); } }
  function chooseRow(row) { if (!row) return; return guardedDetail(() => { revealCard(row); hydrate(row); setQuoteDraft(null); setActiveCommentId(null); navigate('response', row.id, { fileId: row.sourceFileId, sourceVersion: row.sourceVersion, taskId: undefined, action: undefined, reviewId: undefined }); },row); }
  function applyCardFilters(next) { const rows = selectResponseCards(requirements, reviews, next); const first = rows.find(row => row.status !== '已确认') || rows[0]; guardedDetail(() => { setCardFilters(next); setCardFilterDraft(next); setDeferredCards([]); if (first) { hydrate(first); navigate('response', first.id, { fileId: first.sourceFileId, sourceVersion: first.sourceVersion, taskId: undefined, action: undefined, reviewId: undefined }); } else { setQueueDone(false); setInlineReviewId(null); } }, first); }
  function browseCard(direction) {
    const index = cardRows.findIndex(row => row.id === active?.id);
    const row = cardRows[(index + direction + cardRows.length) % cardRows.length];
    if (row && row.id !== active?.id) chooseRow(row);
  }
  async function animateCardMotion(direction = 1, entering = false) {
    if (!aliveRef.current || !cardRef.current) return;
    const animation = playContentMotion(cardRef.current, {kind:entering?'card-in':'card-out',direction});
    if (!animation) return;
    cardAnimation.current = animation;
    try { await animation.finished; } catch {}
    animation.cancel();
    cardAnimation.current = null;
  }
  async function fadeToResponse(next) {
    if (cardBusyRef.current || !aliveRef.current) return;
    cardBusyRef.current = true;
    setCardBusy(true);
    try {
      await animateCardMotion();
      if (!aliveRef.current) return;
      // The navigation callback has already passed the unsaved-change guard.
      // Allow its synchronous route update, then lock input during the fade in.
      cardBusyRef.current = false;
      flushSync(next);
      cardBusyRef.current = true;
      await animateCardMotion(1, true);
    } catch (error) {
      if (aliveRef.current) setError(error.message || '切换失败，请重试。');
    } finally {
      cardBusyRef.current = false;
      if (aliveRef.current) setCardBusy(false);
    }
  }
  async function advanceCard(nextId, direction = 1) {
    if (!aliveRef.current) return;
    const next = requirementsRef.current.find(item => item.id === nextId);
    if (!next) { setQueueDone(true); return; }
    flushSync(() => { hydrate(next); setQuoteDraft(null); setActiveCommentId(null); });
    await animateCardMotion(direction, true);
    if (!aliveRef.current) return;
    cardBusyRef.current = false;
    navigate('response', next.id, { fileId: next.sourceFileId, sourceVersion: next.sourceVersion, taskId: undefined, action: undefined, reviewId: undefined });
  }
  async function slideToCard(nextId, direction = -1, deferred) {
    if (cardBusyRef.current || !active) return;
    cardBusyRef.current = true;
    setCardBusy(true);
    setError('');
    try {
      await animateCardMotion(direction);
      if (!aliveRef.current) return;
      if (deferred) setDeferredCards(deferred);
      await advanceCard(nextId, direction);
    } catch (error) {
      if (aliveRef.current) setError(error.message || '切换失败，请重试。');
    } finally {
      cardBusyRef.current = false;
      if (aliveRef.current) setCardBusy(false);
    }
  }
  function deferCard() {
    guardedDetail(() => {
      if (cardBusyRef.current || !active) return;
      const deferred = [...new Set([...deferredCards, active.id])];
      const next = nextResponseCard(cardRows, active.id, deferred);
      return slideToCard(next?.id, -1, deferred);
    });
  }
  async function finishConfirmation(row, nextId) {
    try {
      const success = await transitionConfirmedCard({
        confirm: () => { const success = onConfirm(row.id, row.version || 1); if (success !== false) { clearDirty(); addActivity('确认应答', `绑定条目版本 V${row.version || 1}`, row.id); setModal(null); } return success; },
        animate: () => animateCardMotion(),
        advance: () => advanceCard(nextId),
      });
      if (success === false && aliveRef.current) setError('本条未确认成功，请核对提示后重试。当前卡片和输入已保留。');
    } catch (error) { if (aliveRef.current) setError(error.message || '确认失败，请重试。'); }
    finally { cardBusyRef.current = false; if (aliveRef.current) setCardBusy(false); }
  }
  function openUnlinkedComment(value){
    if(!value.note){setNativeDiscussion(previous=>previous?.scope===value.scope?null:previous);return;}
    if(!value.open){setNativeDiscussion(previous=>previous?.scope===value.scope&&previous.note.nativeKey===value.note.nativeKey?value:previous);return;}
    return guardedDetail(()=>{setNativeDiscussion(value);setDetailTab('activity');setActiveCommentId(null);setQuoteDraft(null);},active);
  }
  function focusSource(anchor, { quote, commentId, editComment=false } = {}) {
    const row = requirements.find(r => r.id === anchor.requirementId);
    if (!row) return;
    const next = () => {
      revealCard(row);
      setNativeDiscussion(null);
      if (row.id !== active?.id) hydrate(row);
      setDetailTab(quote || commentId ? 'activity' : 'response'); setOutlineOpen(false); setActiveCommentId(commentId || null);
      setQuoteDraft(quote ? { quote, anchor } : null);
      if(editComment&&commentId)setCommentEditRequest(previous=>({id:commentId,actorId,sequence:(previous?.sequence||0)+1}));
      setProcessTab(quote || commentId ? '批注与记录' : '差距与应答');
      if (quote) detailSideRef.current?.scrollTo({ top: 0 });
      navigate('response', row.id, { fileId: anchor.fileId, sourceVersion: anchor.sourceVersion });
    };
    return guardedDetail(next,row);
  }
  useEffect(() => { if (route?.page !== 'reviews' || !route.reviewId) return; const review = reviews.find(item => item.id === route.reviewId); if (!review) return; const row = requirements.find(item => item.id === review.requirementId); revealCard(row); if (row && row.id !== activeId) hydrate(row); setDetailTab('response'); setInlineReviewId(review.id); setInlineReviewAction(route.action === 'reopen' ? 'reopen' : null); }, [route?.page, route?.reviewId]);
  function changeDetailTab(key) {
    if(key===detailTab)return;
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
  useEffect(() => { const index = requirements.findIndex((row) => row.id === focusedRequirementId); if (index >= 0) {setPage(Math.floor(index / 6) + 1);if(focusedRequirementId!==activeId){revealCard(requirements[index]);hydrate(requirements[index]);}} }, [focusedRequirementId]);
  useEffect(() => { setPage((old) => Math.min(old, Math.max(1, Math.ceil(filtered.length / 6)))); }, [filtered.length]);
  useEffect(() => { const previous = window.__rfqRequestNavigation; const hook = (next,options) => officeCanLeave(options?.officeSource) && requestTransition(next) && (!previous || previous(next,options)); window.__rfqRequestNavigation = hook; const beforeUnload = (e) => { if (dirtyRef.current || candidateDirty.current || reviewFormRef.current) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', beforeUnload); return () => { if (window.__rfqRequestNavigation === hook) { if (previous) window.__rfqRequestNavigation = previous; else delete window.__rfqRequestNavigation; } window.removeEventListener('beforeunload', beforeUnload); clearTimeout(timer.current); }; }, []);
  useEffect(() => {
    if (!pendingConfirmation) return;
    const current = requirements.find((r) => r.id === pendingConfirmation.id);
    if (!current || !formFields.every((field) => current[field] === pendingConfirmation.expected[field])) return;
    setPendingConfirmation(null);
    finishConfirmation(current, pendingConfirmation.nextId);
  }, [requirements, pendingConfirmation]);

  function beginConfirm() { if (cardBusyRef.current) return; if (reviewForm) { setError('请先提交或取消当前新增事项。'); return; } confirmOne(); }
  function closeConfirmationValidation() { setModal(null); setError(''); }
  function confirmOne() {
    if (cardBusyRef.current) return;
    if (!active || !canConfirm) { setError(`本条确认责任人：${getConfirmationActorIds(appState,project.id,active).map(id=>personName(appState,id)).join('、')}`); return; }
    if(openReview){openInlineReview(openReview.id);return;}
    if (openReview || active.pendingReviewProposal) { setError('请先核对本条评审建议。'); return; }
    const issues = confirmationValidation({ ...active, ...form });
    if (issues.length) { setError(issues.join('；')); setModal('confirmation-validation'); return; }
    if (conflicted) { setModal('conflict'); return; }
    cardBusyRef.current = true; setCardBusy(true); setError('');
    const nextId = nextResponseCard(cardRows, active.id, deferredCards)?.id;
    if (dirty) {
      const expected = { ...form };
      if (onUpdateRequirement(active.id, expected,baseline.current.version||1) === false) { cardBusyRef.current = false; setCardBusy(false); setError('草稿保存失败，当前输入已保留。'); return; }
      addActivity('修改后确认', '保存当前应答修改并确认条目');
      setForm(expected); clearDirty(); setPendingConfirmation({ id: active.id, expected, nextId });
    } else finishConfirmation(active, nextId);
  }
  function batchConfirm() {
    if (cardBusyRef.current || !selectedRows.length) return;
    if (dirtyRef.current) { setError('当前条目存在未提交修改，请先确认当前条目再执行批量确认'); return; }
    setError('');
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
    guardedDetail(() => { setInlineReviewId(null); setReviewForm({ kind, title: kind === 'rereview' ? `${active.title} · 重新专项评审` : kind === 'reject' ? `${active.title} · 匹配结果未接受` : `${active.title} · 评审`, type:active.category||'技术', source: kind === 'rereview' ? '重新评审' : kind === 'reject' ? '用户未接受' : active.matchLevel === 'none' ? '知识库中没有' : active.score < 80 ? '置信度低' : '人工发起专项评审', owner:'技术', reviewerIds: [], deadline: project.deadline || '2026-10-28', description: candidate ? `参考 ${candidate.project} ${candidate.version}；${candidate.difference}` : '', evidence:reviewEvidenceHref(form.evidence) }); setError(''); });
  }
  function submitReview() {
    if (!reviewForm.title.trim() || !reviewForm.type || !reviewForm.deadline || !reviewForm.description.trim() || !reviewForm.reviewerIds?.length) { setError('请补齐备注、评审人和截止时间。'); return false; }
    const requirementVersion = dirty ? applyRequirementEdit(active, form).version || 1 : active.version || 1;
    let request;
    try { request = buildReviewRequest({ requirement: active, form: reviewForm, requirementVersion }); }
    catch (error) { setError(error.message); return false; }
    setError('');
    if (dirty && !saveDraft()) return false;
    const created = onCreateReview({...request,id:reviewForm.id,commentId:reviewForm.commentId,reviewerIds:reviewForm.reviewerIds});
    if (created === false) return false;
    setInlineReviewId(created); addActivity(reviewForm.kind === 'reject' ? '明确拒绝本条匹配并建立偏离' : '发起评审', reviewForm.description); setReviewForm(null); reviewFormRef.current = null; toast('关联事项已创建，可直接在当前条目处理'); return true;
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
  if (!requirements.length) return <div className="response-page rfq-detail"><div className="detail-layout"><div className="detail-document-column">{sourceSummary.status==='empty'?<section className="detail-source detail-no-source"><EmptyState title="还没有 RFQ 原文" description="上传客户文件或载入示例后，在这里阅读原文并处理条款。" action={<UiButton className="btn btn-primary" onClick={() => {const next=getSourceUploadRoute({...route,projectId:project.id},actorRole);navigate(next.page,null,next);}}>{canPerform(actorRole,'source:manage')?'上传与解析资料':'查看来源资料'}<ArrowRight size={15}/></UiButton>}/></section>:<SourceProcessingPane summary={sourceSummary} onOpen={()=>navigate('documents')}/>}</div><div className="response-processing detail-business"><Tabs className="rfq-detail-native-tabs" aria-label="RFQ 详情分区" activeKey={detailTab} onChange={changeDetailTab} animated={{ inkBar:true, tabPane:false }} items={[{key:"response",label:"应答"},{key:"activity",label:"讨论"}]}/><div className="detail-side-content">{detailTab === 'activity' ? <ProjectActivityPanel project={project} requirements={requirements} reviews={reviews} snapshots={[]} comments={projectComments} members={appState.membersByProject?.[project.id] || []} audit={appState.audit || []} onLocate={() => {}}/> : <EmptyState title="应答项尚未生成" description={sourceSummary.status==='empty'?'上传并解析客户文件后，可在这里处理应答项。':'当前文件正在解析，完成后可在这里处理应答项。'}/>}</div></div></div></div>;
  const activeSourceAnchor={ ...makeSourceAnchor({ ...active, projectId: project.id }), ...(route?.requirementId === active.id ? { sourceVersion: route.sourceVersion || String(active.sourceVersion || '1'), fileId: route.fileId || active.sourceFileId || active.source || 'manual' } : {}) };
  const sourceToolbar={fileSelector:<UiSelect className="select rfq-document-file-selector" aria-label="应答来源文件" value={active.sourceFileId || active.source || 'manual'} onChange={e => { const row = requirements.find(r => (r.sourceFileId || r.source || 'manual') === e.target.value); if (row) chooseRow(row); }}>{[...new Map(requirements.map(r => [r.sourceFileId || r.source || 'manual', r.source || '人工补录'])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</UiSelect>,actions:<><UiButton className={`btn btn-sm rfq-directory-trigger ${outlineOpen?'active':''}`} aria-label="展开文档目录" title="目录" aria-expanded={outlineOpen} onClick={()=>setOutlineOpen(!outlineOpen)}><BookOpen size={14}/><span className="count-pill">{requirements.length}</span></UiButton><ResponseCardQuery compact filters={cardFilters} draft={cardFilterDraft} sources={cardSources} disabled={cardBusy} onDraftChange={setCardFilterDraft} onApply={applyCardFilters}/><UiButton className={`btn btn-sm rfq-response-toggle ${showResponses?'active':''}`} aria-label="应答标注" title={showResponses?'隐藏应答标注':'显示应答标注'} aria-pressed={showResponses} onClick={()=>setShowResponses(!showResponses)}><MessageSquarePlus size={14}/></UiButton></>};
  const directoryPanel=outlineOpen && <RfqDirectory documentOutline={documentOutline?.sourceKey===craftSourceKey(activeSourceAnchor)?documentOutline:undefined} onNavigateHeading={target=>void documentOutline?.navigateHeading?.(target)} onClose={()=>setOutlineOpen(false)}><label className="detail-outline-search"><Search size={14}/><UiInput className="input" aria-label="搜索要求" placeholder="搜索条款或要求" value={query} onChange={e => setQuery(e.target.value)}/></label><UiSelect className="select" aria-label="处理状态" value={status} onChange={e => setStatus(e.target.value)}><option>全部状态</option>{Object.values(RESPONSE_STATUS_LABELS).map(v => <option key={v}>{v}</option>)}</UiSelect><RequirementOutline getStatusLabel={row => responseStatusLabel(row, reviews)} rows={directoryRows} selectedId={active.id} onSelect={row => { chooseRow(row); setOutlineOpen(false); }} selected={selected} onCheck={(id, checked) => setSelected(old => checked ? [...new Set([...old, id])] : old.filter(v => v !== id))}/><div className="detail-outline-footer"><UiCheckbox aria-label="全选当前筛选条款" title="全选当前文件中符合筛选条件的条款" checked={directoryRows.length > 0 && selectedDirectoryCount === directoryRows.length} indeterminate={selectedDirectoryCount > 0 && selectedDirectoryCount < directoryRows.length} disabled={!directoryRows.length} onChange={event => selectDirectoryRows(event.target.checked)}>全选</UiCheckbox><UiButton className="text-link" onClick={() => { setQuery(''); setStatus('全部状态'); setSection('全部章节'); setOwner('全部责任人'); setSpecial('全部要求'); }}>重置筛选</UiButton><UiButton className="btn btn-sm" disabled={!selected.length || dirty || cardBusy} title={dirty ? '请先保存当前应答修改' : undefined} onClick={batchConfirm}>批量确认 {selected.length || ''}</UiButton></div></RfqDirectory>;
  return <div className="response-page rfq-detail">
    {staleSource && <Notice warning>当前链接指向旧来源版本，本页只读。<UiButton className="text-link" onClick={() => chooseRow(active)}>打开当前有效来源版本</UiButton></Notice>}
    <div className="response-workbench detail-layout rfq-splitter-layout" ref={detailLayoutRef}><Splitter style={{height:narrowWorkbench?1100:'100%'}} className="rfq-workbench-splitter" layout={narrowWorkbench?'vertical':'horizontal'} onResize={sizes=>{const total=sizes.reduce((sum,size)=>sum+size,0);if(total)setPaneShare(sizes[0]/total*100);}}>
      <Splitter.Panel size={paneShare+'%'} min={narrowWorkbench?280:320}><div className="detail-document-column">

        <SourceDocumentPane toolbar={sourceToolbar} directory={directoryPanel} onDocumentOutlineChange={setDocumentOutline} allComments={allProjectComments} people={mentionPeople} canEditRow={row=>actorRole!=='最终审批人'&&!staleSource&&canBusinessAction('requirement',row.id)} onProjectCommentsChange={changeProjectComments} canManageOffice={!staleSource&&canPerform(actorRole,'source:manage',{state:appState,actorId,projectId:project.id})} officeUser={{id:actorId,name:personName(appState,actorId)}} focusOnMount={Boolean(route?.requirementId)} file={(appState?.documentsByProject?.[project.id] ?? read(`fep-rfq-documents:${project.id}`, null)?.files ?? makeDocumentDemo(project.id, requirements).files).find(f => f.id === active.sourceFileId)} rows={requirements.filter(r => (r.sourceFileId || r.source) === (active.sourceFileId || active.source)).map(r => ({ ...r, projectId: project.id }))} selectedAnchor={activeSourceAnchor} showResponses={showResponses} quoteDraft={quoteDraft} responsePreview={!conflicted && !staleSource ? { ...active, ...form } : undefined} comments={projectComments} activeCommentId={activeCommentId} onQuote={canEdit ? (quote, anchor) => focusSource(anchor, { quote }) : null} onSelectAnchor={anchor => focusSource(anchor)} onUnlinkedComment={openUnlinkedComment} onSelectComment={(commentId, anchor, options) => focusSource(anchor, { commentId,editComment:Boolean(options?.edit) })}/>
      </div></Splitter.Panel>
      <Splitter.Panel size={(100-paneShare)+'%'} min={narrowWorkbench?360:380}><div className="response-processing detail-business"><Tabs className="rfq-detail-native-tabs" aria-label="RFQ 详情分区" activeKey={detailTab} onChange={changeDetailTab} animated={{ inkBar:true, tabPane:false }} items={[{key:"response",label:"应答"},{key:"activity",label:"讨论"}]}/><div className="detail-side-content" ref={detailSideRef}>

        {detailTab === 'activity' && <><div className="workspace-row-actions"><UiButton className="btn btn-sm" disabled={!canEdit} onClick={()=>focusSource(makeSourceAnchor({...active,projectId:project.id}),{quote:active.sourceOriginal??active.original})}><MessageSquarePlus size={14}/>批注当前条款</UiButton></div>{nativeDiscussion&&<div className="detail-annotations"><UnlinkedCommentPanel key={nativeDiscussion.scope+nativeDiscussion.note.nativeKey} value={nativeDiscussion}/></div>}{!nativeDiscussion && <div className="detail-annotations"><AnnotationPanel editRequest={commentEditRequest} onEditRequestHandled={request=>setCommentEditRequest(previous=>previous===request?null:previous)} canManage={!staleSource&&canPerform(actorRole,'source:manage',{state:appState,actorId,projectId:project.id})} people={mentionPeople} activeCommentId={detailTab === 'activity' ? activeCommentId : null} onSelectComment={setActiveCommentId} comments={projectComments} rows={requirements.map(r=>({...r,projectId:project.id}))} anchor={activeSourceAnchor} actorId={actorId} canEdit={canEdit} quoteDraft={quoteDraft} onClearQuote={()=>setQuoteDraft(null)} onChange={changeProjectComments} onLocate={(anchor,commentId)=>focusSource(anchor,{commentId})} onPromote={issue=>{const existing=reviews.find(r=>r.id===issue.id);if(existing){openInlineReview(existing.id);return existing.id;}setDetailTab('response');setInlineReviewId(null);setReviewForm({...issue,commentId:issue.sourceCommentId,kind:'review',owner:'SR',reviewerIds:[],deadline:project.deadline,type:active.category||'技术',source:'原文批注',evidence:reviewEvidenceHref(form.evidence)});return null;}}/></div>}<ProjectActivityPanel project={project} requirements={requirements} reviews={reviews} snapshots={appState.snapshotsByProject?.[project.id] || []} comments={projectComments} members={appState.membersByProject?.[project.id] || []} audit={appState.audit || []} onLocate={comment => focusSource(comment.anchor, { commentId: comment.id })}/></>}
        <div className="detail-clause-content response-clarification" style={{ display: detailTab === 'response' ? 'flex' : 'none' }}>
          <ResponseCardFilters stats={cardStats} filters={cardFilters} draft={cardFilterDraft} disabled={cardBusy} onApply={applyCardFilters}/>
          <div className="response-card-workspace">
          <div className="response-card-deck" aria-busy={cardBusy}>
            {cardVisible ? <article ref={cardRef} className="response-current-card" aria-label="当前应答项"><fieldset disabled={cardBusy}>
<section className="panel response-editor"><div className="response-column-heading"><h2>应答编辑</h2>{dirty && <span role="status" aria-label="应答保存状态" className="response-save-state dirty">● 应答未保存</span>}</div><div className="response-editor-body"><div className="response-active-title"><span className="response-clause">条款 {active.clause || "无编号"}</span><StatusBadge status={responseStatusLabel(active, reviews)} /><div className="response-card-title-row"><h2>{active.title}</h2><span className="response-confirmation-owner">确认责任人：{getConfirmationActorIds(appState,project.id,active).map(id=>personName(appState,id)).join("、")||"待配置项目SR"}</span></div></div><div className="response-customer-requirement"><UiButton className="text-link" onClick={() => navigate('documents', active.id)}><ChevronLeft size={13}/>返回解析定位本条</UiButton><div><span>客户原始要求</span><UiButton className="text-link" onClick={() => { setModal('original'); setError(''); }}>查看 / 修订</UiButton></div><p>{active.original}</p>{active.realSource && <a className="text-link" href={active.sourceUrl} target="_blank" rel="noreferrer">查看英文原PDF · 第{active.sourcePage}页 ↗</a>}<small><FileText size={12} />{active.source} · 第 {active.sourcePage || 1} 页</small></div>
        {conflicted && <Notice warning>条目版本已更新。当前输入仍保留，保存及确认前请核对最新版本。</Notice>}{actorRole === '最终审批人' && <Notice>条款由技术确认，请在最终审批中核对整份应答。<UiButton className="text-link" onClick={() => goPage('export')}>查看最终审批</UiButton></Notice>}{openReview && <Notice warning>{hasAssignedConfirmer(active)?'评审处理中；评审完成后由条款确认人确认本条。':'评审处理中；全部评审人确认后完成本条。'}<UiButton className="text-link" onClick={() => openInlineReview(openReview.id)}>查看事项</UiButton></Notice>}
        {active.status==='待确认'&&active.confirmationReason&&<Notice>{active.confirmationReason}</Notice>}{active.pendingReviewProposal&&<Notice warning>有一份获批评审建议待核对；当前人工答复已保留。<UiButton className="text-link" onClick={()=>{setProposalReason('');setModal('review-proposal');}}>核对差异与采用</UiButton></Notice>}<AssessmentPanel sourceScope={activeSourceAnchor} row={active} project={project} suggestion={suggestion} retrieval={retrieval}/>
        <div className="form-grid response-form"><div className="field response-wide"><span><i className="response-required">*</i>人工最终结论</span><Radio.Group aria-label="人工最终结论" className="rfq-conclusion-radio" value={form.conclusion} disabled={!canEdit} onChange={event=>edit('conclusion',event.target.value)} options={['Comply','有条件 Comply','不满足','不适用','待确认']}/></div>{form.conclusion === '不适用' && <Field label="备注" wide><UiTextArea className="input" aria-label="备注" value={form.reason} readOnly={!canEdit} onChange={(e) => edit('reason', e.target.value)} placeholder="填写备注（选填）" /></Field>}</div>
        {form.conclusion !== 'Comply' && recommendedWording && <RecommendedWording key={`${active.id}:${recommendedWording}`} recommendation={recommendedWording} currentDraft={form.draft} canEdit={canEdit} onAdopt={wording => { if (!canEdit) return; edit('draft', wording); addActivity('采用推荐话术', `根据${form.conclusion}生成话术并采用为应答草稿`); toast('推荐话术已带入应答草稿，提交或确认后保存'); }}/>}
        {savedCandidate && <Notice>能力候选 <b>{savedCandidate.id}</b> 已保存为草稿。发布前不会改变当前应答。<UiButton className="text-link" onClick={() => goPage('capabilities')}>查看候选</UiButton></Notice>}
        <div className="response-card-issue-tools"><span>{openReview ? '本条有待处理事项' : ''}</span><div><ResponseAssignmentControl key={`${active.id}:${actorId}`} state={appState} project={project} requirementId={active.id} route={route} disabled={!!staleSource || cardBusy} onRequestOpen={guardedDetail} onPersonnelAction={onPersonnelAction}/><UiButton type="button" className="btn" aria-expanded={!!reviewForm || !!inlineReviewId} disabled={!canEdit && !linkedReviews.length} onClick={() => { const issue = linkedReviews.find(r => !['已关闭','已取消'].includes(r.status)) || linkedReviews[0]; if (issue) { if (inlineReviewId === issue.id) guardedDetail(() => setInlineReviewId(null)); else openInlineReview(issue.id); } else startAssessment(); }}>评审<ChevronDown size={13}/></UiButton></div></div>
        {!!linkedReviews.length && <div className="rfq-linked-reviews"><div className="rfq-section-title"><strong>问题处理记录</strong><span>{linkedReviews.length} 项</span></div>{linkedReviews.map((review) => <button key={review.id} className="rfq-review-link" onClick={() => openInlineReview(review.id)}><span><b>{review.title}</b><small>{review.owner} · 截止 {review.deadline || '未设置'}</small></span><StatusBadge status={review.status}/><ChevronRight size={14}/></button>)}</div>}
    {inlineReviewId && <div ref={inlineReviewRef} role="region" aria-label="当前评审事项" tabIndex={-1}><ReviewsPage appState={appState} project={project} requirements={requirements} reviews={reviews} actorRole={actorRole} actorId={actorId} canBusinessAction={canBusinessAction} toast={toast} navigate={navigate} logEvent={logEvent} onUpdateReview={onUpdateReview} onAdoptReview={onAdoptReview} onConfirmReviewed={onConfirmReviewed} embedded inline registerNavigationGuard={registerIssueGuard} key={inlineReviewId} initialAction={inlineReviewAction} initialReviewId={inlineReviewId} onCloseEmbedded={() => {setInlineReviewId(null);setInlineReviewAction(null);}}/></div>}
    {reviewForm && <InlineReviewSurface
      title={reviewForm.kind === 'rereview' ? '重新评审' : reviewForm.kind === 'reject' ? '明确拒绝匹配并建立偏离' : '评审'}
      width={620} onClose={() => setReviewForm(null)}
      footer={<><UiButton className="btn" onClick={() => setReviewForm(null)}>取消</UiButton><UiButton className="btn btn-primary" onClick={submitReview}>{reviewForm.kind === 'rereview' ? '发起重新评审' : '发起评审'}</UiButton></>}
    >
            <Notice>{reviewForm.kind === 'reject' ? '请说明匹配结果不适用的原因，由技术评估处理方案。' : '选择一位或多位评审人。全部评审人确认同一版应答后，直接完成本条确认。'}</Notice>
      <div className="form-grid response-spaced">



        {<div className="field response-wide"><span>评审人（可多选） *</span><ReviewerPicker state={appState} project={project} value={reviewForm.reviewerIds||[]} onChange={reviewerIds=>setReviewForm({...reviewForm,reviewerIds})}/><UiButton type="button" className="text-link" onClick={()=>navigate('settings')}>项目人员配置</UiButton></div>}
        <Field label="截止时间" required><UiInput className="input" type="date" value={reviewForm.deadline} onChange={(e) => setReviewForm({ ...reviewForm, deadline: e.target.value })} /></Field>
        <Field label={reviewForm.kind === 'rereview' ? '重新评审原因' : reviewForm.kind === 'reject' ? '明确拒绝的理由' : '备注'} required wide><UiTextArea className="input response-reply" value={reviewForm.description} onChange={(e) => setReviewForm({ ...reviewForm, description: e.target.value })} placeholder="填写备注" /></Field>
      </div>
      {error && <p className="response-error">{error}</p>}
    </InlineReviewSurface>}
        </div></section>
      </fieldset></article> : <div className="response-card-empty"><CheckCircle2 size={30}/><h3>{cardRows.length ? '本轮处理完成' : '没有符合条件的应答项'}</h3><p>{cardRows.length ? `还有 ${requirements.filter(row => row.status !== '已确认').length} 条未完成，可通过统计筛选继续处理。` : '调整搜索或筛选条件后重试。'}</p><UiButton className="btn btn-primary" onClick={() => applyCardFilters(EMPTY_CARD_FILTERS)}>查看全部应答项</UiButton></div>}
          </div>
          </div>
          <footer className="response-fixed-actions" aria-label="应答操作栏">
            {error && !modal && <p className="response-error" role="alert">{error}</p>}
            {cardVisible && (staleSource || openReview || !canConfirm) && <p className="response-permission-tip">{staleSource?'当前为旧来源版本，请打开有效版本':openReview?hasAssignedConfirmer(active)?'评审完成后由条款确认人确认':'全部评审人确认后完成':'当前账号无本条确认权限'}</p>}
            <div className="response-fixed-action-row">
              <nav className="response-card-navigation" aria-label="切换应答条款">
                <UiButton type="button" className="icon-btn" aria-label="上一条" title="上一条" disabled={cardBusy || !cardRows.length} onClick={() => browseCard(-1)}><ChevronLeft size={16}/></UiButton>
                <span>{cardVisible ? cardRows.findIndex(row => row.id === active.id) + 1 : 0} / {cardRows.length}</span>
                <UiButton type="button" className="icon-btn" aria-label="下一条" title={nextCard ? `下一条 · ${nextCard.title}` : '下一条'} disabled={cardBusy || !cardRows.length} onClick={() => browseCard(1)}><ChevronRight size={16}/></UiButton>
              </nav>
              {cardVisible && actorRole !== '最终审批人' && <div className="response-fixed-primary-actions">
                <UiButton type="button" className="text-link" disabled={cardBusy} onClick={deferCard}>稍后处理</UiButton>
                <UiButton type="button" className="btn" disabled={cardBusy || !canEdit || !dirty} onClick={() => saveDraft()}><Save size={14}/>保存草稿</UiButton>
                {['SR','技术'].includes(actorRole) && confirmedLocked && <UiButton type="button" className="btn" disabled={cardBusy || !canConfirm} onClick={() => setReconfirmKey(`${active.id}:${active.version}`)}><Pencil size={14}/>再次确认</UiButton>}
                {['SR','技术'].includes(actorRole) && !confirmedLocked && <UiButton type="button" className="btn btn-primary" onClick={beginConfirm} disabled={cardBusy || !canConfirm || !!active.pendingReviewProposal || active.status === '已确认' && !dirty}><Check size={14}/>{cardBusy ? '处理中…' : active.status === '已确认' && !dirty ? '本条已确认' : openReview&&openReview.kind!=='clarification'&&!hasAssignedConfirmer(active)?'处理本人评审':'确认本条'}</UiButton>}
              </div>}
            </div>
          </footer>
        </div></div></div></Splitter.Panel></Splitter>
      <div className={'rfq-keyboard-separator '+(narrowWorkbench?'is-vertical':'')} role="separator" tabIndex={0}
        aria-label={narrowWorkbench?'调整原文与应答比例，使用上下方向键':'调整原文与应答比例，使用左右方向键'}
        aria-orientation={narrowWorkbench?'horizontal':'vertical'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(paneShare)}
        style={narrowWorkbench?{top:paneShare+'%'}:{left:paneShare+'%'}} onKeyDown={resizeWithKeyboard}/>
      <AnnotationConnector containerRef={detailLayoutRef} commentId={detailTab === 'activity' ? activeCommentId : null}/>
    </div>

    {modal === 'confirmation-validation' && <Modal title="暂无法确认本条" centered width={480} onClose={closeConfirmationValidation} footer={<UiButton type="button" className="btn btn-primary" onClick={closeConfirmationValidation}>返回修改</UiButton>}><p role="alert">{error}</p></Modal>}
    {modal==='review-proposal'&&active.pendingReviewProposal&&<Modal title="核对评审建议与人工答复" width={800} onClose={()=>setModal(null)} footer={<><UiButton className="btn" onClick={()=>setModal(null)}>暂不采用</UiButton><UiButton className="btn" disabled={dirty||!canConfirm||!proposalReason.trim()} onClick={()=>{if(onAdoptReview(active.id,active.pendingReviewProposal,proposalReason))setModal(null);}}>保留人工答复并记录理由</UiButton><UiButton className="btn btn-primary" disabled={dirty||!canConfirm} onClick={()=>{if(onAdoptReview(active.id,active.pendingReviewProposal))setModal(null);}}>采用建议并保存待处理</UiButton></>}><Notice>建议基于条款 V{active.pendingReviewProposal.baseVersion}；采用后仍需单独确认。{dirty?'当前有未保存编辑，请先完成当前条目的提交或确认。':''}</Notice><div className="response-diff-grid"><div><h4>当前人工答复 · V{active.version}</h4><p>{active.draft}</p><small>{active.conditions}</small><p>{active.evidence}</p></div><div><h4>建议 · {active.pendingReviewProposal.reviewId}</h4><p>{active.pendingReviewProposal.proposal.draft}</p><small>{active.pendingReviewProposal.proposal.conditions}</small><p>{active.pendingReviewProposal.proposal.evidence}</p></div></div><label className="field"><span>保留人工答复的理由</span><UiTextArea className="input" value={proposalReason} onChange={e=>setProposalReason(e.target.value)}/></label></Modal>}
    {modal === 'confirm'  && <Modal title={dirty ? '修改后确认当前条目' : '确认当前条目应答'} onClose={() => setModal(null)} footer={<><UiButton className="btn" onClick={() => setModal(null)}>取消</UiButton><UiButton className="btn btn-primary" disabled={!canConfirm || !!pendingConfirmation} onClick={confirmOne}>{pendingConfirmation ? '保存后确认中…' : '确认本条'}</UiButton></>}><div className="response-modal-title"><span>条款 {active.clause} · V{active.version || 1}</span><h3>{active.title}</h3></div><Description rows={[["最终结论", form.conclusion], ...(form.conclusion === '不适用' ? [['备注', form.reason]] : []), ...(form.conclusion !== 'Comply' ? [['推荐话术', form.draft]] : [])]} /><Notice>确认绑定当前条目版本，不代表最终快照已批准。未关闭评审、结论未明确或权限不足会阻止确认。</Notice><label className="response-checkbox"><UiCheckbox type="checkbox" checked={confirmNext} onChange={(e) => setConfirmNext(e.target.checked)} />确认后跳转下一未完成条目</label>{error && <p className="response-error" role="alert">{error}</p>}</Modal>}
    {modal === 'batch-result' && <Modal title="批量确认结果" width={820} onClose={() => setModal(null)} footer={<UiButton className="btn" onClick={() => setModal(null)}>完成</UiButton>}>
      <Notice warning={batchSummary.excluded > 0 || batchResults?.some(row => row.result === '确认失败')}>
        本次选择 {batchSummary.total} 条；确认成功 {batchResults?.filter(row => row.result === '确认成功').length || 0} 条，确认失败 {batchResults?.filter(row => row.result === '确认失败').length || 0} 条，排除 {batchSummary.excluded} 条。
      </Notice>
      <div className="table-wrap response-batch-table"><BusinessTable className="data-table"><thead><tr><th>条款 / 要求</th><th>状态</th><th>执行结果</th></tr></thead><tbody>{(batchResults || []).map(row => <tr key={row.id}><td>{row.clause} {row.title}</td><td><StatusBadge status={responseStatusLabel(row, reviews)} /></td><td><StatusBadge status={row.result}/><p>{row.message}</p></td></tr>)}</tbody></BusinessTable></div>
    </Modal>}
    {transition && <Modal title="存在未保存的修改" onClose={() => setTransition(null)} footer={<><UiButton className="btn" onClick={() => setTransition(null)}>取消切换</UiButton><UiButton className="btn" onClick={() => { setForm(toForm(active)); baseline.current = { id: active.id, version: active.version, status: active.status }; clearDirty(); setReviewForm(null); reviewFormRef.current = null; candidateDirty.current = false; setCapabilityForm(null); const next = transition.next; setTransition(null); next?.(); }}>放弃修改</UiButton><UiButton className="btn btn-primary" onClick={() => { if (candidateDirty.current && !saveCapability()) return; if (reviewFormRef.current && !submitReview()) return; if (dirtyRef.current && !saveDraft()) return; const next = transition.next; setTransition(null); next?.(); }}>保存后切换</UiButton></>}><p>当前应答或新增事项尚未保存。保存成功后再切换，或放弃本次修改。</p>{error && <p className="response-error">{error}</p>}</Modal>}
    {adoption && <Modal title="采用建议前核对应答差异" onClose={() => setAdoption(null)} width={760} footer={<><UiButton className="btn" onClick={() => setAdoption(null)}>保留当前编辑</UiButton><UiButton className="btn btn-primary" onClick={() => applyAdoption(adoption.proposal, adoption.label)}>采用建议并保留来源条件</UiButton></>}><Notice>当前应答已有内容。采用将替换答复、结论、条件和证据；仍需人工保存与确认。</Notice><div className="response-diff-grid"><div><h4>当前人工答复</h4><p>{form.draft}</p><small>条件：{form.conditions || '未填写'}</small></div><div><h4>{adoption.label}</h4><p>{adoption.proposal.draft}</p><small>条件：{adoption.proposal.conditions || '未填写'}</small></div></div></Modal>}

    {capabilityForm && <Drawer title="补充机型能力边界 · 候选草稿" width={650} onClose={() => { setTransition({ next: () => { setCapabilityForm(null); candidateDirty.current = false; } }); }} footer={<><UiButton className="btn" onClick={() => { setTransition({ next: () => { setCapabilityForm(null); candidateDirty.current = false; } }); }}>取消</UiButton><UiButton className="btn btn-primary" onClick={saveCapability}>保存能力候选</UiButton></>}><Notice>保存为未发布候选，不覆盖当前应答，不自动改变 Comply 结论。请在能力维护页核对条件、证据并独立批准。</Notice><div className="form-grid response-spaced"><Field label="关联机型" required><UiSelect className="select" aria-label="补充能力关联机型" value={capabilityForm.modelId} onChange={e=>{const chosen=[...capabilityModels].sort((a,b)=>b.version-a.version).find(m=>m.id===e.target.value);setCapabilityForm({...capabilityForm,modelId:e.target.value,processId:'',config:chosen?.config||''});}}><option value="">请选择本BU的机型及硬件版本</option>{[...new Set(capabilityModels.map(m=>m.id))].map(id=>{const m=[...capabilityModels].filter(m=>m.id===id).sort((a,b)=>b.version-a.version)[0];return <option key={id} value={id}>{m.name} {m.revision} · {m.code}</option>;})}</UiSelect></Field><Field label="关联工艺" required><UiSelect className="select" aria-label="补充能力关联工艺" value={capabilityForm.processId} onChange={e=>setCapabilityForm({...capabilityForm,processId:e.target.value})}><option value="">请选择机型下的工艺</option>{capabilityProcesses.filter(p=>p.modelId===capabilityForm.modelId&&p.enabled!==false).map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</UiSelect></Field><Field label="配置 / 项目基线" required><UiInput className="input" value={capabilityForm.config} onChange={(e) => setCapabilityForm({ ...capabilityForm, config: e.target.value })} /></Field><Field label="能力指标" required><UiInput className="input" value={capabilityForm.metric} onChange={(e) => setCapabilityForm({ ...capabilityForm, metric: e.target.value })} /></Field><Field label="实际能力值 / 范围" required><UiInput className="input" value={capabilityForm.value} onChange={(e) => setCapabilityForm({ ...capabilityForm, value: e.target.value })} /></Field><Field label="值类型"><UiSelect className="select" value={capabilityForm.valueType} onChange={(e) => setCapabilityForm({ ...capabilityForm, valueType: e.target.value })}>{['保证值', '典型值', '范围值', '描述值'].map((v) => <option key={v}>{v}</option>)}</UiSelect></Field><Field label="来源"><UiInput className="input" readOnly value="手动补充" /></Field><Field label="适用条件" required wide><UiTextArea className="input response-conditions" value={capabilityForm.conditions} onChange={(e) => setCapabilityForm({ ...capabilityForm, conditions: e.target.value })} placeholder="材料、厚度、工艺、测试方法与工况" /></Field><Field label="限制" wide><UiTextArea className="input" value={capabilityForm.limits} onChange={(e) => setCapabilityForm({ ...capabilityForm, limits: e.target.value })} /></Field><Field label="证据与版本" wide><UiInput className="input" value={capabilityForm.evidence} onChange={(e) => setCapabilityForm({ ...capabilityForm, evidence: e.target.value })} list="response-evidence-options" placeholder="可在能力维护页补齐有效证据" /><datalist id="response-evidence-options">{capabilityEvidence.filter((r) => r.status === '有效').map((r) => <option key={r.id} value={`${r.id} v${r.version}，${r.location || '请补充页码'}`}>{r.name}</option>)}</datalist></Field><Field label="来源定位" wide><UiTextArea className="input" readOnly value={capabilityForm.sourceLocation} /></Field></div>{error && <p className="response-error">{error}</p>}</Drawer>}
    {historyDetail && <Drawer title="历史候选详情 · 模拟参考" width={720} onClose={() => setHistoryDetail(null)} footer={<><UiButton className="btn" onClick={() => { startReview('review', historyDetail); setHistoryDetail(null); }}>发起专家评审</UiButton><UiButton className="btn btn-primary" disabled={!canEdit} onClick={() => { adoptSuggestion({ ...historyDetail, conclusion: suggestion.conclusion }, `${historyDetail.project} ${historyDetail.version}`); setHistoryDetail(null); }}>修改后复用</UiButton></>}><h3>{historyDetail.project}</h3><Description rows={[["时间 / 配置", `${historyDetail.date} · ${historyDetail.model} · ${historyDetail.config}`], ['来源版本', `${historyDetail.id} · ${historyDetail.version}`], ['历史要求', historyDetail.original], ['已审核答复', historyDetail.answer], ['审核状态', '已批准（模拟记录）'], ['与本次条件差异', historyDetail.difference], ['历史方案 / 适用条件', historyDetail.conditions], ['候选证据', historyDetail.evidence], ['客户沟通结果', historyDetail.feedback], ['实际验收结果', historyDetail.acceptance], ['建议动作', '核对配置、材料与验收条件后修改复用；不明确时发起评审']]} /><Notice warning>历史客户接受与实际验收分开记录。未知结果显示未记录，不推断为验收通过。</Notice></Drawer>}
    {modal === 'original' && <Drawer title="客户原文与来源修订" width={650} onClose={() => setModal(null)} footer={<><UiButton className="btn" onClick={() => setModal(null)}>关闭</UiButton><UiButton className="btn btn-primary" disabled={!canEdit} onClick={() => { setModal(null); toast('原文修订保留在当前草稿中，请保存并重新核对匹配结果'); }}>带入当前草稿</UiButton></>}><Description rows={[["来源文件", active.source], ['页码 / 条款', `第 ${active.sourcePage || 1} 页 / ${active.clause}`], ['当前版本', `V${active.version || 1}`]]} /><Field label="客户要求原文" required wide><UiTextArea className="input response-reply" value={form.original} readOnly={!canEdit||!canPerform(actorRole,'source:manage')} onChange={(e) => {if(canPerform(actorRole,'source:manage'))edit('original', e.target.value);}} /></Field><Notice warning>原文修订会影响当前建议及确认有效性。保存后须重新核对，不自动沿用旧版批准。</Notice></Drawer>}
    {modal === 'rematch' && <Modal title="重新执行三级匹配" onClose={() => setModal(null)} footer={<><UiButton className="btn" onClick={() => setModal(null)}>取消</UiButton><UiButton className="btn btn-primary" onClick={rematch}>开始重新匹配</UiButton></>}><Notice>按“标准回复库 → 历史 RFQ → 能力边界”依次执行；只刷新模拟检索结果与建议，保留当前人工答复和编辑内容。</Notice><Field label="原型场景"><UiSelect className="select" value={retrievalMode} onChange={(e) => setRetrievalMode(e.target.value)}><option value="normal">正常分级匹配</option><option value="failed">模拟标准检索失败</option><option value="denied">模拟检索来源无权限</option></UiSelect></Field></Modal>}
    {modal === 'conflict' && <Modal title="条目版本已变化，无法覆盖保存" width={750} onClose={() => setModal(null)} footer={<><UiButton className="btn" onClick={() => setModal(null)}>保留我的输入</UiButton><UiButton className="btn btn-primary" onClick={() => { hydrate(active); setModal(null); }}>放弃本次编辑并载入最新版本</UiButton></>}><Notice warning>当前输入与最新版本并排展示，请核对后基于最新版本重新提交；不能强制覆盖确认。</Notice><div className="response-diff-grid"><div><h4>我的输入 · V{baseline.current.version}</h4><p>{form.draft}</p><small>{form.conditions}</small></div><div><h4>最新版本 · V{active.version}</h4><p>{active.draft}</p><small>{active.conditions}</small></div></div></Modal>}
  </div>;
}

export default ResponsePage;
