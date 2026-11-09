import React, {useEffect, useState} from 'react';
import {Alert, Button, Card, Space} from 'antd';
import {MATCH_LIBRARIES, matchClient} from '../requirementMatchClient.js';

const matches = matchClient();

export default function MatchPolicyPanel({buId}) {
  const [policy, setPolicy] = useState(null);
  const [order, setOrder] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setPolicy(null);
    setError('');
    matches.policy(buId).then(value => {
      if (active) { setPolicy(value); setOrder(value.matchOrder); }
    }).catch(error => { console.error('加载条款比对策略失败', error); if (active) { setError(error.message); } });
    return () => { active = false; };
  }, [buId, refresh]);
  function move(index, step) {
    const updated = [...order];
    [updated[index], updated[index + step]] = [updated[index + step], updated[index]];
    setOrder(updated);
    setSaved(false);
  }
  async function save() {
    setSaving(true);
    setError('');
    try {
      const value = await matches.savePolicy(buId, {version:policy.version, matchOrder:order});
      setPolicy(value);
      setOrder(value.matchOrder);
      setSaved(true);
    } catch (error) { console.error('保存条款比对策略失败', error); setError(error.message); }
    finally { setSaving(false); }
  }
  return <Card className="admin-management-card" title="RFQ 三库比对顺序">
    <p>保存后，新建或手动重跑的轮次使用新顺序。已有轮次保留创建时的顺序。</p>
    {error && <Space><Alert type="error" message={error} showIcon/><Button onClick={() => setRefresh(value => value + 1)}>重新读取</Button></Space>}
    {policy && <><ol>{order.map((library, index) => <li key={library}>
      <Space wrap>{MATCH_LIBRARIES[library]}
        <Button size="small" aria-label={`上移${MATCH_LIBRARIES[library]}`} disabled={saving || index === 0} onClick={() => move(index, -1)}>上移</Button>
        <Button size="small" aria-label={`下移${MATCH_LIBRARIES[library]}`} disabled={saving || index === order.length - 1} onClick={() => move(index, 1)}>下移</Button>
      </Space>
    </li>)}</ol><Space><Button type="primary" loading={saving} disabled={order.every((value, i) => policy.matchOrder[i] === value)} onClick={save}>保存比对顺序</Button>
      {saved && <span role="status">已保存</span>}</Space></>}
  </Card>;
}
