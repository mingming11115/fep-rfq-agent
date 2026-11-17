import React, {useEffect, useRef, useState} from 'react';
import {Alert, Button, Input, Space, Tag} from 'antd';
import {AlertTriangle, RefreshCw} from './icons';
import {MATCH_LIBRARIES, matchClient, matchNeedsPolling, matchStages} from '../requirementMatchClient.js';
import {Modal, StatusBadge} from './ui';

const matches = matchClient();
const statusLabels = {
  queued:'排队中', running:'比对中', retry_wait:'等待重试', blocked:'等待处理', completed:'已完成',
  failed:'失败', superseded:'已失效', excluded:'已排除', not_run:'未执行', disabled:'未配置',
  hit:'命中', miss:'未命中', not_applicable:'不适用', loading:'读取中', read_failed:'读取失败',
};
const statusTones = {
  queued:'warning', running:'warning', retry_wait:'warning', blocked:'warning', loading:'warning',
  completed:'success', hit:'success', failed:'danger', miss:'danger', read_failed:'danger',
};
function MatchStatus({status}) {
  return <StatusBadge status={statusLabels[status] || status} tone={statusTones[status] || 'neutral'}/>;
}
const reasons = {
  MATCH_SCOPE_CHANGED:'比对依据已变化，当前结果已失效',
  INDEX_NOT_READY:'知识库索引尚未同步',
  MISSING_CAPABILITY_INPUT:'请确认机型、工艺、工况和要求指标',
  CONDITIONS_DIFFER:'适用条件不同或尚未核实',
  SOURCE_SCOPE_UNVERIFIED:'来源可见范围待核对',
  HISTORY_FILE_UNAVAILABLE:'有指定的历史 RFQ 文件不可用于当前项目，请调整召回范围',
  CAPABILITY_EVIDENCE_UNAVAILABLE:'能力依据待核验',
  SEARCH_SCOPE_TOO_LARGE:'当前知识范围超过查询上限',
  QUERY_TOO_LONG:'条款超出查询长度上限',
};
const reasonLabel = reason => reasons[reason] || (reason ? '比对暂未完成，请核对服务状态' : '');
const conditionLabels = {same:'适用条件一致', different:'适用条件不同', unverified:'适用条件待核对', not_specified:'来源未限定条件'};
const checkLabels = {supports:'满足', refutes:'不满足', no_candidate:'未找到能力条目', evidence_unavailable:'证据不可用', review:'待核对'};
function deviationLibraries(run) {
  return matchStages(run).map(stage => ({
    key: stage.library, name: MATCH_LIBRARIES[stage.library], status: stage.status,
  }));
}

function Candidate({candidate, sourceDocument, action}) {
  return <details><summary>{candidate.title || candidate.id} · v{candidate.version}
    {candidate.businessSimilarity != null && ` · 相似度 ${(candidate.businessSimilarity * 100).toFixed(1)}%`}
  </summary>
    {candidate.requirement && <p>原要求　{candidate.requirement}</p>}
    {candidate.answer && <p>参考答复　{candidate.answer}</p>}
    {candidate.conditions && <p>适用条件　{candidate.conditions}</p>}
    {candidate.conditionStatus && <p>{conditionLabels[candidate.conditionStatus]}</p>}
    {(sourceDocument || candidate.source) && <p>来源　{[sourceDocument?.name || candidate.source,
      sourceDocument?.version, candidate.clauseNo].filter(Boolean).join(' · ')}</p>}
    {candidate.requirementAnchor && <p>条款位置　{candidate.requirementAnchor}</p>}
    {candidate.answerAnchor && <p>答复位置　{candidate.answerAnchor}</p>}
    {candidate.value && <p>能力指标值　{candidate.value}（{candidate.valueType}）</p>}
    {candidate.limits && <p>范围限制　{candidate.limits}</p>}
    {candidate.evidenceRefs?.map(item => <p key={JSON.stringify(item)}>证据　{item.id} · v{item.version}　{item.location}</p>)}
    {action}
  </details>;
}

export default function RequirementMatchPanel({preview, ...props}) {
  if (preview) {
    return <section className="response-match-panel" aria-label="知识库比对">
      <Space wrap><strong>知识库比对</strong><Tag color="blue">模拟召回</Tag><MatchStatus status={preview.status}/></Space>
      <ol>{matchStages(preview).map(stage => <li key={stage.library}>
        <Space><b>{MATCH_LIBRARIES[stage.library]}</b><MatchStatus status={stage.status}/></Space>
        {stage.candidates?.map(candidate => <Candidate key={candidate.id} candidate={candidate}/>)}
      </li>)}</ol>
    </section>;
  }
  return <LiveRequirementMatchPanel {...props}/>;
}

