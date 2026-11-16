import React, {useEffect, useState} from 'react';
import {Alert, Button, InputNumber, Space, Switch} from 'antd';
import {MATCH_LIBRARIES, matchClient} from '../requirementMatchClient.js';

const matches = matchClient();
const DEFAULT_SIMILARITY = {standard_reply: 0.8, history_rfq: 0.74};
const DEFAULT_ENABLED = {standard_reply: true, history_rfq: true, capability: true};
const snapshot = (order, similarity, enabled) => JSON.stringify([order, similarity, enabled]);

export default function MatchPolicyPanel({buId, projectId}) {
  const projectScope = Boolean(projectId);
  const [policy, setPolicy] = useState(null);
  const [order, setOrder] = useState([]);
  const [similarity, setSimilarity] = useState(DEFAULT_SIMILARITY);
  const [enabled, setEnabled] = useState(DEFAULT_ENABLED);
  const [baseline, setBaseline] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setPolicy(null);
    setError('');
    const load = projectScope ? matches.projectPolicy(projectId) : matches.policy(buId);
    load.then(value => {
      if (!active) { return; }
      const nextSimilarity = {...DEFAULT_SIMILARITY, ...(value.similarity || {})};
      const nextEnabled = {...DEFAULT_ENABLED, ...(value.enabled || {})};
      setPolicy(value);
      setOrder(value.matchOrder);
      setSimilarity(nextSimilarity);
      setEnabled(nextEnabled);
      setBaseline(snapshot(value.matchOrder, nextSimilarity, nextEnabled));
    }).catch(error => { console.error('加载条款比对策略失败', error); if (active) { setError(error.message); } });
    return () => { active = false; };
  }, [buId, projectId, projectScope, refresh]);
  const changed = Boolean(policy) && snapshot(order, similarity, enabled) !== baseline;
  const allOff = projectScope && Object.values(enabled).every(value => value === false);
  function move(index, step) {
    const updated = [...order];
    [updated[index], updated[index + step]] = [updated[index + step], updated[index]];
    setOrder(updated);
    setSaved('');
  }
  function apply(value) {
    const nextSimilarity = {...DEFAULT_SIMILARITY, ...(value.similarity || {})};
    const nextEnabled = {...DEFAULT_ENABLED, ...(value.enabled || {})};
    setPolicy(value);
    setOrder(value.matchOrder);
    setSimilarity(nextSimilarity);
    setEnabled(nextEnabled);
    setBaseline(snapshot(value.matchOrder, nextSimilarity, nextEnabled));
  }
  async function save() {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const value = projectScope
        ? await matches.saveProjectPolicy(projectId, {version:policy.version, matchOrder:order,
          similarity:{standardReply:similarity.standard_reply, historyRfq:similarity.history_rfq},
          enabled:{standardReply:enabled.standard_reply, historyRfq:enabled.history_rfq, capability:enabled.capability}})
        : await matches.savePolicy(buId, {version:policy.version, matchOrder:order});
      apply(value);
      setSaved('已保存');
    } catch (error) { console.error('保存条款比对策略失败', error); setError(error.message); }
    finally { setSaving(false); }
  }
  async function reset() {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      apply(await matches.resetProjectPolicy(projectId));
      setSaved('已恢复 BU 默认策略');
    } catch (error) { console.error('恢复默认比对策略失败', error); setError(error.message); }
    finally { setSaving(false); }
  }
  return <div className="match-policy-panel">
    <p>{projectScope
      ? '顺序、阈值与开关只作用于本项目：保存后新建或手动重跑的轮次按新策略执行，已有轮次保留创建时的策略。'
      : '保存后，新建或手动重跑的轮次使用新顺序。已有轮次保留创建时的顺序。'}</p>
    {error && <Space><Alert type="error" message={error} showIcon/><Button onClick={() => setRefresh(value => value + 1)}>重新读取</Button></Space>}
    {policy && <>
      {projectScope && policy.inherited && <Alert type="info" showIcon
        message="当前沿用 BU 默认策略：三项均可在本页单独覆盖，保存后本项目不再继承。"/>}
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th>顺序</th><th>知识库</th>{projectScope && <th>参与比对</th>}{projectScope && <th>相似度阈值</th>}<th>调整顺序</th></tr></thead>
        <tbody>{order.map((library, index) => <tr key={library}>
          <td>{index + 1}</td>
          <td>{MATCH_LIBRARIES[library]}</td>
          {projectScope && <td><Switch size="small" aria-label={`${MATCH_LIBRARIES[library]}参与比对`}
            checked={enabled[library] !== false} checkedChildren="比对" unCheckedChildren="不比对"
            onChange={value => { setEnabled(current => ({...current, [library]:value})); setSaved(''); }}/></td>}
          {projectScope && <td>{library === 'capability' ? <span className="muted">按区间规则判定</span>
            : <InputNumber size="small" min={0.5} max={0.99} step={0.01} precision={2} style={{width:90}}
              aria-label={`${MATCH_LIBRARIES[library]}相似度阈值`} value={similarity[library]}
              onChange={value => { setSimilarity(current => ({...current, [library]:value ?? DEFAULT_SIMILARITY[library]})); setSaved(''); }}/>}</td>}
          <td><Space size={4}>
            <Button size="small" aria-label={`上移${MATCH_LIBRARIES[library]}`} disabled={saving || index === 0} onClick={() => move(index, -1)}>上移</Button>
            <Button size="small" aria-label={`下移${MATCH_LIBRARIES[library]}`} disabled={saving || index === order.length - 1} onClick={() => move(index, 1)}>下移</Button>
          </Space></td>
        </tr>)}</tbody>
      </table></div>
      {allOff && <Alert type="warning" showIcon message="三个知识库全部关闭：新解析条款不做比对，直接进入人工核对；已完成的轮次保留原结果。"/>}
      <Space wrap>
        <Button type="primary" loading={saving} disabled={!changed} onClick={save}>{projectScope ? '保存比对策略' : '保存比对顺序'}</Button>
        {projectScope && !policy.inherited && <Button disabled={saving} onClick={reset}>恢复 BU 默认</Button>}
        {saved && <span role="status">{saved}</span>}
      </Space>
    </>}
  </div>;
}
