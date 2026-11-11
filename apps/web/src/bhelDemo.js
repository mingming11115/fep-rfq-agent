// Customer requirements transcribed from the public BHEL RFQ. Supplier answers and matches are fictional demo scenarios.
export const BHEL_ID = 'RFQ-BHEL-2018';
export const BHEL_SOURCE = { name: 'BHEL_IKCCAP0034_RFQ.pdf', url: 'https://www.bhel.com/sites/default/files/rfq-ikccap0034-laser-cutting_merged-1515663096.pdf', localUrl: '/BHEL_IKCCAP0034_RFQ.pdf', pages: 43, issuedAt: '2018-01-10', deadline: '2018-01-31' };
export const BHEL_PROJECT = { id: BHEL_ID, name: 'BHEL · 硅晶圆激光切割设备', customer: 'BHEL Electronics Division · Bangalore', equipment: 'DEMO-YAG 150 · 演示候选机型 · 配置待核实', owner: '林晓', deadline: '2018-01-31', sourceUrl: BHEL_SOURCE.url, historicalDemo: true, version: 1 };
const extracts = [
  [
    "RFQ",
    "1",
    1,
    "商务",
    "双信封投标",
    "技术商务标与价格标分开提交，商务条款随技术商务标提交。",
    "TENDER/OFFER MUST BE SUBMITTED IN TWO PARTS: (1).TECHNO- COMMERCIAL BID (2).PRICE BID SEPARATELY .COMMERCIAL TERMS SHOULD BE QUOTED ALONG WITH TECNO -COMMERCIAL BID."
  ],
  [
    "RFQ",
    "5",
    1,
    "商务",
    "投标保证金",
    "随技术商务标提交 INR 150,000 投标保证金；缺少有效保证金的报价将被拒绝。",
    "EARNEST MONEY DEPOSIT (EMD) OF RS. 1,50,000.00 (ONE LAKH FIFTY THOUSAND ONLY) IS MANDATORY"
  ],
  [
    "RFQ",
    "6",
    1,
    "商务",
    "设备交付周期",
    "自 BHEL 采购订单之日起 12 周内交付设备。",
    "DELIVERY REQUIRED FOR SUPPLY OF EQUIPMENT: 12 WEEKS FROM THE DATE OF BHEL PURCHASE ORDER."
  ],
  [
    "RFQ",
    "7",
    1,
    "服务",
    "安装调试周期",
    "设备抵达 BHEL 后 4 周内完成安装调试。",
    "DELIVERY REQUIRED FOR ERECTION AND COMMISSIONING (E&C): 4 WEEKS FROM THE DATE OF RECEIPT OF EQUIPMENT AT BHEL."
  ],
  [
    "RFQ",
    "8",
    1,
    "商务",
    "付款与履约保函",
    "到货后45天账期支付设备基本价80%及全部税费、运费；余款20%与安装调试款在取得E&C证书并提交PBG后支付。境外供应商须另核 CAPITAL-2017 条款。",
    "TERMS OF PAYMENT: 80% basic payment plus 100% taxes, duties and freight charges with 45 days credit"
  ],
  [
    "RFQ",
    "9",
    1,
    "商务",
    "报价有效期",
    "自报价截止日起，报价有效期为90天。",
    "QUOTATION SHOULD BE VALID FOR 90 DAYS FROM DUE DATE."
  ],
  [
    "RFQ",
    "10",
    1,
    "服务",
    "质保期限",
    "调试之日起12个月，或发运之日起18个月，以先到者为准。需与技术规格的调试后至少12个月要求核对。",
    "WARRANTY: 12 MONTHS COMPREHENSIVE FROM THE DATE OF COMMISSIONING OR 18 MONTHS FROM THE DATE OF DISPATCH WHICHEVER IS EARLIER."
  ],
  [
    "RFQ",
    "11",
    1,
    "商务",
    "禁止预付款",
    "要求预付款的报价可能被拒绝。",
    "ADVANCE PAYMENT: QUOTATION WITH #ADVANCE PAYMENT# SHALL BE LIABLE FOR REJECTION."
  ],
  [
    "RFQ",
    "14.A",
    1,
    "质量",
    "发运前检验通知",
    "在 OEM 现场进行发运前检查，供应商须提前3周通知BHEL。",
    "THE SUPPLIER SHALL INFORM BHEL 3 WEEKS IN ADVANCE FOR THE INSPECTION."
  ],
  [
    "RFQ",
    "16",
    1,
    "商务",
    "安装调试报价",
    "安装调试费须按设备价值的10%报价。",
    "ERECTION AND COMMISSIONING CHARGES SHOULD BE QUOTED AS 10% OF VALUE OF THE EQUIPMENT."
  ],
  [
    "RFQ",
    "17",
    1,
    "商务",
    "两年全面维保报价",
    "必须报出质保后两年全面AMC价格，计入最低报价评估；BHEL保留以后下单的权利。",
    "PRICE FOR COMPREHENSIVE AMC FOR TWO YEARS MUST BE QUOTED."
  ],
  [
    "RFQ",
    "19",
    1,
    "商务",
    "技术标无价格副本",
    "技术标须包含隐藏价格后的价格标副本。",
    "PLEASE SUBMIT UNPRICED BID (COPY OF PRICE BID AFTER HIDING PRICE) ALONG WITH TECHNICAL BID."
  ],
  [
    "A) Pre-Qualification Criteria (PQC)",
    "1",
    7,
    "技术",
    "全新设备",
    "仅接受全新设备，不接受翻新或二手设备。",
    "Offer shall be for new equipment and not for any refurbished or used equipment."
  ],
  [
    "A) Pre-Qualification Criteria (PQC)",
    "2",
    7,
    "商务",
    "OEM或授权供应商",
    "境外供应商须为原始设备制造商或其授权经销商／分销商。",
    "Only OEM (Original Equipment Manufacturer) or their authorized dealers /distributor (for foreign vendors) can quote and supply the equipment."
  ],
  [
    "A) Pre-Qualification Criteria (PQC)",
    "3",
    7,
    "服务",
    "印度现场服务支持",
    "须配备在印度提供现场服务的受训人员，并提供有效授权与OEM联系方式。",
    "The vendor shall have trained service personnel for providing onsite service support in India."
  ],
  [
    "A) Pre-Qualification Criteria (PQC)",
    "4",
    7,
    "技术",
    "硅晶圆设备交付业绩",
    "至少交付过2台切割厚度不小于1.2 mm硅晶圆的激光设备，其中至少1台交付至原产国之外；提交客户验收等证明。",
    "The supplier shall have supplied at least two (2) Laser cutting equipment"
  ],
  [
    "A) Pre-Qualification Criteria (PQC)",
    "6",
    7,
    "质量",
    "设备认证",
    "设备应具备CE／UL／CSA／GOST-R标准认证并随附证书。",
    "The offered product shall be certified for CE (Conformité Européene) / UL/CSA/GOST-R standard."
  ],
  [
    "B) SCOPE OF WORK",
    "2",
    8,
    "技术",
    "现场硅晶圆性能演示",
    "在BHEL现场以1.2 mm厚硅晶圆演示设备性能，所需夹具由BHEL提供；需核对Table-1第26项供应商提供真空夹具的范围。",
    "demonstration of the equipment performance to BHEL personnel for silicon wafer of 1.2 mm thick wafers"
  ],
  [
    "B) SCOPE OF WORK",
    "3",
    8,
    "服务",
    "操作维护培训",
    "在供应商工厂及BHEL现场培训BHEL人员操作与维护。",
    "Training of BHEL personnel on operation & maintenance of the equipment at vendor’s works and at our works to be carried out."
  ],
  [
    "B) SCOPE OF WORK",
    "4",
    8,
    "质量",
    "至少一周工艺试运行",
    "现场调试完成后，至少进行一周满意的工艺试运行再放行。",
    "After commissioning of the equipment at our works, equipment will be cleared after satisfactory process trials for a minimum period of one week."
  ],
  [
    "C) TECHNICAL SPECIFICATION",
    "1",
    8,
    "技术",
    "切割尺寸与厚度口径",
    "圆形切割直径19–56 mm；本条写1 mm厚演示，B.2与Table-1.7写1.2 mm，且母片直径125m疑似笔误，须客户澄清。",
    "Equipment performance shall be demonstrated for silicon wafer of 1 mm thick wafers"
  ],
  [
    "C) TECHNICAL SPECIFICATION",
    "7",
    8,
    "技术",
    "IP54防护",
    "设备应符合IP54标准。",
    "The equipment shall confirm to IP54 standard"
  ],
  [
    "C) TECHNICAL SPECIFICATION",
    "9",
    8,
    "技术",
    "工艺与安全报警",
    "须提供快门开启、冷却水高温等必要工艺与安全报警。",
    "All the necessary process and safety related alarms (e.g. shutter open, cooling water temp high, etc.)"
  ],
  [
    "Table-1",
    "1",
    9,
    "技术",
    "激光光源",
    "采用脉冲Nd:YAG激光器。",
    "Laser Source Pulsed Nd YAG Laser"
  ],
  [
    "Table-1",
    "2",
    9,
    "技术",
    "最小平均功率",
    "激光平均功率不低于150 W。",
    "Avg. power at Laser (minimum) 150 W"
  ],
  [
    "Table-1",
    "3",
    9,
    "技术",
    "最小脉冲能量",
    "脉冲能量不低于35 J。",
    "Pulse Energy (minimum) 35 J"
  ],
  [
    "Table-1",
    "4",
    9,
    "技术",
    "脉宽范围",
    "脉宽范围0.2–20 ms。",
    "Pulse Width Range 0.2- 20 ms"
  ],
  [
    "Table-1",
    "7",
    9,
    "技术",
    "硅晶圆厚度",
    "待切割晶圆厚度为1.2 mm。",
    "wafer thickness to be cut 1.2 mm"
  ],
  [
    "Table-1",
    "8",
    9,
    "技术",
    "最大切缝宽度",
    "切缝宽度最大50 μm。",
    "Kerf width 50 µm max."
  ],
  [
    "Table-1",
    "13",
    9,
    "技术",
    "激光头与CNC行程",
    "激光头／CNC行程150 mm。",
    "Laser Head/CNC traverse length 150mm"
  ],
  [
    "Table-1",
    "15",
    9,
    "技术",
    "快门开启时间",
    "快门开启时间小于50 ms。",
    "Shutter opening time < 50 ms"
  ],
  [
    "Table-1",
    "18",
    9,
    "技术",
    "电源接口",
    "供电为415 V、三相、50 Hz。",
    "Electrical requirements 415V /3ph/50 Hz"
  ],
  [
    "Table-1",
    "26",
    10,
    "技术",
    "CNC与真空夹具",
    "双轴，运动分辨率10 μm、重复性10 μm，手动Z轴；激光接口、排烟口与真空吸附晶圆切割夹具齐备。",
    "No. of axis: Two"
  ],
  [
    "Table-1",
    "27",
    10,
    "技术",
    "闭式冷却水系统",
    "提供带冷水机的闭式循环冷却水装置。",
    "Close loop chilled water circulation facility with chiller unit to be provided"
  ],
  [
    "Table-1",
    "28",
    10,
    "技术",
    "切割区域安全防护",
    "切割区域须有防护罩、安全观察窗／护目镜及联锁。",
    "Shroud: Enclosure shroud for laser cutting area with necessary safety viewport/goggles, interlocks etc. to be provided"
  ],
  [
    "Table-1",
    "32",
    11,
    "服务",
    "技术规格质保要求",
    "自调试之日起至少12个月全面质保；与RFQ第10条的先到者规则存在口径差异。",
    "The vendor shall furnish a comprehensive warranty for at least 12 months from the date of commissioning"
  ],
  [
    "E) GENERAL CONDITIONS",
    "1",
    11,
    "服务",
    "英文交付资料",
    "随设备提供3套英文操作维护手册的纸本和电子版，包含电路图、电气原理图、备件、故障排除和安全信息等。",
    "Three set of user operation and maintenance manual in English shall be supplied in hard copy and soft copy along with the equipment."
  ],
  [
    "E) GENERAL CONDITIONS",
    "4",
    12,
    "服务",
    "质保期季度预防维护",
    "在质保期内每季度开展预防维护。",
    "Vendor shall carryout out preventive maintenance quarterly basis during the warranty period."
  ],
  [
    "F) COMPREHENSIVE ANNUAL MAINTENANCE CONTRACT (AMC)",
    "4",
    12,
    "服务",
    "AMC服务范围",
    "除季度预防维护外，AMC须包含不限次数的故障上门服务。",
    "The AMC shall include unlimited breakdown call visits apart from the quarterly preventive maintenance visits."
  ],
  [
    "G) DOCUMENTS TO BE PROVIDED ALONG WITH TECHNICAL OFFER",
    "3",
    12,
    "商务",
    "逐条偏离声明",
    "逐条明确列出偏离；无偏离时须明确声明全部符合技术规格。",
    "A clause wise deviation, if any, has to be brought out clearly."
  ]
];
export function makeBhelRequirements() {
  return extracts.map(([section, clause, sourcePage, category, title, original, sourceOriginal], index) => ({
    id: `BHEL-REQ-${String(index + 1).padStart(3, '0')}`, clause, sectionPath: [section], title, category, original,
    sourceOriginal, source: BHEL_SOURCE.name, sourceFileId: 'BHEL-IKCCAP0034-SOURCE', sourceVersion: 'Rev.00 / 2018-01-10',
    sourcePage, sourceOrder: index, sourceUrl: `${BHEL_SOURCE.localUrl}#page=${sourcePage}`, realSource: true,
    parserNote: '人工核对的真实PDF摘录；中文为演示译文；仅覆盖选取条款，非全文自动解析。',
    conclusion: '待确认', draft: `【演示草稿】${original} 供应商须补齐配置、证据或商务审批后确认。`,
    status: '待确认', owner: `${category === '技术' ? '技术' : category === '质量' ? '质量' : category === '商务' ? '商务' : '服务'}确认人`,
    matchLevel: 'none', score: 0, evidence: '', conditions: '', remark: '', version: 1,
    ...(section === 'Table-1' && clause === '8' ? { conclusion: '有条件 Comply', matchLevel: 'history', score: 87, conditions: '演示设定：须以1.2 mm硅晶圆完成≤50 μm切缝验证，测试通过后方可承诺。', evidence: '模拟历史试切记录 DEMO-YAG-050；非真实能力证据', draft: '【演示草稿】可安排1.2 mm硅晶圆试切；≤50 μm保证值待样品验证及技术批准。' } : {}),
    ...(section === 'RFQ' && clause === '6' ? { conclusion: '不满足', matchLevel: 'capability', score: 72, remark: '演示排产为16周，超过真实客户要求12周；起算点均为BHEL采购订单日期。', evidence: '模拟排产基线 DEMO-SCH-016；非真实交付承诺', draft: '【演示草稿】当前模拟交期为采购订单后16周，较要求偏离4周；请确认是否可接受。' } : {}),
    ...(section === 'RFQ' && clause === '1' ? { conclusion: 'Comply', matchLevel: 'standard', score: 94, evidence: '模拟投标检查表 DEMO-BID-01；仅展示标准答复流程', draft: '【演示草稿】技术商务标与价格标分开编制；无价格副本随技术标提交。' } : {}),
  }));
}
export function makeBhelDocument(requirements = makeBhelRequirements()) {
  const parsed = requirements.filter(row => row.realSource).map(row => ({ ...row }));
  return { files: [{ id: 'BHEL-IKCCAP0034-SOURCE', name: BHEL_SOURCE.name, purpose: '要求来源', version: 'Rev.00 / 2018-01-10', status: '完成', createdAt: '2026/10/22', size: 1341301, visibility: '项目成员可见', sample: false, realSource: true, originalUrl: BHEL_SOURCE.url, localUrl: BHEL_SOURCE.localUrl, parsedCount: parsed.length }], parsed };
}
export function makeBhelReviews() {
  const review = (id, requirementId, title, type, owner, description, plan, impact) => ({ id, requirementId, title, type, owner, source: '真实RFQ要求 / 演示评审', deadline: '2026-10-25', status: '待处理', description, plan, impact, reason: '', history: [{ time: '2026-10-22', actor: '销售负责人', action: '演示建档，尚未联系客户' }] });
  return [
    review('BHEL-DEV-01', 'BHEL-REQ-029', '50 μm切缝 · 样品与能力证据待补齐', '条件差异', '技术确认人', '客户要求来自PDF第9页Table-1第8项；供应商能力与试切状态均为模拟设定。', '按1.2 mm硅晶圆建立试切方案，补充测量方法及测试报告。', '验证通过前不能承诺切缝保证值。'),
    review('BHEL-DEV-02', 'BHEL-REQ-003', '交付12周要求与16周模拟排产差异', '交期偏离', '商务确认人', '客户12周要求来自PDF第1页第6条；16周为演示排产。', '评估加急排产或提出16周交付偏离方案。', '模拟偏离4周，待内部审批。'),
    review('BHEL-DEV-03', 'BHEL-REQ-021', '原文1 mm与1.2 mm演示厚度不一致', '客户澄清', '技术确认人', 'PDF第8页C.1写1 mm；同页B.2及第9页Table-1.7写1.2 mm。原文保留差异。', '请求澄清验收样片厚度、母片尺寸及图纸版本；演示未发出询问。', '影响工艺验证与验收依据。'),
    review('BHEL-DEV-04', 'BHEL-REQ-007', '质保起算与截止口径核对', '客户澄清', '商务确认人', 'PDF第1页RFQ.10采用先到者；第11页Table-1.32要求调试后至少12个月。', '结合RFQ第12条优先规则与采购合同澄清，演示未形成承诺。', '影响质保责任期限。'),
  ];
}
