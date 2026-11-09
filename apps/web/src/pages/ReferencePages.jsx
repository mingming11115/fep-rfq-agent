import GroupPicker,{useKnowledgeGroup} from '../components/KnowledgeGroupContext';
import ConditionTagInput from '../components/ConditionTagInput';
import AdminPageHeader from '../components/AdminPageHeader';
import {Card as AdminCard,Statistic as AdminStatistic} from 'antd';
import {readGenericCatalog,resolveGroupBinding} from '../genericCatalog';
import GenericCatalog from './GenericCatalog';
import { Pagination as AntPagination } from 'antd';
import { QueryFilter, ProFormText, ProFormSelect } from '@ant-design/pro-components';
import { Modal as ContentModal, Drawer as ContentDrawer, EmptyState as ContentEmpty } from '../components/ui';
import { UiTag, UiInput, UiTextArea, UiSelect, UiButton, BusinessTable } from '../components/AntContent';
import {resourceStorageKey,selectReadableResources} from '../resourceVisibility';
import {canAccessProject,canManageBu,getPersonnelContext} from '../personnelDomain';
import {saveModelMetadata,saveModelProcess,assertCapabilityProcess,prepareCapabilityImports,buildCapabilityImportTemplate} from '../modelProcessDomain';
import {MODELS,CAPABILITIES,PROCESSES} from '../modelProcessSeeds';
import {buildCapabilityTree,findCapabilityTreeNode,resolveCapabilityTreeSelection} from '../capabilityTree';
import CapabilityTree from '../components/CapabilityTree';
import KnowledgeEditor from '../components/KnowledgeEditor';
import {buildKnowledgeSourceOptions,prepareKnowledgeSource} from '../knowledgeSources';
import {conditionTags} from '../knowledgeConditions';
import {readRfqCatalog,saveRfqCatalogRecord,deleteRfqCatalogRecord} from '../rfqProcessBinding';
import {canPerform} from '../permissions';
import React, { useEffect, useState } from 'react';
import { BookOpen, Database, FileText, Upload, Download, Plus, Search, X, ShieldCheck, History, AlertCircle, CheckCircle2, ExternalLink, Layers, ArrowUpRight, Pencil, Trash2 } from "../components/icons";
import './reference-pages.css';

