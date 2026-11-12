const stages = {
  standard_reply: {status:'miss'},
  history_rfq: {status:'miss'},
  capability: {status:'miss'},
};

export function demoMatchPreview(requirementId, hash) {
  const query = new URLSearchParams(hash.split('?')[1]);
  if (query.get('matchPreview') !== 'true' || query.get('projectId') !== 'MYSQL-DEMO-006') {
    return null;
  }
  if (requirementId === 'MYSQL-DEMO-006-REQ-4') {
    return {status:'completed', result:{conclusion:'待确认', knowledgeGap:true, stages}};
  }
  if (requirementId !== 'MYSQL-DEMO-006-REQ-3') {
    return null;
  }
  return {status:'completed', result:{
    matchedLibrary:'history_rfq',
    conclusion:'有条件 Comply',
    stages:{
      ...stages,
      history_rfq:{status:'hit', candidates:[{
        id:'DEMO-HISTORY-ACC-003',
        version:1,
        title:'【模拟】试制设备精度验证记录',
        businessSimilarity:0.962,
        requirement:'按双方确认的样品和测量方案提供精度验证记录。',
        answer:'按双方确认的样品、图纸公差和测量方案执行验证，并提交实测结果及判定记录。',
        conditions:'验证前须确认样品批次、关键测点和判定标准。',
        source:'【模拟】《精密加工设备历史 RFQ》V1.2',
        clauseNo:'§4.3',
        answerAnchor:'应答矩阵第 18 行',
      }]},
      capability:{status:'not_run'},
    },
  }};
}
