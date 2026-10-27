import React from 'react';
import './source-parse-progress.css';

const steps = ['文件已上传', '条款解析', '应答项对比', '生成应答项'];
const stages = { extracting: 1, comparing: 2, generating: 3 };

export default function SourceParseProgress({ files = [] }) {
  const sources = files.filter(file => file.purpose === '要求来源');
  if (!sources.length) return null;
  const failed = sources.some(file => file.status === '失败');
  const current = Math.min(...sources.map(file => file.status === '完成' || file.status === '待核对' ? steps.length : stages[file.parseStage] || 1));
  return <ol className="source-parse-progress" aria-label="解析与应答项对比进度">
    {steps.map((label, index) => {
      const state = index < current ? 'done' : index === current ? failed ? 'failed' : 'active' : '';
      return <li key={label} className={state} aria-current={index === current ? 'step' : undefined}><span>{label}</span><small>{state === 'done' ? '已完成' : state === 'failed' ? '未完成' : state === 'active' ? index === 1 && sources.some(file => file.status === '排队中') ? '等待处理' : '进行中' : '等待处理'}</small></li>;
    })}
  </ol>;
}
