export const MODELS = [
  {id:'MOD-A-R2',code:'HESPER-E360R',name:'Hesper E360R',series:'精密加工系列',revision:'R2',version:1,lifecycle:'量产',standard:'标准模块 S；300 mm 晶圆上料；Si / SiP / GeSi 工艺（演示）',options:'模块 X：精密定位；模块 C：增强夹持',config:'CFG-HESPER-E360R-R2 v1',status:'已发布',scope:'FEP 授权项目',source:'研发配置基线 Hesper E360R R2（演示）',approver:'BU管理员',submitterRole:'技术',history:[{date:'2026-09-10',text:'技术提交配置基线，BU管理员独立批准发布'}]},
  {id:'MOD-A-R1',code:'HESPER-E360R',name:'Hesper E360R',series:'精密加工系列',revision:'R1',version:1,lifecycle:'停产',standard:'标准模块 S1；200 mm 晶圆上料',options:'模块 X1：精密定位',config:'CFG-HESPER-E360R-R1 v1',status:'已发布',scope:'FEP 授权项目',source:'研发配置基线 Hesper E360R R1（演示）',approver:'BU管理员',submitterRole:'技术',history:[{date:'2025-03-10',text:'历史型号版本归档'}]},
];
export const CAPABILITIES = [
  {id:'CAP-001',modelId:'MOD-A-R2',processId:'PROC-A-R2-P1',version:2,metric:'加工厚度',value:'0.5–1.0 mm',valueType:'保证值',config:'CFG-HESPER-E360R-R2 v1；标准模块 S',conditions:'硅材料；Si 工艺；测试方法 M1；含范围端点',limits:'其他材料、厚度或工艺需重新评审；不覆盖产能指标。',evidence:'T-01 v2，第 8 页',source:'Excel',sourceLocation:'研发能力边界.xlsx / 能力表 / 第 2 行',status:'已发布',validity:'有效',approver:'BU管理员',submitterRole:'技术',refs:[{id:'REQ-021',title:'RFQ-001 · 加工厚度要求'}],history:[{date:'2026-10-08',text:'技术核对能力边界；BU管理员独立批准 v2'}]},
  {id:'CAP-002',modelId:'MOD-A-R2',processId:'PROC-A-R2-P1',version:1,metric:'定位精度',value:'≤5 μm',valueType:'保证值',config:'CFG-HESPER-E360R-R2 v1 + 模块 X',conditions:'硅材料；厚度 0.5–1.0 mm；Si 工艺；测试方法 M1',limits:'仅对指定材料、厚度和工艺保证；不覆盖其他配置。',evidence:'T-01 v2，第 8 页',source:'历史 RFQ',sourceLocation:'历史 RFQ-018 / 条款 2.1 / 已核对答复',status:'已发布',validity:'有效',approver:'BU管理员',submitterRole:'技术',refs:[{id:'REQ-022',title:'RFQ-001 · 定位精度'},{id:'REQ-117',title:'历史 RFQ-018 · 条款 2.1'},{id:'K-007',title:'历史知识 · 定位精度经验'}],history:[{date:'2026-10-10',text:'从已定稿历史 RFQ 提取候选，核对原文与证据后独立批准'}]},
  {id:'CAP-003',modelId:'MOD-A-R2',version:1,metric:'产能',value:'120 片/小时',valueType:'典型值',config:'CFG-HESPER-E360R-R2 v1；标准模块 S',conditions:'硅晶圆；单片工艺时间 ≤25 秒',limits:'典型值，不能直接作为保证值承诺。',evidence:'',source:'手动补充',sourceLocation:'RFQ-001 / REQ-023 / 比对工作台补充',status:'草稿',validity:'待核对',approver:'BU管理员',submitterRole:'SR',refs:[],history:[{date:'2026-10-19',text:'SR在 RFQ 比对中补充候选，不改写原应答'}]},
  {id:'CAP-004',modelId:'MOD-A-R2',version:1,metric:'晶圆尺寸',value:'300 mm',valueType:'保证值',config:'CFG-HESPER-E360R-R2 v1；标准模块 S',conditions:'标准硅晶圆；自动上料模式',limits:'翘曲晶圆及特殊材料需重新验证。',evidence:'T-01 v2，第 8 页',source:'Excel',sourceLocation:'研发能力边界.xlsx / 能力表 / 第 5 行',status:'待审核',validity:'待核对',approver:'BU管理员',submitterRole:'技术',refs:[],history:[{date:'2026-10-19',text:'技术提交审核，证据已关联'}]},
  {id:'CAP-005',modelId:'MOD-A-R1',version:1,metric:'晶圆尺寸',value:'200 mm',valueType:'保证值',config:'CFG-HESPER-E360R-R1 v1；标准模块 S1',conditions:'标准硅晶圆',limits:'仅适用 R1；机型已停产。',evidence:'DOC-004 v1，第 5 页',source:'历史 RFQ',sourceLocation:'历史 RFQ-003 / 设备参数',status:'已撤销',validity:'已撤销',approver:'BU管理员',submitterRole:'技术',refs:[],history:[{date:'2026-03-02',text:'证据撤销后，能力同步撤销并记录影响'}]},
];

export const PROCESSES = [
  {id:'PROC-A-R2-P1',buId:'BU-DEMO',modelId:'MOD-A-R2',code:'Si',name:'Si',conditions:'硅材料；测试方法 M1（演示）',enabled:true,version:1},
  {id:'PROC-A-R2-P2',buId:'BU-DEMO',modelId:'MOD-A-R2',code:'SiP',name:'SiP',conditions:'SiP 工艺；适用条件待技术确认（演示）',enabled:true,version:1},
  {id:'PROC-A-R2-GESI',buId:'BU-DEMO',modelId:'MOD-A-R2',code:'GeSi',name:'GeSi',conditions:'GeSi 工艺；适用条件待技术确认（演示）',enabled:true,version:1},
  {id:'PROC-A-R1-P1',buId:'BU-DEMO',modelId:'MOD-A-R1',code:'Si',name:'Si',conditions:'仅适用 R1',enabled:false,version:1},
];
