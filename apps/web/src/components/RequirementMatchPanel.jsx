import React, {useEffect, useRef, useState} from 'react';
import {Alert, Button, Input, Space, Tag} from 'antd';
import {MATCH_LIBRARIES, matchClient, matchNeedsPolling, matchStages} from '../requirementMatchClient.js';
import MatchInputDialog from './MatchInputDialog';
import {demoMatchPreview} from '../demoMatchPreview.js';
import {Modal} from './ui';

const matches = matchClient();
const statusLabels = {
  queued:'排队中', running:'比对中', retry_wait:'等待重试', blocked:'等待处理', completed:'已完成',
  failed:'失败', superseded:'已失效', needs_review:'原文待核对', not_run:'未执行',
  hit:'命中', miss:'未命中', not_applicable:'不适用',
};
const reasons = {
  MATCH_SCOPE_CHANGED:'比对依据已变化，请重新比对',
  INDEX_NOT_READY:'知识库索引尚未同步',
  MISSING_CAPABILITY_INPUT:'请确认机型、工艺、工况和要求指标',
  CONDITIONS_DIFFER:'适用条件不同或尚未核实',
  SOURCE_SCOPE_UNVERIFIED:'来源可见范围待核对',
  HISTORY_FILE_UNAVAILABLE:'有指定的历史 RFQ 文件不可用于当前项目，请调整召回范围',
  CAPABILITY_EVIDENCE_UNAVAILABLE:'能力依据待核验',
  SEARCH_SCOPE_TOO_LARGE:'当前知识范围超过查询上限',
  QUERY_TOO_LONG:'条款超出查询长度上限',
};
const reasonLabel = reason => reasons[reason] || (reason ? '请核对服务状态或重新比对' : '');
const conditionLabels = {same:'适用条件一致', different:'适用条件不同', unverified:'适用条件待核对', not_specified:'来源未限定条件'};
const checkLabels = {supports:'满足', refutes:'不满足', no_candidate:'未找到能力条目', evidence_unavailable:'证据不可用', review:'待核对'};

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

export default function RequirementMatchPanel(props) {
  const preview = demoMatchPreview(props.row.id, window.location.hash);
  if (preview) {
    return <section className="response-match-panel" aria-label="知识库比对">
      <Space wrap><strong>知识库比对</strong><Tag color="blue">模拟召回</Tag><Tag>已完成</Tag></Space>
      <ol>{matchStages(preview).map(stage => <li key={stage.library}>
        <Space><b>{MATCH_LIBRARIES[stage.library]}</b><Tag>{statusLabels[stage.status]}</Tag></Space>
        {stage.candidates?.map(candidate => <Candidate key={candidate.id} candidate={candidate}/>)}
      </li>)}</ol>
      {preview.result.matchedLibrary && <p>系统建议　{preview.result.conclusion}</p>}
      {preview.result.knowledgeGap && <p>三库均未命中，请人工核对条款。</p>}
    </section>;
  }
  return <LiveRequirementMatchPanel {...props}/>;
}