const today = () => new Date().toISOString().slice(0, 10);
const uid = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;
function useSaved(baseKey, initial, writable=true,context,kind='knowledge') {
  const databaseBacked=context?.state?.dataSource==='mysql';
  const key=resourceStorageKey(baseKey,context?.buId);
  const [raw,setRaw]=useState(()=>{if(databaseBacked)return [];try{return JSON.parse(localStorage.getItem(key))||(context?.buId==='BU-DEMO'?initial:[]);}catch{return context?.buId==='BU-DEMO'?initial:[];}});
  const value=selectReadableResources(raw,context,kind);
  const readLatest=()=>{if(databaseBacked)return [];try{return JSON.parse(localStorage.getItem(key))||(context?.buId==='BU-DEMO'?initial:[]);}catch{return raw;}};
  const setValue=updater=>{if(!writable)return;const latest=readLatest(),visible=selectReadableResources(latest,context,kind),ids=new Set(visible.map(r=>`${r.id}:${r.version}`)),next=typeof updater==='function'?updater(visible):updater;const merged=[...latest.filter(r=>!ids.has(`${r.id}:${r.version}`)),...next.map(r=>({...r,buId:r.buId||context.buId,...(r.scope==='仅当前项目'&&!r.projectId?{projectId:context.projectId}: {})}))];localStorage.setItem(key,JSON.stringify(merged));setRaw(merged);};
  useEffect(()=>{if(writable&&localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify(raw));const refresh=e=>{if(e?.key&&e.key!==key)return;setRaw(readLatest());};window.addEventListener('storage',refresh);window.addEventListener('rfq-history-change',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('rfq-history-change',refresh);};},[key,writable]);
  const reload=()=>setRaw(readLatest());
  return [value,setValue,reload];
}
function Tag({ children }) {
  const type = ['已发布', '有效', '已验收', '已接受', '量产'].includes(children) ? 'success' : ['已撤销', '已过期', '已停用', '退回', '被替代'].includes(children) ? 'danger' : ['待审核', '待核对', '候选', '部分接受'].includes(children) ? 'warning' : 'neutral';
  return <UiTag className={`badge ${type}`}>{children}</UiTag>;
}
function Dialog({title,children,footer,onClose,drawer=false,wide=false}) {
 const Surface=drawer?ContentDrawer:ContentModal;
 return <Surface title={title} onClose={onClose} footer={footer} width={wide?1080:drawer?760:640}>{children}</Surface>;
}
function Field({ label, children, required, full }) { return <label className={`field ${full ? 'ref-full' : ''}`}><span>{label}{required && <b className="ref-required"> *</b>}</span>{children}</label>; }
function Input({ value, onChange, ...props }) { return <UiInput className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} {...props}/>; }
function Area({ value, onChange, ...props }) { return <UiTextArea className="input ref-textarea" value={value || ''} onChange={(e) => onChange(e.target.value)} {...props}/>; }
function Select({ value, onChange, options, label }) { return <UiSelect aria-label={label} className="select" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((item) => <option key={typeof item === 'string' ? item : item.value} value={typeof item === 'string' ? item : item.value}>{typeof item === 'string' ? item : item.label}</option>)}</UiSelect>; }
function Notice({ children, warning = false }) { return <div className={`ref-notice ${warning ? 'ref-notice-warning' : ''}`}><AlertCircle size={16}/><div>{children}</div></div>; }
function Empty({children='没有符合筛选条件的记录'}) {return <ContentEmpty title={children} description="尝试调整关键词或筛选条件。"/>;}
function Paginator({total,page,setPage,pageSize,setPageSize}) {
 return <div className="rfq-reference-pagination"><AntPagination total={total} current={Math.min(page,Math.max(1,Math.ceil(total/pageSize)))} pageSize={pageSize}
 showSizeChanger pageSizeOptions={[5,10,20]} showTotal={count=>`共 ${count} 条记录`}
 onChange={(next,size)=>{setPageSize(size);setPage(size===pageSize?next:1);}} /></div>;
}
function KeyValues({ entries }) { return <dl className="ref-kv">{entries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value || '—'}</dd></div>)}</dl>; }
function ConditionTags({value}) {
  const tags=conditionTags(value);
  return tags.length?<div className="knowledge-condition-list">{tags.map(tag=><UiTag key={tag}>{tag}</UiTag>)}</div>:'—';
}
function csvDownload(name, rows) { const a = document.createElement('a'); const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n')], {type:'text/csv;charset=utf-8;'})); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500); }
function Heading({ eyebrow, title, description, actions }) { return <AdminPageHeader title={<>{title}</>} description={description && <>{description}</>} actions={<><div className="page-actions">{actions}</div></>} />; }
function ReviewDialog({ item, action, onClose, onConfirm, impact = 0 }) {
  const [reason, setReason] = useState(''); const [error, setError] = useState('');
  const needReason = ['退回', '撤销', '停用', '替代'].includes(action);
  return <Dialog title={`${action}${item.id ? ` · ${item.id}` : ''}`} onClose={onClose} footer={<><UiButton className="btn" onClick={onClose}>取消</UiButton><UiButton className={`btn ${['撤销', '停用', '退回'].includes(action) ? 'btn-danger' : 'btn-primary'}`} onClick={() => { if (needReason && !reason.trim()) return setError('请填写操作原因。'); onConfirm(reason); }}>{action === '批准发布' ? '确认批准并发布' : `确认${action}`}</UiButton></>}><KeyValues entries={[["对象版本", `${item.title || item.name || item.metric} · v${item.version || 1}`], ['当前状态', item.status], ['适用范围', item.conditions || item.scope || item.config || 'FEP 授权项目']]}/><Notice warning={impact > 0}>{impact > 0 ? `本次变更影响 ${impact} 个可访问引用；将标记为待复核并保留原版本。` : '操作将保留版本和审核记录。只有已发布、有效且范围匹配的资料可作为应答依据。'}</Notice><Field label={needReason ? '操作原因' : '审核意见'} required={needReason}><Area value={reason} onChange={setReason} placeholder={needReason ? '说明原因及需要注意的影响…' : '填写适用范围、证据核对结果…'}/></Field>{error && <p className="ref-error" role="alert">{error}</p>}</Dialog>;
}

function ImportWizard({ kind, onClose, onFinish, toast, capabilityScope }) {
  const historical = kind === 'history'; const knowledge = kind === 'knowledge';
  const [step, setStep] = useState(0); const [file, setFile] = useState(null); const [fixed, setFixed] = useState(false); const [range, setRange] = useState('已定稿且本人有权访问的历史 RFQ'); const [doneCount, setDoneCount] = useState(0);
  const rows = knowledge ? [{id:'DEMO-K-101', title:'设备支持 300 mm 晶圆', answer:'Comply，适用标准上料模块 S。', conditions:'Hesper E360R R2；标准模块 S；硅晶圆', evidence:'T-01 v2，第 8 页', source:'历史 RFQ-018 · 条款 3.2'}, {id:'DEMO-K-102', title:'厚度 0.5–1.0 mm 加工能力', answer:'Comply，需采用Si 工艺。', conditions:fixed ? 'Hesper E360R R2；硅材料；Si 工艺' : '', evidence:fixed ? 'T-01 v2，第 8 页' : '', source:'历史 RFQ-018 · 条款 2.1'}] : [{id:historical?'DEMO-CAP-H1':'DEMO-CAP-X1', metric:historical?'定位精度':'加工厚度', value:historical?'≤5 μm':'0.5–1.0 mm', conditions:'硅材料；Si 工艺；测试方法 M1', evidence:'T-01 v2，第 8 页', config:'CFG-HESPER-E360R-R2 v1 + 模块 X', source:historical?'历史 RFQ':'Excel'}, {id:historical?'DEMO-CAP-H2':'DEMO-CAP-X2', metric:'产能', value:'120 片/小时', conditions:fixed?'硅晶圆；标准模块 S；Si 工艺':'', evidence:fixed?'T-01 v2，第 9 页':'', config:'CFG-HESPER-E360R-R2 v1', source:historical?'历史 RFQ':'Excel'}];
  const exampleConditions=capabilityScope?`${capabilityScope.process.conditions||'适用条件待核对'}；工艺 ${capabilityScope.process.code}`:'';
  const previewRows=knowledge?rows:rows.map(row=>({...row,config:capabilityScope?.model.config||row.config,conditions:row.conditions&&exampleConditions?exampleConditions:row.conditions}));
  const title = knowledge ? '批量导入历史知识' : historical ? '历史 RFQ 自动抽取' : 'Excel 上传能力边界';
  return <Dialog title={title} onClose={onClose} wide footer={<><UiButton className="btn" onClick={onClose}>{step === 2 ? '完成' : '取消'}</UiButton>{step === 0 && <UiButton className="btn btn-primary" onClick={() => setStep(1)}>运行预检</UiButton>}{step === 1 && <UiButton className="btn btn-primary" onClick={() => { const valid = previewRows.filter((r) => r.conditions && r.evidence); onFinish(valid); setDoneCount(valid.length); setStep(2); }}>将 {fixed ? 2 : 1} 条有效记录保存为候选</UiButton>}</>}><div className="ref-steps">{['选择来源', '字段预检与候选', '保存结果'].map((s, i) => <span key={s} className={step >= i ? 'active' : ''}><b>{i + 1}</b>{s}</span>)}</div><Notice>模式：仅保存文件名或授权范围，不读取或解析真实文件内容。候选数值为数据，不代表实际设备能力。</Notice>{!knowledge&&capabilityScope&&<div className="ref-import-meta"><span>本次归属：{capabilityScope.buName} / {capabilityScope.model.name} {capabilityScope.model.revision} / {capabilityScope.process.code} · {capabilityScope.process.name}</span></div>}{step === 0 && <><Field label={historical ? '授权历史范围' : '选择 Excel / CSV 文件（可选）'}>{historical ? <Select value={range} onChange={setRange} options={['已定稿且本人有权访问的历史 RFQ', '历史 RFQ-018 · 已定稿', '历史 RFQ-012 · 已定稿']}/> : <div className="ref-upload"><Upload size={28}/><strong>{file?.name || '选择文件，或直接使用样例'}</strong><input type="file" accept=".xlsx,.xls,.csv" aria-label="选择导入文件" onChange={(e) => setFile(e.target.files[0] || null)}/><small>上传仅用于交互；实际内容不会解析或发送。</small></div>}</Field><UiButton className="btn" onClick={() => { csvDownload(knowledge ? '历史知识固定模板.csv' : '能力边界固定模板.csv', knowledge ? [['历史要求','最终答复','来源','审核信息','产品范围','访问范围','适用条件','证据'],['示例要求','示例答复','历史 RFQ-018','王工审核','Hesper E360R R2','FEP 授权项目','硅材料；Si 工艺','T-01 v2']] : buildCapabilityImportTemplate(capabilityScope)); toast?.('CSV 模板已下载，可用 Excel 打开'); }}><Download size={16}/>{knowledge?'下载固定模板（CSV）':'下载当前工艺模板（CSV）'}</UiButton></>}{step === 1 && <><div className="ref-import-meta"><span>来源：{historical ? range : file?.name || '内置样例'}</span><Tag>{fixed ? '预检通过' : '存在缺项'}</Tag></div><div className="table-wrap"><BusinessTable className="data-table"><thead><tr><th>行号</th><th>原文 / 候选内容</th><th>定位 / 来源</th><th>预检结果</th></tr></thead><tbody>{previewRows.map((row, i) => <tr key={row.id}><td>{i + 2}</td><td><strong>{row.title || `${row.metric} ${row.value}`}</strong><small>{row.conditions || '适用条件缺失'}</small></td><td>{row.source}<small>{row.evidence || '证据未关联'}</small></td><td>{row.conditions ? <Tag>可生成候选</Tag> : <><Tag>待补齐</Tag><small className="ref-error">缺少适用条件及有效证据</small></>}</td></tr>)}</tbody></BusinessTable></div>{!fixed && <UiButton className="btn" onClick={() => setFixed(true)}>填入修正值并重新预检</UiButton>}<p className="muted">成功项仅形成草稿。重复导入相同编号会跳过已成功记录；缺项行可修正重试。</p></>}{step === 2 && <div className="ref-success-state"><CheckCircle2 size={48}/><h3>{doneCount} 条候选已处理</h3><p>已生成草稿，重复记录已自动跳过。核对范围和证据后，可在详情中提交审核。</p><Tag>尚未发布，不可直接引用</Tag></div>}</Dialog>;
}

export const KNOWLEDGE = [
  {id:'K-021', title:'加工厚度要求', type:'history', requirement:'设备需支持加工 1.2 mm 硅晶圆。', answer:'Conditional Comply：需使用增强夹持模块，并在约定材料、工艺条件下完成样品验证。', conditions:'Hesper E360R R2 / 配置 C；硅材料；Si 工艺；需样品验证', evidence:'T-01 v2，第 8 页指标表', scope:'FEP 授权项目', source:'RFQ-001 定稿条款 2.1', status:'草稿', version:1, submitterRole:'SR', author:'李明', history:[{date:'2026-10-19', text:'RFQ-001 定稿后生成知识候选 · 李明'}]},
  {id:'K-018', title:'可选配置与自动上料', type:'standard', requirement:'支持自动上料及 300 mm 晶圆。', answer:'Comply：配置标准上料模块 S，支持 300 mm 硅晶圆。', conditions:'Hesper E360R R2；标准模块 S；晶圆尺寸 300 mm', evidence:'T-01 v2，第 8 页指标表', scope:'FEP 授权项目', source:'历史 RFQ-018 / 条款 3.2', status:'待审核', version:2, submitterRole:'SR', author:'王工', history:[{date:'2026-10-18',text:'v2 由王工修订并提交审核'}]},
  {id:'K-007', title:'定位精度的历史处理经验', type:'history', requirement:'定位精度 ≤5 μm。', answer:'Comply：采用模块 X，在硅材料、厚度 0.5–1.0 mm 及测试方法 M1 下保证定位精度 ≤5 μm。', conditions:'Hesper E360R R2；模块 X；硅材料；Si 工艺；方法 M1', evidence:'T-01 v2，第 8 页指标表', scope:'FEP 授权项目', source:'历史 RFQ-012 / 已批准答复', status:'已发布', version:1, submitterRole:'SR', author:'陈工', history:[{date:'2026-10-10',text:'王工批准发布 v1；有效证据已核对'}]},
  {id:'K-012', title:'产能条件说明', type:'standard', requirement:'产能达到 120 片/小时。', answer:'典型产能为 120 片/小时，实际产能受工艺节拍及上料方式影响，需依据样品条件评估。', conditions:'Hesper E360R R2；标准模块 S；单片工艺时间 ≤25 秒', evidence:'T-01 v2，第 9 页', scope:'FEP 授权项目', source:'标准应答库 / 专业确认', status:'已发布', version:3, submitterRole:'技术', author:'陈工', history:[{date:'2026-10-12',text:'v3 独立审批发布'}]},
];
export function KnowledgePage({ toast, actorRole = 'SR', navigate, logEvent,permissionContext,actorId,knowledgeType='standard' }) {
  const groupScope=useKnowledgeGroup();
  const canEdit=canPerform(actorRole,'knowledge:edit',permissionContext),canApprove=canPerform(actorRole,'resource:approve',permissionContext);
  let sourceEvidence;
  try { sourceEvidence = JSON.parse(localStorage.getItem(resourceStorageKey('rfq.reference.evidence.v1',permissionContext?.buId))) || EVIDENCE; } catch { sourceEvidence = EVIDENCE; }
  const sourceOptions = buildKnowledgeSourceOptions(permissionContext,sourceEvidence);
  const [items, setItems] = useSaved('rfq.reference.knowledge.v1', KNOWLEDGE,canEdit||canApprove,permissionContext,'knowledge');
  const tab=knowledgeType; const setTab=type=>navigate?.(type==='history'?'history':'knowledge'); const [query, setQuery] = useState(''); const [status, setStatus] = useState('全部状态'); const [scope, setScope] = useState('全部项目'); const [selected, setSelected] = useState('K-021:1'); const [drawer, setDrawer] = useState(null); const [form, setForm] = useState(null); const [error, setError] = useState(''); const [review, setReview] = useState(null); const [importing, setImporting] = useState(false);
  const [page,setPage] = useState(1); const [pageSize,setPageSize] = useState(10);
  useEffect(() => setPage(1), [query,status,tab,scope,groupScope?.groupId]);
  const tabItems=items.filter(r=>r.type===tab&&(!groupScope||groupScope.matches('reply',r)));
  const filtered = tabItems.filter((r) => (status === '全部状态' || r.status === status) && (scope === '全部项目' || r.source.includes('RFQ-001')) && `${r.id}${r.title}${r.requirement}${r.answer}`.toLowerCase().includes(query.toLowerCase()));
  const pageItems = filtered.slice((Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)))-1)*pageSize,Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)))*pageSize);
  const current = filtered.find((r) => `${r.id}:${r.version}` === selected) || filtered[0];
  const notify = (message) => { toast?.(message); logEvent?.(message); };
  const edit = (item) => { if(!canEdit)return; setError(''); setForm(item ? {...item,groupIds:groupScope?.groups('reply',item)||item.groupIds||[], newVersion:item.status === '已发布'} : {id:uid('K'),groupIds:groupScope?.defaultGroupIds||[], type:tab, title:'', requirement:'', answer:'', conditions:'', scope:'FEP 授权项目', source:'', sourceType:'', status:'草稿', version:1, author:'当前用户', history:[]}); };
  const save = () => { if(!canEdit)return; if (!form.title.trim() || !form.requirement.trim() || !form.answer.trim()) return setError(form.type === 'history' ? '请填写知识标题、历史要求和最终答复。' : '请填写回复标题、客户要求和标准回复。'); let sourcedForm; try { sourcedForm = prepareKnowledgeSource(form,sourceOptions);if(groupScope)sourcedForm.groupIds=groupScope.validate(form.groupIds||[],groupScope.groups('reply',items.find(r=>r.id===form.id&&r.version===form.version)||{})); } catch (error) { return setError(error.message); } const item = {...sourcedForm, status:'草稿', submitterRole:actorRole,submitterId:actorId, version:form.newVersion ? Math.max(...items.filter((r) => r.id === form.id).map((r) => r.version)) + 1 : form.version, history:[...(form.history || []), {date:today(),text:`${actorRole} 保存${form.newVersion ? '新版本' : ''}草稿`}]}; delete item.newVersion; setItems((all) => all.some((r) => r.id === item.id && r.version === item.version) ? all.map((r) => r.id === item.id && r.version === item.version ? item : r) : [...all, item]); setSelected(`${item.id}:${item.version}`); setForm(null); if(item.type!==tab)setTab(item.type); notify(`${item.type === 'history' ? '历史 RFQ 知识' : '标准回复'}草稿已保存；发布前需核对适用条件与来源`); };
  const requestAction = (item, action) => { if(!(action==='提交审核'?canEdit:canApprove))return toast?.('当前身份无此资料操作权限','error'); if (['提交审核','批准发布'].includes(action) && !item.conditions?.trim()) return toast?.('缺少适用条件，请先修订补齐', 'error'); if (['批准发布','撤销','退回'].includes(action) && actorRole !== 'BU管理员') return toast?.('当前角色无知识批准权，请切换为BU管理员', 'error'); if (action === '批准发布' && item.submitterId === actorId) return toast?.('同一版本不得自审，请由独立审批角色处理', 'error'); setReview({item,action}); };
  const actions = (item) => item && <><UiButton className="btn btn-sm" disabled={!canEdit} onClick={() => edit(item)}>{item.status === '已发布' ? '修订新版本' : '编辑草稿'}</UiButton>{['草稿','退回'].includes(item.status) && <UiButton className="btn btn-primary btn-sm" disabled={!canEdit} onClick={() => requestAction(item,'提交审核')}>提交审核</UiButton>}{item.status === '待审核' && <><UiButton className="btn btn-primary btn-sm" disabled={!canApprove} onClick={() => requestAction(item,'批准发布')}>批准发布</UiButton><UiButton className="btn btn-sm" disabled={!canApprove} onClick={() => requestAction(item,'退回')}>退回</UiButton></>}{item.status === '已发布' && <UiButton className="btn btn-danger btn-sm" disabled={!canApprove} onClick={() => requestAction(item,'撤销')}>撤销</UiButton>}</>;
  const detail = (item) => <><div className="ref-detail-title"><div><span className="ref-eyebrow">{item.id} / VERSION {item.version}</span><h3>{item.title}</h3></div><Tag>{item.status}</Tag></div><div className="ref-content-section"><span className="ref-label">历史要求</span><p>{item.requirement}</p></div><div className="ref-answer"><span className="ref-label">最终答复 / 已批准口径</span><p>{item.answer}</p></div><KeyValues entries={[["适用条件",<ConditionTags value={item.conditions}/>],['来源',item.source],['有效性',item.validity || (item.status === '已发布' ? '有效' : '待核对')],['维护 / 提交角色',`${item.author} / ${item.submitterRole}`]]}/><Notice>发布内容修订后生成新版本，需重新审核。</Notice><div className="ref-action-row">{actions(item)}<UiButton className="btn btn-sm" onClick={() => setDrawer(item)}>版本与审核记录</UiButton></div></>;
  return <div className="ref-page"><Heading eyebrow={tab==='history'?'RFQ HISTORY':'KNOWLEDGE'} title={tab==='history'?'历史 RFQ':'标准回复库'} description={tab==='history'?'沉淀历史 RFQ 的要求、答复与适用条件，复用可追溯的项目经验。':undefined} actions={<><UiButton className="btn" disabled={!canEdit} onClick={() => {if(canEdit)setImporting(true);}}><Upload size={16}/>批量导入</UiButton><UiButton className="btn btn-primary" disabled={!canEdit} onClick={() => edit(null)}><Plus size={16}/>{tab === 'history' ? '新增历史 RFQ 知识' : '新增标准回复'}</UiButton></>}/><Notice>{canEdit?'所有角色均可维护应答知识；发布由BU管理员独立审核。':actorRole==='BU管理员'?'当前身份负责审核；应答知识可由所有角色维护。':'当前知识库为只读；请核对账号状态及所属BU权限。'}</Notice><div className="admin-stat-grid">{[['已发布知识',tabItems.filter(r=>r.status==='已发布').length],['候选与草稿',tabItems.filter(r=>['草稿','退回'].includes(r.status)).length],['待知识审核',tabItems.filter(r=>r.status==='待审核').length],['知识总数',tabItems.length]].map(([title,value])=><AdminCard key={title} size="small"><AdminStatistic title={title} value={value}/></AdminCard>)}</div><section className="panel"><QueryFilter className="rfq-query-form" layout="vertical" defaultCollapsed={false}
 initialValues={{query:'',status:'全部状态',scope:'全部项目'}}
 onFinish={async values=>{setQuery(values.query||'');setStatus(values.status||'全部状态');setScope(values.scope||'全部项目');return true;}}
 onReset={()=>{setQuery('');setStatus('全部状态');setScope('全部项目');}}>
 <ProFormText name="query" label="关键词" placeholder="搜索编号、历史要求、答复…" fieldProps={{'aria-label':'搜索知识',allowClear:true}}/>
 <ProFormSelect name="status" label="知识状态" options={['全部状态','草稿','待审核','已发布','退回','已撤销'].map(value=>({value,label:value}))}/>
 <ProFormSelect name="scope" label="项目范围" options={['全部项目','当前项目 RFQ-001'].map(value=>({value,label:value}))}/>
 </QueryFilter><div className="ref-knowledge-layout"><div className="ref-knowledge-list ref-table-list"><div className="ref-list-heading">知识清单 <span>{filtered.length} 条</span></div><div className="table-wrap"><BusinessTable className="data-table"><thead><tr><th>编号 / 知识标题</th><th>状态</th><th>版本</th><th>操作</th></tr></thead><tbody>{pageItems.map((item) => <tr key={`${item.id}:${item.version}`} className={current?.id === item.id && current?.version === item.version ? 'ref-selected-row' : ''} onClick={() => setSelected(`${item.id}:${item.version}`)}><td><UiButton className="text-link" onClick={() => setSelected(`${item.id}:${item.version}`)}>{item.title}</UiButton><small>{item.id} · {item.source}</small></td><td><Tag>{item.status}</Tag></td><td>v{item.version}</td><td><UiButton className="text-link" onClick={() => {setSelected(`${item.id}:${item.version}`);setDrawer(item);}}>详情</UiButton></td></tr>)}</tbody></BusinessTable>{!filtered.length && <Empty/>}</div><Paginator total={filtered.length} page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}/></div><div className="ref-knowledge-detail">{filtered.length && current ? detail(current) : <Empty>选择一条知识查看详情</Empty>}</div></div></section>
  {form && <KnowledgeEditor form={form} isNew={!items.some(item => item.id === form.id)} error={error} sourceOptions={sourceOptions}
    onChange={next => { setForm(next); if (error) setError(''); }} onSave={save} onClose={() => setForm(null)}/>}
  {drawer && <Dialog drawer title={`${drawer.id} · 版本与审核记录`} onClose={() => setDrawer(null)}><KeyValues entries={[["当前版本",`v${drawer.version}`],['当前状态',drawer.status],['原始来源',drawer.source]]}/><h3 className="ref-section-title">版本链</h3>{items.filter((r) => r.id === drawer.id).sort((a,b) => b.version-a.version).map((r) => <div className="ref-version-row" key={r.version}><strong>v{r.version}</strong><Tag>{r.status}</Tag><UiButton className="text-link" onClick={() => {setTab(r.type);setSelected(`${r.id}:${r.version}`);setDrawer(null);}}>查看版本</UiButton></div>)}<h3 className="ref-section-title">审核与维护记录</h3><div className="ref-timeline">{(drawer.history || []).slice().reverse().map((h,i) => <div key={i}><span>{h.date}</span><p>{h.text}</p></div>)}</div></Dialog>}
  {review && <ReviewDialog {...review} onClose={() => setReview(null)} impact={review.action === '撤销' ? 2 : 0} onConfirm={(reason) => { if(!(review.action==='提交审核'?canEdit:canApprove))return;const next = {'提交审核':'待审核','批准发布':'已发布','退回':'退回','撤销':'已撤销'}[review.action]; const item = {...review.item,status:next,validity:next === '已发布' ? '有效' : next === '已撤销' ? '已撤销' : '待核对',submitterId:review.action === '提交审核'?actorId:review.item.submitterId,submitterRole:review.action === '提交审核' ? actorRole : review.item.submitterRole,history:[...(review.item.history || []),{date:today(),text:`${actorRole} ${review.action}${reason ? `：${reason}` : ''}`}]}; setItems((all) => all.map((r) => r.id === item.id && r.version === item.version ? item : r.id === item.id && r.status === '已发布' && next === '已发布' ? {...r,validity:'被替代'} : r)); setReview(null); notify(`${item.id} v${item.version} 已${review.action}`); }}/>}
  {importing && <ImportWizard kind="knowledge" toast={toast} onClose={() => setImporting(false)} onFinish={(rows) => {if(!canEdit)return;setItems((all) => [...all,...rows.filter((r) => !all.some((a) => a.id === r.id)).map((r) => ({...r,groupIds:groupScope?.defaultGroupIds||[],type:tab,requirement:r.title,scope:'FEP 授权项目',version:1,status:'草稿',author:actorRole,submitterRole:actorRole,submitterId:actorId,history:[{date:today(),text:'导入生成候选'}]}))]);setTab(tab);notify('导入已处理，重复候选自动跳过'); }}/>}
  </div>;
}

