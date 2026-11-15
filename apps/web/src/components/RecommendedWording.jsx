import React, { useState } from 'react';
import { Button, Card, Input, Space, Tag, Typography } from 'antd';
import { Sparkles, RefreshCw, Check } from './icons';

export default function RecommendedWording({ recommendation, evidence, currentDraft, canEdit, onAdopt }) {
  const [wording, setWording] = useState(recommendation);
  const adopted = !!wording.trim() && wording.trim() === (currentDraft || '').trim();
  return <section className="response-wording response-wide" aria-label="AI 推荐话术">
    <Card size="small" title={<h3 className="response-wording-heading"><Sparkles size={16} aria-hidden="true"/>AI 推荐话术</h3>}
      extra={adopted ? <Tag color="success">已采用</Tag> : <Typography.Text type="secondary">模拟生成</Typography.Text>}>
      <Input.TextArea aria-label="推荐话术" autoSize={{ minRows: 3, maxRows: 6 }} value={wording} readOnly={!canEdit}
        onChange={event => setWording(event.target.value)}/>
      <Typography.Paragraph type="secondary" aria-label="推荐话术依据" style={{ margin: '8px 0 0' }}>
        依据：{String(evidence || '').trim() || '暂无关联证据，请在「证据」中补充来源'}
      </Typography.Paragraph>
      <div className="response-wording-footer">
        <Space size={8} wrap>
          <Button type="link" size="small" icon={<RefreshCw size={12}/>} disabled={!canEdit} onClick={() => setWording(recommendation)}>重新生成</Button>
          <Button size="small" icon={<Check size={13}/>} disabled={!canEdit || !wording.trim() || adopted} onClick={() => onAdopt(wording.trim())}>采用话术</Button>
        </Space>
      </div>
    </Card>
  </section>;
}
