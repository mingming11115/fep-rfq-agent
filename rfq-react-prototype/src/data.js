import { BHEL_ID, BHEL_PROJECT, makeBhelRequirements, makeBhelDocument } from './bhelDemo.js';
import { makeDocumentDemo } from './documentMocks.js';
import {initializePersonnel,getProjectFinalReview,getRequiredFinalReviewers} from './personnelDomain.js';
import { snapshotFingerprint,getFinalReviewScope } from './snapshotDomain.js';
// BHEL customer requirements are sourced; other projects and all supplier claims / people are synthetic.
export const NAV_ITEMS = [
  { key: 'tasks', label: '任务中心', section: '全局' },
  { key: 'analysis', label: 'AI分析记录', section: '全局' },
  { key: 'dashboard', label: '个人工作台与待办', section: '全局' },
  { key: 'projects', label: '项目列表', section: '全局' },
  { key: 'capabilities', label: '机型能力边界', section: '全局' },
  { key: 'documents', label: 'RFQ解析', section: '项目' },
  { key: 'response', label: 'RFQ细则比对', section: '项目' },
  { key: 'export', label: '导出文档', section: '项目' },
  { key: 'versions', label: '项目版本、变更与快照记录', section: '项目' },
  { key: 'settings', label: '项目设置、成员与审批配置', section: '项目' },
  { key: 'knowledge', label: '知识与结果维护', section: '全局' },
  { key: 'audit', label: '审计记录', section: '管理' },
  { key: 'admin', label: '系统配置与运维', section: '管理' },
];
export const PRIMARY_NAV=[{key:'dashboard',label:'工作台'},{key:'projects',label:'我的 RFQ'},{key:'tasks',label:'任务中心'},{key:'analysis',label:'AI 分析记录'},{key:'admin',label:'管理后台'}];