const EVIDENCE = [
  {id:'T-01',name:'Hesper E360R 能力测试报告.pdf',version:2,group:'共享能力资料',purpose:'能力依据',model:'Hesper E360R R2',owner:'王工',source:'内网测试记录 TR-2026-018',sourceDate:'2026-09-12',expiry:'2027-09-11',scope:'FEP 授权项目',status:'有效',conditions:'CFG-HESPER-E360R-R2 v1 + 模块 X；硅材料；厚度 0.5–1.0 mm；Si 工艺 / 测试方法 M1。',location:'报告第 8 页 · 指标表',external:false,checkedBy:'王工 · 2026-09-15',fileType:'PDF',fileSize:'2.4 MB',seeded:true,refs:[{id:'REQ-021',title:'RFQ-001 · 加工厚度',type:'要求',page:'response'},{id:'K-018',title:'标准知识 · 自动上料',type:'知识',page:'knowledge'},{id:'CAP-002',title:'Hesper E360R R2 · 定位精度',type:'能力',page:'capabilities'}],history:[{date:'2026-09-15',text:'王工核对来源、适用条件及有效期，标记为有效'}, {date:'2026-09-12',text:'更新 v2；保留 v1 追溯'}]},
  {id:'DOC-009',name:'Hesper E360R 标准配置清单.xlsx',version:1,group:'项目资料',purpose:'补充附件',model:'Hesper E360R R2',owner:'李明',source:'供应商技术资料',sourceDate:'2026-10-18',expiry:'2027-10-17',scope:'仅当前项目',status:'待核对',conditions:'标准模块 S；选配 X 尚待确认。',location:'配置表 · B4:F18',external:false,checkedBy:'尚未完成专业核对',fileType:'XLSX',fileSize:'184 KB',seeded:true,refs:[],history:[{date:'2026-10-18',text:'李明录入资料元数据，等待专业核对'}]},
  {id:'DOC-004',name:'Hesper E360R 历史能力报告.pdf',version:1,group:'共享能力资料',purpose:'能力依据',model:'Hesper E360R R1',owner:'陈工',source:'旧版测试记录',sourceDate:'2024-05-10',expiry:'2025-05-09',scope:'授权专业人员',status:'已撤销',conditions:'仅适用旧版 R1，不能用于 R2 承诺。',location:'报告第 5 页',external:false,checkedBy:'陈工 · 2024-05-12',fileType:'PDF',fileSize:'1.8 MB',seeded:true,refs:[{id:'K-004',title:'历史知识 v1 · 已标记待复核',type:'知识',page:'knowledge'}],history:[{date:'2026-03-02',text:'陈工撤销：旧版测试方法停用；相关引用已标记待复核'}]},
  {id:'DOC-015',name:'客户 RFQ 原始要求.xlsx',version:1,group:'项目资料',purpose:'要求来源',model:'Hesper E360R R2',owner:'李明',source:'客户提供 RFQ v1',sourceDate:'2026-10-16',expiry:'2027-10-15',scope:'仅当前项目',status:'有效',conditions:'RFQ-001 当前项目要求来源；不作为能力证明。',location:'Technical Requirements · A1:H46',external:false,checkedBy:'李明 · 2026-10-17',fileType:'XLSX',fileSize:'426 KB',seeded:true,refs:[{id:'REQ-001',title:'RFQ-001 · 原始要求清单',type:'要求',page:'documents'}],history:[{date:'2026-10-17',text:'确认客户要求来源与当前文件版本一致'}]},
];