function LiveRequirementMatchPanel({row, resources, canRun, canSetInput, canAdopt, canCloseDeviation, actorId, review, onAdopt, onResult, onDetach, onDeviation, toast}) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const deviation = (review?.version || 0) > (run?.deviation?.version || 0) ? review : run?.deviation;
  const reviewers = deviation?.reviewerIds || [];
  const canResolve = reviewers.length ? reviewers.includes(actorId) && !deviation.reviewVotes?.[actorId]
    : canCloseDeviation && !deviation?.technicalReviewRequired;
  const retryId = useRef(null);
  const generation = useRef(0);

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
    if (run) { onResult(run); if (run.deviation) { onDeviation(run.deviation); } }
  }, [run]);

  async function retry() {
    const current = generation.current;
    setBusy(true);
    try {
      retryId.current ??= crypto.randomUUID();
      await matches.retry(row.id, row.backendVersion, retryId.current);
      if (generation.current !== current) { return; }
      retryId.current = null;
      setRun(null);
      setRefresh(value => value + 1);
    } catch (error) {
      console.error('重试条款比对失败', error);
      if (generation.current !== current) { return; }
      if (error.status && error.status < 500) { retryId.current = null; }
      toast(error.message, 'error');
    } finally {
      if (generation.current === current) { setBusy(false); }
    }
  }

  function openAction(action) {
    setReason('');
    setActionError('');
    setAction({kind:action,runId:run?.runId,version:deviation?.version});
  }
  async function submitAction() {
    const text = reason.trim();
    if (!text) { setActionError('请填写处理原因'); return; }
    setBusy(true);
    try {
      if (action.kind === 'detach') {
        if (!await onDetach(text)) { return; }
      } else {
        const item = action.kind === 'reject' ? await matches.reject(row.id, action.runId, text)
          : await matches.closeDeviation(row.id, action.version, text);
        onDeviation(item);
      }
      setAction(null);
      setRefresh(value => value + 1);
    } catch (error) { console.error('提交条款比对操作失败', error); setActionError(error.message); }
    finally { setBusy(false); }
  }

  return <section className="response-match-panel" aria-label="知识库比对">
    <Space wrap>
      <strong>知识库比对</strong>
      <Tag>{run ? statusLabels[run.status] || run.status : error ? '读取失败' : '读取中'}</Tag>
      {canRun && <Button size="small" loading={busy} onClick={retry}>重新比对</Button>}
      {canSetInput && <Button size="small" onClick={() => setInputOpen(true)}>设置比对条件</Button>}
      {canRun && run?.status === 'completed' && <Button size="small" onClick={() => openAction('reject')}>拒绝本轮结果</Button>}
      {error && <Button size="small" onClick={() => setRefresh(value => value + 1)}>刷新结果</Button>}
    </Space>
    {error && <Alert type="error" message={error} showIcon/>}
    {run?.reason && <p>{reasonLabel(run.reason)}</p>}
    {run && <ol>{matchStages(run).map(stage => <li key={stage.library}>
      <Space><b>{MATCH_LIBRARIES[stage.library]}</b><Tag>{statusLabels[stage.status] || stage.status}</Tag></Space>
      {stage.reason && <p>{reasonLabel(stage.reason)}</p>}
      {stage.candidates?.map(candidate => <Candidate key={`${candidate.id}:${candidate.version}`} candidate={candidate}
        sourceDocument={stage.library === 'history_rfq' ? resources?.historyDocuments?.find(file => file.id === candidate.documentId) : undefined}
        action={canAdopt && <Button size="small" onClick={() => onAdopt(run, candidate)}>核对并采用</Button>}/>)}
      {stage.checks?.map((check, index) => <div key={index}>
        <p>{check.deviceId} · {check.requirement?.metricCode} · {checkLabels[check.assessment] || '待核对'}</p>
        {check.candidates?.map(candidate => <Candidate key={`${candidate.id}:${candidate.version}`} candidate={candidate}/>)}
      </div>)}
    </li>)}</ol>}
    {run?.result?.matchedLibrary && <p>系统建议　{run.result.conclusion}</p>}
    {canAdopt && run?.result?.matchedLibrary === 'capability' && run.result.conclusion !== '待确认' &&
      <Button size="small" onClick={() => onAdopt(run, {id:'capability', conclusion:run.result.conclusion,
        conditions:run.result.stages.capability.restrictions?.join('；')})}>核对并采用能力结论</Button>}
    {run?.result?.knowledgeGap && <p>三库均未命中，请人工核对条款。</p>}
    {run?.historyDocumentIds?.length > 0 && run.result?.stages?.history_rfq?.status === 'miss' &&
      <p>指定文件内未找到匹配。</p>}
    {run?.historyGroupId && run.result?.stages?.history_rfq?.status === 'miss' &&
      <p>同 Group RFQ 内未找到匹配。</p>}
    {deviation && <div>
      <p>知识比对偏离　{deviation.status}</p>
      <ul>{deviation.triggers?.map(item => <li key={`${item.runId}:${item.type}`}>{item.reason}</li>)}</ul>
      {deviation.resolution && <p>处理结果　{deviation.resolution}</p>}
      {reviewers.length > 0 && <p>评审已完成 {Object.keys(deviation.reviewVotes || {}).length}/{reviewers.length}</p>}
      {deviation.technicalReviewRequired && !reviewers.length && <p>请通过「评审」分派技术人员。</p>}
      {canResolve && deviation.status === '待处理' && <Button size="small" onClick={() => openAction('close')}>{reviewers.length ? '通过本条评审' : '关闭偏离事项'}</Button>}
    </div>}
    {(row.matchReference || row.restrictedMatchReference) && <div>
      <p>已采纳依据　{row.restrictedMatchReference ? '来源不可访问' : `${MATCH_LIBRARIES[row.matchReference.library]}　${row.matchReference.version ? `${row.matchReference.candidateId} · v${row.matchReference.version}` : '已保存能力条目与证据版本'}`}</p>
      {run?.referenceInvalid && <Alert type="warning" showIcon message="已采纳依据已失效，请重新核对后确认"/>}
      {canAdopt && <Button size="small" onClick={() => openAction('detach')}>解除采纳依据</Button>}
    </div>}
    {inputOpen && <MatchInputDialog row={row} resources={resources} client={matches} onClose={() => setInputOpen(false)}
      onSaved={() => { setInputOpen(false); setRun(null); setRefresh(value => value + 1); toast('比对条件已保存，已提交比对'); }}/>}
    {action && <Modal title={{reject:'拒绝本轮比对结果', close:'关闭偏离事项', detach:'解除采纳依据'}[action.kind]}
      onClose={() => { if (!busy) { setAction(null); } }}
      footer={<Space><Button disabled={busy} onClick={() => setAction(null)}>取消</Button><Button type="primary" loading={busy} onClick={submitAction}>提交</Button></Space>}>
      <Input.TextArea aria-label="处理原因" value={reason} onChange={event => setReason(event.target.value)} maxLength={900}/>
      {actionError && <Alert type="error" message={actionError} showIcon/>}
    </Modal>}
  </section>;
}