const REQUIREMENT_TEMPLATES = [
  {
    clause: '2.1', title: '安全防护与联锁', category: '技术',
    original: '设备应配置防护门与安全联锁，防护门开启时停止危险运动。',
    conclusion: 'Comply', draft: '本演示配置包含防护门与联锁；最终功能按双方确认的验收方案验证。',
    status: '待确认', owner: '技术确认人', matchLevel: 'standard', score: 92,
    evidence: '模拟安全方案 V2，第 4 页', sourcePage: 3,
  },
  {
    clause: '2.2', title: '最大切缝宽度', category: '技术',
    original: '在指定材料和厚度下，最大切缝宽度应不大于 50 μm。',
    conclusion: '有条件 Comply', draft: '可按选配 X 及确认后的材料、厚度和测试方案开展验证；保证值待样品测试确认。',
    status: '评审中', owner: '技术确认人', matchLevel: 'history', score: 87,
    conditions: '', reason: '模拟历史案例依赖选配 X，本次配置与样品测试尚未确认。',
    evidence: '模拟历史 RFQ-2025-018，答复 V3 与选配条件', sourcePage: 4,
  },
  {
    clause: '2.3', title: '加工精度验证', category: '技术',
    original: '按客户提供的样品与图纸，提交重复加工精度验证报告。',
    conclusion: '有条件 Comply', draft: '按经双方签署的样品、图纸与测量方案提供验证报告。',
    status: '已确认', owner: '技术确认人', matchLevel: 'capability', score: 78,
    conditions: '限模拟机型 DEMO-CUT 300 V2.1；样品、测量方法与环境条件按附件 A。',
    evidence: '模拟能力边界 CB-003 V2，第 7 页', sourcePage: 4,
  },
  {
    clause: '2.4', title: '新材料工艺适用性', category: '技术',
    original: '设备需适用客户新开发复合材料，具体材料成分将在澄清后提供。',
    conclusion: '待确认', draft: '请提供材料成分、厚度及样品；收到后安排工艺评估并反馈适用范围。',
    status: '评审中', owner: '技术确认人', matchLevel: 'none', score: 0,
    reason: '当前模拟知识与能力资料均无可用依据，需要客户澄清与补充测试。', evidence: '', sourcePage: 5,
  },
  {
    clause: '3.1', title: '出厂验收文件', category: '服务',
    original: '出厂前提供检验记录、装箱清单及双方确认的 FAT 报告。',
    conclusion: 'Comply', draft: '出厂前提供检验记录、装箱清单及经双方确认的 FAT 报告。',
    status: '已确认', owner: '质量确认人', matchLevel: 'standard', score: 96,
    evidence: '模拟质量文件目录 V1，文件项 Q-01 至 Q-03', sourcePage: 6,
  },
  {
    clause: '3.2', title: '现场安装与培训', category: '服务',
    original: '供应商应提供现场安装指导和操作、维护培训。',
    conclusion: 'Comply', draft: '按双方确认的服务计划提供安装指导及操作、维护培训，具体日程在发运前确认。',
    status: '待确认', owner: '服务确认人', matchLevel: 'history', score: 89,
    evidence: '模拟历史服务方案 SV-012 V2，服务范围第 2 节', sourcePage: 6,
  },
  {
    clause: '4.1', title: '交货周期承诺', category: '商务',
    original: '合同生效后 8 周内完成交货。',
    conclusion: '不满足', draft: '当前演示排产基线为合同生效后 12 周交货，建议与客户澄清交期及分批交付方案。',
    status: '评审中', owner: '商务确认人', matchLevel: 'capability', score: 65,
    reason: '客户要求 8 周，模拟排产基线为 12 周，商务偏离待批准。',
    evidence: '模拟排产基线 SCH-2026-10 V1', sourcePage: 8,
  },
  {
    clause: '4.2', title: '付款里程碑', category: '商务',
    original: '付款安排按采购合同约定的预付款、发运款和验收款执行。',
    conclusion: '有条件 Comply', draft: '付款比例及各里程碑凭证以双方签署的采购合同为准。',
    status: '待确认', owner: '商务确认人', matchLevel: 'standard', score: 85,
    conditions: '合同付款附件经双方授权人员签署后生效。',
    evidence: '模拟商务条款模板 COM-002 V3', sourcePage: 8,
  },
  {
    clause: '5.1', title: '质保与故障响应', category: '服务',
    original: '供应商应明确质保期限、响应方式和服务范围。',
    conclusion: 'Comply', draft: '质保期限、故障响应方式和服务范围列入合同服务附件，经双方确认后执行。',
    status: '已确认', owner: '服务确认人', matchLevel: 'standard', score: 94,
    evidence: '模拟服务条款模板 SV-001 V2', sourcePage: 9,
  },
  {
    clause: '5.2', title: '备件清单与保管', category: '服务',
    original: '提供建议备件清单，标明零件编号、数量和保管条件。',
    conclusion: 'Comply', draft: '提供与最终配置一致的建议备件清单，列明编号、数量及保管条件。',
    status: '待确认', owner: '服务确认人', matchLevel: 'history', score: 83,
    evidence: '模拟备件清单 SP-300 V1', sourcePage: 9,
  },
  {
    clause: '6.1', title: '厂房土建与公用设施', category: '商务',
    original: '报价应包括厂房改造与公用设施施工。',
    conclusion: '不适用', draft: '本次模拟设备报价范围不含厂房土建及公用设施施工；设备接口条件另行提供。',
    status: '已确认', owner: '商务确认人', matchLevel: 'standard', score: 91,
    reason: '本次设备供货范围仅包括设备本体及合同明确的配套项目，厂房施工由采购方负责。',
    evidence: '模拟采购范围附件 SOW-01 V1', sourcePage: 10,
  },
  {
    clause: '6.2', title: '最终资料与语言', category: '服务',
    original: '提供中文操作手册、维护手册和经批准的最终图纸。',
    conclusion: 'Comply', draft: '按最终配置提供中文操作手册、维护手册及经批准的最终图纸。',
    status: '待确认', owner: '质量确认人', matchLevel: 'standard', score: 93,
    evidence: '模拟交付资料目录 DOC-300 V1', sourcePage: 10,
  },
];