export function CapabilitiesPage({toast,project,actorRole='SR',navigate,route,logEvent,permissionContext,actorId,appState,onSelectBu}) {
  const groupScope=useKnowledgeGroup();
  const buId=permissionContext?.buId;
  const canConfigure=canPerform(actorRole,'model:configure',permissionContext);
  const canCreate=canPerform(actorRole,'catalog:create',permissionContext);
  const canEdit=canConfigure||canPerform(actorRole,'resource:edit',permissionContext);
  const canApprove=canPerform(actorRole,'resource:approve',{...permissionContext,resourceKind:'capability'});
  const loadCatalog=()=>{try{return readRfqCatalog(localStorage,permissionContext);}catch(e){return {models:[],processes:[],error:e.message};}};
  const [catalog,setCatalog]=useState(loadCatalog);
  const {models,processes}=catalog;
  useEffect(()=>{
    const refresh=()=>setCatalog(loadCatalog());
    const changed=e=>{if(!e.key||['rfq.reference.models.v1','rfq.reference.processes.v1'].some(base=>e.key===resourceStorageKey(base,buId)))refresh();};
    refresh();window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
  },[buId,actorId,permissionContext?.state]);
  const [items,setItems,reloadItems]=useSaved('rfq.reference.capabilities.v1',CAPABILITIES,canEdit||canApprove,permissionContext,'capability');
  const [selection,setSelection]=useState(()=>route?.modelId?`model:${route.modelId}`:''),[modelVersion,setModelVersion]=useState('');
  const [series,setSeries]=useState('全部产品系列'),[lifecycle,setLifecycle]=useState('全部生命周期');
  const [query,setQuery]=useState(''),[source,setSource]=useState('全部来源'),[status,setStatus]=useState('全部状态');
  const [drawer,setDrawer]=useState(null),[drawerSection,setDrawerSection]=useState('detail');
  const [form,setForm]=useState(null),[formType,setFormType]=useState('capability'),[error,setError]=useState('');
  const [processForm,setProcessForm]=useState(null),[review,setReview]=useState(null),[importType,setImportType]=useState(null);
  const [deleteTarget,setDeleteTarget]=useState(null),[deleteError,setDeleteError]=useState('');
  const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
  const businessUnits=(appState?.businessUnits||[]).filter(b=>canManageBu(appState,actorId,b.id)||getPersonnelContext(appState,actorId,b.id).enabled);
  const buName=businessUnits.find(b=>b.id===buId)?.name||buId;
  const latestModels=[...new Set(models.map(m=>m.id))].map(id=>models.filter(m=>m.id===id).sort((a,b)=>b.version-a.version)[0]);
  const tree=buildCapabilityTree({buId,buName,models,processes,capabilities:items,filters:{query,series,lifecycle,source,status}});
  const missingLinkedModel=route?.modelId&&!models.some(m=>m.id===route.modelId);
  const activeNode=missingLinkedModel&&selection===`model:${route.modelId}`?tree:resolveCapabilityTreeSelection(tree,selection);
  const actualModelId=activeNode.modelId;
  const versions=models.filter(m=>m.id===actualModelId).sort((a,b)=>b.version-a.version);
  const model=(activeNode.kind==='model'&&versions.find(m=>String(m.version)===modelVersion))||versions[0];
  const processId=activeNode.processId||'all';
  const modelProcesses=processes.filter(p=>p.modelId===actualModelId);
  const activeProcess=modelProcesses.find(p=>p.id===processId);
  const linkedProjects=activeProcess?(appState?.projects||[]).filter(p=>p.buId===buId&&p.modelId===actualModelId&&p.processId===activeProcess.id):[];
  const processName=item=>{const p=processes.find(p=>p.id===item.processId&&p.modelId===item.modelId);return p?`${p.code} · ${p.name}${p.enabled===false?'（已停用）':''}`:'待关联工艺';};
  const filtered=['process','unassigned'].includes(activeNode.kind)?activeNode.children.map(node=>node.record):[];
  const pageItems=filtered.slice((Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)))-1)*pageSize,Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)))*pageSize);
  const current=activeNode.kind==='capability'?activeNode.record:null;
  useEffect(()=>setPage(1),[query,status,source,actualModelId,modelVersion,processId]);
  let evidence;
  try{evidence=JSON.parse(localStorage.getItem(resourceStorageKey('rfq.reference.evidence.v1',buId)))||(buId==='BU-DEMO'?EVIDENCE:[]);}catch{evidence=[];}
  evidence=selectReadableResources(evidence,permissionContext,'evidence');
  const evidenceIsValid=value=>evidence.some(r=>value?.startsWith(`${r.id} v${r.version}`)&&r.status==='有效'&&r.expiry>=today()&&r.purpose==='能力依据');
  const notify=(action,object,detail='')=>{toast?.(`${object} ${action}`);logEvent?.(action,object,`${buName} · ${detail}`);};
  const clearFilters=()=>{setQuery('');setSeries('全部产品系列');setLifecycle('全部生命周期');setSource('全部来源');setStatus('全部状态');};
  useEffect(()=>{setSelection(route?.modelId?`model:${route.modelId}`:'');setModelVersion('');clearFilters();},[route?.modelId]);
  const chooseModel=id=>{setSelection(`model:${id}`);setModelVersion('');};
  const chooseNode=node=>{setSelection(node.key);setModelVersion('');setPage(1);};
  const selectKey=key=>{const node=findCapabilityTreeNode(tree,key);if(node)chooseNode(node);};
  const openForm=(item,type='capability')=>{
    if(!(type==='model'?(item?canConfigure:canCreate):canEdit)||type==='capability'&&!item?.modelId&&!item?.groupId&&!groupScope&&!model)return;
    setDrawer(null);
    setFormType(type);setError('');
    if(type==='model')setForm(item?{...item}: {id:uid('MOD'),buId,code:'',name:'',series:'精密加工系列',revision:'R1',version:1,lifecycle:'研发',standard:'',options:'',config:'',source:'BU配置',scope:'FEP 授权项目',history:[]});
    else setForm(item?{...item,processId:item.processId||'',newVersion:item.status==='已发布'}:{id:uid('CAP'),buId,modelId:model.id,processId:activeProcess?.enabled!==false?activeProcess?.id||'':'',version:1,metric:'',value:'',valueType:'保证值',config:model.config||'',conditions:activeProcess?.conditions||'',limits:'',evidence:'',source:'手动补充',sourceLocation:'能力库 / 手动添加',approver:'BU管理员',status:'草稿',validity:'待核对',refs:[],history:[]});
  };
  const save=()=>{
    try{
      if(formType==='model'){
        if(!(models.some(m=>m.id===form.id)?canConfigure:canCreate))return;
        setCatalog(saveRfqCatalogRecord(localStorage,permissionContext,'model',form));
        chooseModel(form.id);clearFilters();notify('已保存配置',form.name,'机型配置保存生效，保留之前版本');
      }else{
        if(!canEdit)return;
        if(!form.metric.trim())throw new Error('请填写能力指标；其他缺项可保存后补齐。');
        if(groupScope){groupScope.validate(form.groupIds||[],groupScope.groups('capability',items.find(r=>r.id===form.id&&r.version===form.version)||{}));}else if(form.groupId)resolveGroupBinding(readGenericCatalog(localStorage,buId,catalog,items),form.groupId,buId);else assertCapabilityProcess(form,{models,processes,buId,requireEnabled:false});
        const version=form.newVersion?Math.max(...items.filter(r=>r.id===form.id).map(r=>r.version))+1:form.version;
        const item={...form,...(groupScope?{groupId:form.groupIds?.[0]||'',groupIds:form.groupIds||[]}:{}),buId,version,status:'草稿',validity:'待核对',submitterRole:actorRole,submitterId:actorId,history:[...(form.history||[]),{date:today(),text:`${actorRole} 保存能力候选草稿`}]};delete item.newVersion;
        setItems(all=>all.some(r=>r.id===item.id&&r.version===version)?all.map(r=>r.id===item.id&&r.version===version?item:r):[...all,item]);
        setSelection(`capability:${item.id}:${item.version}`);setModelVersion('');clearFilters();notify('已保存候选草稿',item.id);
      }

      setForm(null);setDrawer(null);
    }catch(e){setError(e.message);}
  };
  const openProcess=item=>{if(!(item?canConfigure:canCreate)||!item&&!model)return;setError('');setProcessForm(item?{...item}:{id:uid('PROC'),buId,modelId:model.id,code:'',name:'',conditions:'',enabled:true});};
  const saveProcess=()=>{
    try{if(!(processes.some(p=>p.id===processForm.id)?canConfigure:canCreate))return;setCatalog(saveRfqCatalogRecord(localStorage,permissionContext,'process',processForm));setSelection(`process:${processForm.id}`);setModelVersion('');clearFilters();notify('已保存工艺配置',processForm.name,processForm.enabled?'启用':'停用；历史能力关系保留');setProcessForm(null);}catch(e){setError(e.message);}
  };
  const directoryActions=node=>{
    if(!['model','process','capability'].includes(node.kind))return null;
    const editable=node.kind==='capability'?canEdit:canConfigure;
    if(!editable&&!canConfigure)return null;
    return <div className="cap-tree-actions">{editable&&<button className="cap-tree-action" title={`编辑${node.label}`} aria-label={`编辑${node.label}`} onClick={()=>{chooseNode(node);if(node.kind==='process')openProcess(node.record);else openForm(node.record,node.kind);}}><Pencil size={13}/></button>}{canConfigure&&<button className="cap-tree-action danger" title={`删除${node.label}`} aria-label={`删除${node.label}`} onClick={()=>{setDeleteTarget(node);setDeleteError('');}}><Trash2 size={13}/></button>}</div>;
  };
  const confirmDelete=()=>{
    try{
      if(!canConfigure)throw new Error('没有本BU的目录管理权限');
      setCatalog(deleteRfqCatalogRecord(localStorage,permissionContext,deleteTarget.kind,deleteTarget.record));
      reloadItems();
      setSelection(deleteTarget.kind==='model'?tree.key:deleteTarget.kind==='process'?`model:${deleteTarget.modelId}`:deleteTarget.processId==='unassigned'?`unassigned:${deleteTarget.modelId}`:`process:${deleteTarget.processId}`);
      setModelVersion('');setPage(1);setDeleteTarget(null);setDrawer(null);notify('已删除目录条目',deleteTarget.label);
    }catch(e){setDeleteError(e.message);}
  };
  const problems=item=>{
    const missing=[['实际能力值',item.value],['配置要求',item.config],['适用条件',<ConditionTags value={item.conditions}/>],['有效证据',evidenceIsValid(item.evidence)],['指定批准人',item.approver==='BU管理员']].filter(([,v])=>typeof v==='string'?!v.trim():!v).map(([k])=>k);
    try{if(groupScope){if(!item.groupIds?.length)throw new Error('请关联分组后提交审核');for(const id of item.groupIds)resolveGroupBinding(groupScope.catalog,id,buId);}else if(item.groupId)resolveGroupBinding(readGenericCatalog(localStorage,buId,catalog,items),item.groupId,buId);else assertCapabilityProcess(item,{models,processes,buId});}catch(e){missing.unshift(e.message);}
    return missing;
  };
  const requestAction=(item,action)=>{
    if(!(action==='提交审核'?canEdit:canApprove))return;
    if(['提交审核','批准发布'].includes(action)&&problems(item).length)return toast?.(`无法${action}：${problems(item).join('、')}`,'error');
    if(action==='批准发布'&&item.submitterId===actorId)return toast?.('同一版本不能自审，请由另一位有能力发布资格的BU管理员审核。','error');
    setReview({item:{...item,title:`${item.metric} ${item.value}`},action});
  };
  const confirmAction=reason=>{
    const {item:target,action}=review,item=items.find(r=>r.id===target.id&&r.version===target.version);
    if(!item||!(action==='提交审核'?canEdit:canApprove))return;
    if(['提交审核','批准发布'].includes(action)&&problems(item).length)return toast?.(`无法${action}：${problems(item).join('、')}`,'error');
    if(action==='批准发布'&&item.submitterId===actorId)return toast?.('同一版本不能自审','error');
    const status={'提交审核':'待审核','批准发布':'已发布','退回':'退回','撤销':'已撤销'}[action];
    const next={...item,status,validity:action==='批准发布'?'有效':action==='撤销'?'已撤销':item.validity,submitterId:action==='提交审核'?actorId:item.submitterId,refs:(item.refs||[]).map(r=>({...r,needsReview:['批准发布','撤销'].includes(action)})),history:[...(item.history||[]),{date:today(),text:`${actorRole} ${action}${reason?`：${reason}`:''}`}]};
    setItems(all=>all.map(r=>r.id===item.id&&r.version===item.version?next:r.id===item.id&&r.status==='已发布'&&action==='批准发布'?{...r,validity:'被替代'}:r));

    setReview(null);setDrawer(null);notify(`已${action}`,`${item.id} v${item.version}`,reason);
  };
  const actionButtons=item=><><UiButton className="btn btn-sm" disabled={!canEdit} onClick={()=>openForm(item)}>{item.status==='已发布'?'修订新版本':'编辑草稿'}</UiButton>{['草稿','退回'].includes(item.status)&&<UiButton className="btn btn-primary btn-sm" disabled={!canEdit} onClick={()=>requestAction(item,'提交审核')}>提交审核</UiButton>}{item.status==='待审核'&&<><UiButton className="btn btn-primary btn-sm" disabled={!canApprove} onClick={()=>requestAction(item,'批准发布')}>批准发布</UiButton><UiButton className="btn btn-sm" disabled={!canApprove} onClick={()=>requestAction(item,'退回')}>退回</UiButton></>}{item.status==='已发布'&&item.validity!=='被替代'&&<UiButton className="btn btn-danger btn-sm" disabled={!canApprove} onClick={()=>requestAction(item,'撤销')}>撤销</UiButton>}</>;
  const openDetail=(item,section='detail',type='capability')=>{setDrawer({item,type});setDrawerSection(section);};
  const capDetail=item=>{
    const linkedEvidence=evidence.find(record=>item.evidence?.startsWith(`${record.id} v${record.version}`));
    return <>
      <div className="ref-detail-title"><div><span className="ref-eyebrow">{item.id} · 能力资料 v{item.version}</span><h3>{item.metric}</h3></div><div className="ref-tag-group"><Tag>{item.status}</Tag><Tag>{item.validity}</Tag></div></div>
      <div className="capability-value">{item.value||'待补充'}<span>{item.valueType}</span></div>
      <KeyValues entries={[["所属工艺",processName(item)],['机型 / 配置',`${latestModels.find(m=>m.id===item.modelId)?.name||item.modelId} · ${item.config}`],['适用条件',item.conditions],['能力限制',item.limits],['来源',`${item.source} · ${item.sourceLocation}`]]}/>
      <details className="cap-evidence"><summary>证据依据 · {item.evidence||'待关联有效证据'}</summary>{linkedEvidence?<KeyValues entries={[["文件",linkedEvidence.name],['版本与状态',`v${linkedEvidence.version} · ${linkedEvidence.status}`],['有效期',linkedEvidence.expiry],['定位',linkedEvidence.location],['适用条件',linkedEvidence.conditions]]}/>:<p>请先关联并核对可访问的有效能力证据。</p>}</details>
      {problems(item).length>0&&<Notice warning>发布前待补齐：{problems(item).join('、')}。</Notice>}
      <div className="ref-action-row">{actionButtons(item)}<UiButton className="btn btn-sm" onClick={()=>openDetail(item,'history')}>版本与审核记录</UiButton><UiButton className="btn btn-sm" onClick={()=>openDetail(item,'refs')}>RFQ引用（{item.refs?.length||0}）</UiButton></div>
    </>;
  };
  const modelContext=()=>model&&<div className="cap-model-context"><div><strong>{model.name} · {model.revision}</strong><Tag>{model.lifecycle}</Tag><UiButton className="text-link" onClick={()=>selectKey(`model:${model.id}`)}>查看机型配置 <ArrowUpRight size={13}/></UiButton></div><p>配置基线 {model.config} · {model.standard}</p></div>;
  const manualCapabilityButton=()=><UiButton className="btn btn-primary btn-sm" disabled={!canEdit||activeProcess?.enabled===false} onClick={()=>openForm(null)}><Plus size={14}/>手动添加</UiButton>;
  const capabilityList=()=><>
    <div className="cap-subheading"><h3>能力边界 · {filtered.length} 条资料版本</h3><div className="cap-context-actions">{activeNode.kind==='process'&&<><UiButton className="btn btn-sm" disabled={!canEdit||activeProcess?.enabled===false} onClick={()=>setImportType('excel')}><Upload size={14}/>Excel 上传</UiButton><UiButton className="btn btn-sm" disabled={!canEdit||activeProcess?.enabled===false} onClick={()=>setImportType('history')}><History size={14}/>历史 RFQ 自动抽取</UiButton></>}{manualCapabilityButton()}</div></div>
    {pageItems.length?<><div className="table-wrap"><BusinessTable className="data-table cap-node-table"><thead><tr><th>能力指标 / 版本</th><th>能力值</th><th>值类型</th><th>状态</th></tr></thead><tbody>{pageItems.map(item=><tr key={`${item.id}:${item.version}`}><td><UiButton className="text-link" onClick={()=>selectKey(`capability:${item.id}:${item.version}`)}>{item.metric}</UiButton><small>{item.id} · v{item.version}{item.validity==='被替代'?' · 历史版本':''}</small></td><td>{item.value||'待补充'}</td><td>{item.valueType}</td><td><Tag>{item.status}</Tag></td></tr>)}</tbody></BusinessTable></div><Paginator total={filtered.length} page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize}/></>:<Empty>当前工艺下暂无符合条件的能力</Empty>}
  </>;
  const genericContent=<GenericCatalog key={buId} context={permissionContext} legacyCatalog={catalog} capabilities={items} projects={appState?.projects||[]} initialGroupId={route?.groupId} buName={buName} businessUnits={businessUnits} onBuChange={id=>{if(route?.buId)navigate('capabilities',null,{buId:id,returnKey:route.returnKey});else onSelectBu(id);}} onBack={route?.returnKey==='projects'?()=>navigate('projects'):undefined} onCapability={(node,item)=>{openForm(item?{...item,groupIds:groupScope?.groups('capability',item)||item.groupIds||[node.id]}:{id:uid('CAP'),buId,groupIds:groupScope?.defaultGroupIds||[node.id],groupId:groupScope?groupScope.defaultGroupIds[0]||'':node.id,version:1,metric:'',value:'',valueType:'保证值',config:'',conditions:'',limits:'',evidence:'',source:'手动补充',sourceLocation:'能力库 / 手动添加',approver:'BU管理员',status:'草稿',validity:'待核对',refs:[],history:[]});}} onReview={(item,action)=>{requestAction(item,action);}} canEditCapability={canEdit} canApproveCapability={canApprove} onAssignCapabilities={groupScope?(nodeId,selectedKeys)=>{if(!canEdit)return;const selected=new Set(selectedKeys);setItems(all=>all.map(item=>{const before=groupScope.groups('capability',item),has=before.includes(nodeId),chosen=selected.has(`${item.id}:${item.version||1}`);if(has===chosen)return item;const groupIds=chosen?[...before,nodeId]:before.filter(id=>id!==nodeId);groupScope.validate(groupIds,before);return {...item,groupIds,groupId:groupIds[0]||''};}));}:undefined}/>;
  return <div className="ref-page">{genericContent}
    {form&&<Dialog title={formType==='model'?(models.some(m=>m.id===form.id)?`编辑机型 · ${buName}`:'新建机型'):`${form.newVersion?'修订新版本':'补充能力候选'} · ${form.id}`} onClose={()=>setForm(null)} wide footer={<><UiButton className="btn" onClick={()=>setForm(null)}>取消</UiButton><UiButton className="btn btn-primary" onClick={save}>{formType==='model'?'保存机型配置':'保存候选草稿'}</UiButton></>}>
      <div className="form-grid">{formType==='model'?<>
        <Field label="所属BU"><UiInput className="input" readOnly value={buName}/></Field><Field label="机型编码" required><Input value={form.code} onChange={v=>setForm({...form,code:v})}/></Field><Field label="机型名称" required><Input value={form.name} onChange={v=>setForm({...form,name:v})}/></Field><Field label="系列"><Input value={form.series} onChange={v=>setForm({...form,series:v})}/></Field><Field label="硬件版本" required><Input value={form.revision} readOnly={models.some(m=>m.id===form.id)} onChange={v=>setForm({...form,revision:v})}/></Field><Field label="生命周期"><Select value={form.lifecycle} onChange={v=>setForm({...form,lifecycle:v})} options={['研发','量产','停产']}/></Field><Field label="配置定义" required full><Input value={form.config} onChange={v=>setForm({...form,config:v})}/></Field><Field label="标配定义" full><Area value={form.standard} onChange={v=>setForm({...form,standard:v})}/></Field><Field label="选配及适用关系" full><Area value={form.options} onChange={v=>setForm({...form,options:v})}/></Field>
      </>:<>
        {groupScope?<GroupPicker value={form.groupIds||[]} onChange={groupIds=>setForm({...form,groupIds})}/>:form.groupId?<Field label="关联分组"><span>{readGenericCatalog(localStorage,buId,catalog,items).nodes.find(n=>n.id===form.groupId)?.name||form.groupId}</span></Field>:<><Field label="关联机型"><Select value={form.modelId} onChange={v=>setForm({...form,modelId:v,processId:'',config:latestModels.find(m=>m.id===v)?.config||''})} options={latestModels.map(m=>({value:m.id,label:`${m.name} ${m.revision}`}))}/></Field><Field label="关联工艺" required><Select label="关联工艺" value={form.processId} onChange={v=>setForm({...form,processId:v})} options={[{value:'',label:'待关联工艺（提交审核前必选）'},...processes.filter(p=>p.modelId===form.modelId&&(p.enabled!==false||p.id===form.processId)).map(p=>({value:p.id,label:`${p.code} · ${p.name}${p.enabled===false?'（已停用）':''}`}))]}/></Field></>}<Field label="配置要求"><Input value={form.config} onChange={v=>setForm({...form,config:v})}/></Field><Field label="能力指标" required><Input value={form.metric} onChange={v=>setForm({...form,metric:v})}/></Field><Field label="实际能力值 / 范围"><Input value={form.value} onChange={v=>setForm({...form,value:v})}/></Field><Field label="值类型"><Select value={form.valueType} onChange={v=>setForm({...form,valueType:v})} options={['保证值','典型值','范围值','描述值']}/></Field><Field label="适用条件" full><ConditionTagInput value={form.conditions} onChange={v=>setForm({...form,conditions:v})}/></Field><Field label="适用范围限制" full><Area value={form.limits} onChange={v=>setForm({...form,limits:v})}/></Field><Field label="关联证据"><Select value={form.evidence} onChange={v=>setForm({...form,evidence:v})} options={[{value:'',label:'请选择有效证据'},...evidence.filter(r=>evidenceIsValid(`${r.id} v${r.version}`)).map(r=>({value:`${r.id} v${r.version}，第 8 页`,label:`${r.id} v${r.version} · ${r.name}`})),...(form.evidence?[{value:form.evidence,label:form.evidence}]:[])]}/></Field><Field label="来源定位"><Input value={form.sourceLocation} onChange={v=>setForm({...form,sourceLocation:v})}/></Field><Field label="指定批准人"><Select value={form.approver} onChange={v=>setForm({...form,approver:v})} options={['BU管理员','待指定']}/></Field>
      </>}</div>{formType!=='model'&&<Notice>缺项可保存候选；提交审核与发布必须具有启用的关联目录、适用条件及有效证据。</Notice>}{error&&<p className="ref-error" role="alert">{error}</p>}
    </Dialog>}
    {processForm&&<Dialog title={`配置机型下属工艺 · ${latestModels.find(m=>m.id===processForm.modelId)?.name||''}`} onClose={()=>setProcessForm(null)} footer={<><UiButton className="btn" onClick={()=>setProcessForm(null)}>取消</UiButton><UiButton className="btn btn-primary" onClick={saveProcess}>保存工艺配置</UiButton></>}><div className="form-grid"><Field label="所属BU"><UiInput className="input" readOnly value={buName}/></Field><Field label="所属机型"><UiInput className="input" readOnly value={latestModels.filter(m=>m.id===processForm.modelId).map(m=>`${m.name} ${m.revision}`).join('')}/></Field><Field label="工艺编码" required><Input value={processForm.code} onChange={v=>setProcessForm({...processForm,code:v})}/></Field><Field label="工艺名称" required><Input value={processForm.name} onChange={v=>setProcessForm({...processForm,name:v})}/></Field><Field label="适用条件 / 工艺说明" full><ConditionTagInput value={processForm.conditions} onChange={v=>setProcessForm({...processForm,conditions:v})}/></Field><Field label="启用状态"><Select label="工艺启用状态" value={processForm.enabled?'enabled':'disabled'} onChange={v=>setProcessForm({...processForm,enabled:v==='enabled'})} options={[{value:'enabled',label:'启用'},{value:'disabled',label:'停用'}]}/></Field></div>{error&&<p className="ref-error" role="alert">{error}</p>}</Dialog>}
    {drawer&&<Dialog drawer title={`${drawer.item.id} v${drawer.item.version} · ${drawer.type==='model'?'机型配置记录':'能力详情'}`} onClose={()=>setDrawer(null)}><div className="ref-detail-switch">{[['detail','条件与证据'],['history','版本 / 审核记录'],['refs','引用与影响']].map(([key,label])=><button key={key} className={drawerSection===key?'active':''} onClick={()=>setDrawerSection(key)}>{label}</button>)}</div>
      {drawerSection==='detail'&&(drawer.type==='capability'?capDetail(drawer.item):<KeyValues entries={[["所属BU",buName],['机型',`${drawer.item.name} ${drawer.item.revision}`],['标配',drawer.item.standard],['选配',drawer.item.options],['配置',drawer.item.config],['来源',drawer.item.source]]}/>)}
      {drawerSection==='history'&&<><h3 className="ref-section-title">版本链</h3>{(drawer.type==='model'?models:items).filter(r=>r.id===drawer.item.id).sort((a,b)=>b.version-a.version).map(r=><div className="ref-version-row" key={r.version}><strong>v{r.version}</strong><Tag>{r.status}</Tag>{r.validity&&<Tag>{r.validity}</Tag>}<UiButton className="text-link" onClick={()=>setDrawer({...drawer,item:r})}>查看</UiButton></div>)}<h3 className="ref-section-title">维护记录</h3><div className="ref-timeline">{(drawer.item.history||[]).slice().reverse().map((h,i)=><div key={i}><span>{h.date}</span><p>{h.text}</p></div>)}</div></>}
      {drawerSection==='refs'&&(drawer.type==='model'?<p>本机型关联 {processes.filter(p=>p.modelId===drawer.item.id).length} 项工艺、{items.filter(r=>r.modelId===drawer.item.id).length} 条能力版本。</p>:drawer.item.refs?.length?drawer.item.refs.map(r=><button className="ref-reference-row" key={r.id} onClick={()=>navigate?.(r.id.startsWith('K')?'knowledge':'response')}><FileText size={17}/><div><strong>{r.id}</strong><small>{r.title}{r.needsReview?' · 待复核':''}</small></div><ArrowUpRight size={17}/></button>):<Empty>暂无可访问引用</Empty>)}
    </Dialog>}
    {deleteTarget&&<Dialog title="删除目录条目" onClose={()=>setDeleteTarget(null)} footer={<><UiButton className="btn" onClick={()=>setDeleteTarget(null)}>取消</UiButton><UiButton className="btn btn-danger" onClick={confirmDelete}>确认删除</UiButton></>}><p>确认删除“{deleteTarget.label}”{deleteTarget.kind==='capability'?` v${deleteTarget.record.version}`:''}？</p><Notice warning>{deleteTarget.kind==='model'?'将同时删除该机型的全部资料版本、下属工艺和能力条目。':deleteTarget.kind==='process'?'将同时删除该工艺下的全部能力资料版本。':'将删除所选能力资料版本。'}已有 RFQ 保存的机型及工艺信息保留。</Notice>{deleteError&&<p className="ref-error" role="alert">{deleteError}</p>}</Dialog>}
    {review&&<ReviewDialog {...review} impact={review.item.refs?.length||0} onClose={()=>setReview(null)} onConfirm={confirmAction}/>}
    {importType&&<ImportWizard kind={importType} capabilityScope={{buId,buName,model,process:activeProcess}} toast={toast} onClose={()=>setImportType(null)} onFinish={rows=>{
      if(!canEdit||!activeProcess||activeProcess.enabled===false)return;
      setItems(all=>[...all,...prepareCapabilityImports(all,rows,activeProcess.id).map(r=>({...r,buId,modelId:model.id,processId:activeProcess.id,version:1,valueType:r.metric==='产能'?'典型值':'保证值',config:model.config,status:'草稿',validity:'待核对',limits:'仅适用所列条件，其他工况需重新评审。',sourceLocation:importType==='history'?'历史 RFQ-018 / 条款 2.1':'能力边界.xlsx / 能力表',approver:'BU管理员',submitterRole:actorRole,submitterId:actorId,refs:[],history:[{date:today(),text:`${actorRole} 导入工艺 ${activeProcess.code} 能力候选`}]}))]);
      setSource('全部来源');setStatus('全部状态');notify('已处理导入',`${model.name} / ${activeProcess.name}`);
    }}/>}
  </div>;
}
