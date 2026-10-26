import React from 'react';
import {FileText,LoaderCircle,AlertCircle,CheckCircle2,ArrowRight} from 'lucide-react';
import {StatusBadge} from './ui';

export default function SourceProcessingPane({summary,onOpen}){
 const failed=summary.status==='failed',ready=summary.status==='ready',Icon=failed?AlertCircle:ready?CheckCircle2:LoaderCircle;
 return <section className="detail-source detail-processing-source" aria-label="RFQ 解析状态">
  <div className="detail-processing-heading"><Icon size={32}/><h2>{failed?'RFQ 解析需要处理':ready?'解析结果待同步':'RFQ 正在解析'}</h2><p>{failed?'文件已上传，请查看失败原因并重试。':ready?'文件已处理，请查看解析结果并同步应答项。':'文件已上传，正在等待或进行解析。解析完成后可处理应答项。'}</p></div>
  <ol className="detail-parse-steps"><li className="done">文件已上传</li><li className={ready?'done':'active'}>{failed?'解析异常':ready?'文件已处理':'解析处理中'}</li><li>生成应答项</li></ol>
  <div className="detail-processing-files">{summary.files.map(file=><article key={file.id}><FileText size={22}/><div><strong>{file.name}</strong><small>{file.version} · {file.purpose}</small>{file.error&&<p className="flow-error-inline">{file.error}</p>}</div><StatusBadge status={file.status}/></article>)}</div>
  {(failed||ready)&&<button className="btn btn-primary" onClick={onOpen}>{failed?'查看失败任务':'查看解析结果'}<ArrowRight size={15}/></button>}
 </section>;
}
