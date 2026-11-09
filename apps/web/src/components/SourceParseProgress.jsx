import React from 'react';
import './source-parse-progress.css';

const demoSteps = ['文件已上传', '条款解析', '应答项对比', '生成应答项'];
const stages = { extracting: 1, comparing: 2, generating: 3 };

export default function SourceParseProgress({ files = [] }) {
  const sources = files.filter(file => file.purpose === '要求来源');
  if (!sources.length) { return null; }
  // A parse run persists clauses; it does not run response matching/generation.
  const backend = sources.some(file => file.backendDocumentId);
  const steps = backend ? ['文件已上传', '后端条款解析', '后端条款读取'] : demoSteps;
  const failed = sources.some(file => file.status === '失败');
  const partial = sources.some(file => ['待核对','部分完成'].includes(file.status));
  const current = Math.min(...sources.map(file => ['完成','待核对','部分完成'].includes(file.status) ? steps.length : backend ? 1 : stages[file.parseStage] || 1));
  return <ol className="source-parse-progress" aria-label={backend?'后端解析进度':'解析与应答项对比进度'}>
    {steps.map((label, index) => {
      const state = index < current ? 'done' : index === current ? failed ? 'failed' : 'active' : '';
      return <li key={label} className={state} aria-current={index === current ? 'step' : undefined}><span>{label}</span><small>{state === 'done' ? backend && partial && index === 1 ? '待人工核对' : '已完成' : state === 'failed' ? '未完成' : state === 'active' ? index === 1 && sources.some(file => file.status === '排队中') ? '等待处理' : '进行中' : '等待处理'}</small></li>;
    })}
  </ol>;
}