export function makeRequirements(projectId) {
  if (projectId === BHEL_ID) return makeBhelRequirements();
  const projectNumber = Number(String(projectId).match(/\d+$/)?.[0] || 1);
  const offset = (projectNumber - 1) * 100;
  return REQUIREMENT_TEMPLATES.map((template, index) => ({
    id: `req-${offset + index + 21}`, clause: template.clause,
    title: template.title, category: template.category, original: template.original,
    conclusion: template.conclusion, draft: template.draft, status: template.status,
    owner: template.owner, source: '客户 RFQ（模拟）.pdf', sourcePage: template.sourcePage,
    matchLevel: template.matchLevel, score: template.score, conditions: template.conditions || '',
    reason: template.reason || '', evidence: template.evidence || '', version: 1,
    ...(template.status === '已确认' ? { confirmedAt: '2026-10-20T06:30:00.000Z' } : {}),
  }));
}

export function createDemoState() {
  const projects = [
    { id: 'RFQ-001', name: '新能源精密切割产线', customer: '华东新能源客户（模拟）', equipment: 'DEMO-CUT 300 · V2.1 · 选配 X 待确认', owner: '林晓', deadline: '2026-10-25' },
    { id: 'RFQ-DEMO-UPLOAD', name: '半导体薄膜沉积设备', customer: '华北半导体客户（模拟）', equipment: 'DEMO-CVD 200 · V1.0 · 标准配置', owner: '林晓', deadline: '2026-11-10' },
    { ...BHEL_PROJECT },
    { id: 'RFQ-002', name: '精密零件加工设备', customer: '苏州精密制造客户（模拟）', equipment: 'DEMO-CUT 200 · V1.4 · 标准配置', owner: '陈晨', deadline: '2026-10-29' },
    { id: 'RFQ-003', name: '实验室样品验证设备', customer: '华南材料研究客户（模拟）', equipment: 'DEMO-LAB 100 · V1.0 · 研究配置', owner: '周宁', deadline: '2026-11-03' },
  ];
  const requirementsByProject = Object.fromEntries(projects.map((project) => [project.id, makeRequirements(project.id)]));
  const reviewsByProject = Object.fromEntries(projects.map((project) => [project.id, []]));
  requirementsByProject['RFQ-DEMO-UPLOAD'] = [];
  requirementsByProject[BHEL_ID] = [];
  const documentsByProject = Object.fromEntries(projects.map(project => [project.id, []]));
  const reviewDemo = makeDocumentDemo('RFQ-001', requirementsByProject['RFQ-001']);
  requirementsByProject['RFQ-001'] = reviewDemo.parsed.filter(row => requirementsByProject['RFQ-001'].some(original => original.id === row.id));
  documentsByProject['RFQ-001'] = reviewDemo.files.filter(file => file.status !== '失败').map(file => ({ ...file, status: '完成' }));
  documentsByProject[BHEL_ID] = makeBhelDocument([]).files.map(file => ({ ...file, status: '排队中', parsedCount: 0 }));
  const snapshotsByProject = Object.fromEntries(projects.map(project => [project.id, []]));
  const exportScopesByProject = {};
  const template = { id: 'standard', title: '标准 RFQ 应答矩阵', version: 'V2.1', description: '逐条列出客户要求、结论与最终答复，适合技术应答。' };
  const mapping = Object.fromEntries(['clause', 'original', 'conclusion', 'draft', 'conditions', 'status'].map(key => [key, key]));
  for (const project of projects.filter(p => ['RFQ-002', 'RFQ-003'].includes(p.id))) {
    project.approvalConfig = { final: '最终审批人' };
    const file = { id: `${project.id}-DEMO-FILE-FINAL`, name: `${project.name}_客户要求.pdf`, purpose: '要求来源', version: 'V1.0', status: '完成', createdAt: '2026/10/23 09:00:00', size: 1482000, visibility: '项目成员可见', sample: true, parsedCount: 3 };
    documentsByProject[project.id] = [file];
    const rows = makeRequirements(project.id).filter((_, index) => [0, 4, 8].includes(index)).map(row => ({ ...row, source: file.name, sourceFileId: file.id, sourceVersion: file.version, sourceOriginal: row.original, status: '已确认', confirmedAt: '2026-10-23T06:00:00.000Z', confirmedBy: '技术确认人' }));
    requirementsByProject[project.id] = rows;
    const approvalScope = { rows, sourceVersions: [`${file.id}:${file.version}`], configuration: { equipment: project.equipment, approvalConfig: project.approvalConfig }, template, mapping, attachments: [] };
    exportScopesByProject[project.id] = structuredClone(approvalScope);
    const snapshot = { id: `SNAP-DEMO-${project.id}`, projectId: project.id, status: '已批准', createdAt: '2026-10-23T07:00:00.000Z', createdBy: '技术确认人', createdById: 'demo-technical', reviewedAt: '2026-10-24T02:00:00.000Z', reviewedBy: '最终审批人', reviewedById: 'demo-approver', reviewReason: '模拟审批：条款、适用条件和应答范围已核对。', rows: structuredClone(rows), approvalScope: structuredClone(approvalScope), approvalFingerprint: snapshotFingerprint(approvalScope), template: { ...template }, mapping: { ...mapping }, approvalConfig: { ...project.approvalConfig }, attachments: [], history: [{ action: '提交快照审批', actor: '技术确认人', time: '2026/10/23 15:00:00' }, { action: '批准定稿', actor: '最终审批人', time: '2026/10/24 10:00:00', reason: '示例审批记录' }] };
    if (project.id === 'RFQ-003') {
      snapshot.exportedAt = '2026-10-24T03:00:00.000Z';
      snapshot.exports = [{ id: `EXP-DEMO-${project.id}`, type: '正式应答', filename: `${project.name}_正式应答_${snapshot.id}.csv`, createdAt: '2026/10/24 11:00:00', actor: '销售负责人', status: '已生成', snapshotId: snapshot.id, template: template.title, rowCount: rows.length, sample: true }];
    }
    snapshotsByProject[project.id] = [snapshot];
  }
  reviewsByProject['RFQ-001'] = [
    { id: 'DEV-001', requirementId: 'req-22', title: '选配 X 与切缝宽度保证条件', type: '条件差异', source: '历史条件与本次配置不同', owner: '技术确认人', deadline: '2026-10-22', status: '处理中', description: '模拟历史案例依赖选配 X；当前选配状态及样品验证尚未确认。', plan: '确认选配清单，按客户材料安排样品验证并补充测试记录。', impact: '可能影响选配成本与样品确认日程。', reason: '', history: [{ time: '2026-10-20 14:20', actor: '销售负责人', action: '建立事项并分派技术确认人' }] },
    { id: 'DEV-002', requirementId: 'req-24', title: '复合材料信息与工艺依据缺失', type: '知识缺口', source: '知识库中没有可用依据', owner: '技术确认人', deadline: '2026-10-23', status: '待处理', description: '当前要求缺少材料成分与样品，三级检索完成后仍无可用依据。', plan: '', impact: '材料适用性尚不能形成对外承诺。', reason: '', history: [{ time: '2026-10-20 14:22', actor: '销售负责人', action: '登记缺口，等待客户澄清' }] },
    { id: 'DEV-003',submittedById:'demo-technical', requirementId: 'req-27', title: '交付周期商务偏离', type: '交期偏离', source: '客户 8 周要求与模拟 12 周排产差距', owner: '商务确认人', deadline: '2026-10-22', status: '待审批', description: '需向客户说明模拟交期偏离及可选分批交付方案。', plan: '提出 12 周交付方案，并同步澄清合同生效起算点。', impact: '客户交期及合同里程碑需要更新。', reason: '拟按 12 周模拟排产基线答复，等待独立专业批准。', history: [{ time: '2026-10-20 15:10', actor: '商务确认人', action: '提交方案，等待批准' }] },
  ];
  const state = {
    projects, requirementsByProject, reviewsByProject, documentsByProject,
    snapshotsByProject, exportScopesByProject, demoProjectStagesVersion: 1,
    actorRole: '销售负责人',
    members: [
      { id: 'member-1', name: '林晓', role: '销售负责人', scope: '授权项目', status: '生效', canConfirm: false, canExport: true },
      { id: 'member-2', name: '顾工', role: '技术确认人', scope: '技术条目', status: '生效', canConfirm: true, canExport: false },
      { id: 'member-3', name: '王工', role: '质量确认人', scope: '质量及资料', status: '生效', canConfirm: true, canExport: false },
      { id: 'member-4', name: '陈晨', role: '商务确认人', scope: '商务条目', status: '生效', canConfirm: true, canExport: false },
      { id: 'member-5', name: '周宁', role: '服务确认人', scope: '服务条目', status: '生效', canConfirm: true, canExport: false },
      { id: 'member-6', name: '赵明', role: '项目最终批准人', scope: '具体应答快照', status: '生效', canConfirm: false, canExport: false },
    ],
    audit: [
      { id: 'BHEL-EVT-001', time: '2026-10-22', actor: '销售负责人', action: '上传真实RFQ演示', object: BHEL_ID, result: '成功', detail: 'BHEL IKCCAP0034原始PDF已登记，等待模拟解析；历史采购于2018年截止。' },
      { id: 'EVT-0003', time: '2026-10-20 15:10', actor: '商务确认人', action: '提交评审方案', object: 'DEV-003 · RFQ-001', result: '成功', detail: '交期偏离方案提交审批，尚未批准关闭。' },
      { id: 'EVT-0002', time: '2026-10-20 14:22', actor: '销售负责人', action: '完成分级匹配', object: 'RFQ-001 · 工作版本 V1', result: '成功', detail: '12 条模拟要求已匹配；自动填入及候选答复均等待内部确认。' },
      { id: 'EVT-0001', time: '2026-10-20 13:40', actor: '销售负责人', action: '创建模拟项目', object: 'RFQ-001', result: '成功', detail: '已选择演示机型与配置基线，选配 X 尚待确认。' },
    ],
  };
  for(const project of state.projects){project.ownerId='demo-sales';project.createdById='demo-sales';project.participantIds=['demo-sales','demo-technical','demo-approver'];}
  initializePersonnel(state);
  // These are newly generated, explicitly synthetic examples, never imported history.
  for(const project of state.projects)for(const snap of state.snapshotsByProject[project.id]||[]){
    snap.sample=true;snap.finalReview=getProjectFinalReview(state,project.id);
    for(const r of getRequiredFinalReviewers(snap.finalReview)){
      const vote={actorId:r.actorId,result:'approved',reason:'新建演示案例的模拟评审结果',at:'2026-10-24T02:00:00.000Z'};
      if(r.side==='sr')snap.finalReview.decisions.sr=vote;else snap.finalReview.decisions.technicalByActorId[r.actorId]=vote;
    }
    snap.createdById='demo-sales';snap.createdBy='林晓';
    snap.rows=structuredClone(state.requirementsByProject[project.id]);
    snap.approvalScope={...snap.approvalScope,rows:structuredClone(snap.rows),configuration:{equipment:project.equipment,approvalConfig:structuredClone(project.approvalConfig),personnel:getFinalReviewScope(state,project.id)}};
    snap.approvalFingerprint=snapshotFingerprint(snap.approvalScope);state.exportScopesByProject[project.id]=structuredClone(snap.approvalScope);
  }
  return state;
}