function LiveRequirementMatchPanel({row, resources, canAdopt, draftMatchChoice, review, onAdopt, onResult, onDetach, onDeviation, onRematch, matching}) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const deviation = (review?.version || 0) > (run?.deviation?.version || 0) ? review : run?.deviation;
  const generation = useRef(0);
  const capabilityAdopted = draftMatchChoice?.candidateId === 'capability' && draftMatchChoice.matchRunId === run?.runId ||
    row.matchReference?.library === 'capability' && row.matchReference.runId === run?.runId && !run?.referenceInvalid;

  useEffect(() => {
    const current = ++generation.current;
    let timer;
    let failures = 0;
    async function load() {
      try {
        const result = await matches.current(row.id);
        if (generation.current !== current) { return; }
        failures = 0;
        setRun(result);
        setError('');
        timer = setTimeout(load, matchNeedsPolling(result) ? 2000 : 15000);
      } catch (error) {
        console.error('查询条款比对结果失败', error);
        if (generation.current !== current) { return; }
        setRun(null);
        setError(error.message);
        if (++failures < 3 && ![401, 403, 404].includes(error.status)) { timer = setTimeout(load, 5000); }
      }
    }
    void load();
    return () => { generation.current++; clearTimeout(timer); };
  }, [row.id, row.backendVersion, refresh]);
  useEffect(() => {
    onResult?.(run);
    if (run?.deviation) { onDeviation(run.deviation); }
  }, [run]);

  function openAction(action) {
    setReason('');
    setActionError('');
    setAction({kind:action,version:deviation?.version});
  }
  async function submitAction() {
    const text = reason.trim();
    if (!text) { setActionError('请填写处理原因'); return; }
    setBusy(true);
    try {
      if (action.kind === 'detach') {
        if (!await onDetach(text)) { return; }
      } else {
        const item = await matches.closeDeviation(row.id, action.version, text);
        onDeviation(item);
      }
      setAction(null);
      setRefresh(value => value + 1);
    } catch (error) { console.error('提交条款比对操作失败', error); setActionError(error.message); }
    finally { setBusy(false); }
  }

  return <section className="response-match-panel" aria-label="知识库比对">
    <div className="response-match-head">
      <Space wrap>
        <strong>知识库比对</strong>
        <MatchStatus status={run?.status || (error ? 'read_failed' : 'loading')}/>
      </Space>
      <Space size={4} wrap>
        {onRematch && <Button type="link" size="small" icon={<RefreshCw size={13}/>} loading={matching} disabled={matching} onClick={onRematch}>重新比对</Button>}
        {error && <Button size="small" onClick={() => setRefresh(value => value + 1)}>刷新结果</Button>}
      </Space>
    </div>
    {error && <Alert type="error" message={error} showIcon/>}
    {run?.reason && <p>{reasonLabel(run.reason)}</p>}
    {run?.result?.skipped && <Alert type="info" showIcon message="本项目已关闭三个知识库比对，条款按人工核对处理"/>}
    {run && !run.result?.skipped && <ol>{matchStages(run).map(stage => <li key={stage.library}>
      <Space><b>{MATCH_LIBRARIES[stage.library]}</b><MatchStatus status={stage.status}/></Space>
      {stage.status === 'disabled' && <p>本项目已关闭该知识库，未参与本轮比对</p>}
      {stage.reason && <p>{reasonLabel(stage.reason)}</p>}
      {stage.candidates?.map(candidate => <Candidate key={`${candidate.id}:${candidate.version}`} candidate={candidate}
        sourceDocument={stage.library === 'history_rfq' ? resources?.historyDocuments?.find(file => file.id === candidate.documentId) : undefined}
        action={canAdopt && <Button size="small" onClick={() => onAdopt(run, candidate)}>核对并采用</Button>}/>)}
      {stage.checks?.map((check, index) => <div key={index}>
        <p>{check.deviceId} · {check.requirement?.metricCode} · {checkLabels[check.assessment] || '待核对'}</p>
        {check.candidates?.map(candidate => <Candidate key={`${candidate.id}:${candidate.version}`} candidate={candidate}/>)}
      </div>)}
    </li>)}</ol>}
    {canAdopt && !capabilityAdopted && run?.result?.matchedLibrary === 'capability' && run.result.conclusion !== '待确认' &&
      <Button size="small" onClick={() => onAdopt(run, {id:'capability', conclusion:run.result.conclusion,
        conditions:run.result.stages.capability.restrictions?.join('；')})}>核对并采用能力结论</Button>}
    {run?.historyDocumentIds?.length > 0 && run.result?.stages?.history_rfq?.status === 'miss' &&
      <p>指定文件内未找到匹配。</p>}
    {run?.historyGroupId && run.result?.stages?.history_rfq?.status === 'miss' &&
      <p>同 Group RFQ 内未找到匹配。</p>}
    {deviation && <div className="match-deviation-card">
      <div className="match-deviation-head">
        <span className="match-deviation-icon"><AlertTriangle/></span>
        <strong className="match-deviation-title">知识比对偏离</strong>
        <span className="match-deviation-hint">以下知识库未能提供可靠依据，请人工核对条款</span>
      </div>
      <div className="match-deviation-libraries">
        {deviationLibraries(run).map(item => <div className="match-deviation-library" key={item.key}>
          <span className="match-deviation-library-name">{item.name}</span>
          <MatchStatus status={item.status}/>
        </div>)}
      </div>
    </div>}
    {(row.matchReference || row.restrictedMatchReference) && <div>
      <p>已采纳依据　{row.restrictedMatchReference ? '来源不可访问' : `${MATCH_LIBRARIES[row.matchReference.library]}　${row.matchReference.version ? `${row.matchReference.candidateId} · v${row.matchReference.version}` : '已保存能力条目与证据版本'}`}</p>
      {run?.referenceInvalid && <Alert type="warning" showIcon message="已采纳依据已失效，请重新核对后确认"/>}
      {canAdopt && <Button size="small" onClick={() => openAction('detach')}>解除采纳依据</Button>}
    </div>}
    {action && <Modal title={{close:'关闭偏离事项', detach:'解除采纳依据'}[action.kind]}
      onClose={() => { if (!busy) { setAction(null); } }}
      footer={<Space><Button disabled={busy} onClick={() => setAction(null)}>取消</Button><Button type="primary" loading={busy} onClick={submitAction}>提交</Button></Space>}>
      <Input.TextArea aria-label="处理原因" value={reason} onChange={event => setReason(event.target.value)} maxLength={900}/>
      {actionError && <Alert type="error" message={actionError} showIcon/>}
    </Modal>}
  </section>;
}
