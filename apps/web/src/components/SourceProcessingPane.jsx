import { UiButton } from './AntContent';
import React from 'react';
import {FileText,LoaderCircle,AlertCircle,CheckCircle2,ArrowRight} from "./icons";
import {StatusBadge} from './ui';
import SourceParseProgress from './SourceParseProgress';

export default function SourceProcessingPane({summary,onOpen}){
 const failed=summary.status==='failed',ready=summary.status==='ready',Icon=failed?AlertCircle:ready?CheckCircle2:LoaderCircle;
 return <section className="detail-source detail-processing-source" aria-label="RFQ 解析状态">
  <div className="detail-processing-heading"><Icon size={32}/><h2>{failed?'RFQ 解析需要处理':ready?'解析结果待同步':'RFQ 正在解析与对比'}</h2><p>{failed?'文件已上传，请查看失败原因并重试。':ready?'文件已处理，请查看解析结果并同步应答项。':'文件已上传，将依次解析条款、对比应答项并生成应答结果，完成后可处理应答项。'}</p></div>
  <SourceParseProgress files={summary.files}/>
  {summary.files.some(file=>file.demoParsePreview)&&<p className="detail-parsing-demo-note">解析中示例 · 固定展示应答项对比阶段，刷新或切换页面后仍可查看。</p>}
  <div className="detail-processing-files">{summary.files.map(file=><article key={file.id}><FileText size={22}/><div><strong>{file.name}</strong><small>{file.version} · {file.purpose}</small>{file.error&&<p className="flow-error-inline">{file.error}</p>}</div><StatusBadge status={file.status}/></article>)}</div>
  {(failed||ready)&&<UiButton className="btn btn-primary" onClick={onOpen}>{failed?'查看失败任务':'查看解析结果'}<ArrowRight size={15}/></UiButton>}
 </section>;
}
