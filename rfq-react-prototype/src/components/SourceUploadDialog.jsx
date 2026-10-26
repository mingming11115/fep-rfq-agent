import React,{useRef,useState} from 'react';
import {Upload,FileText,ShieldCheck,ChevronRight,X} from 'lucide-react';
import {Modal,StatusBadge} from './ui';

function Field({label,children,required=false,wide=false}){return <label className={`field ${wide?'flow-field-wide':''}`}><span>{required&&<i className="flow-required">*</i>}{label}</span>{children}</label>;}

export default function SourceUploadDialog({project,files=[],onSubmit,onClose}){
 const [selected,setSelected]=useState([]),[purpose,setPurpose]=useState('要求来源'),[version,setVersion]=useState('V1.0'),[visibility,setVisibility]=useState('项目成员可见'),[reason,setReason]=useState(''),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
 const input=useRef(null),duplicates=selected.some(file=>files.some(old=>old.name===file.name));
 function selectFiles(incoming){setSelected(Array.from(incoming||[]).map(({name,size,type,lastModified})=>({name,size,type,lastModified})));setError('');}
 function submit(){
  if(!selected.length)return setError('请选择至少一个文件');
  if(!version.trim())return setError('请填写文件版本');
  if(duplicates&&!reason.trim())return setError('存在同名文件，请填写替换原因；旧版本将继续保留。');
  const incoming=selected.map(file=>({id:`FILE-${crypto.randomUUID()}`,name:file.name,size:file.size,mime:file.type,lastModified:file.lastModified,purpose,version:version.trim(),visibility,reason:reason.trim(),previousVersionId:[...files].reverse().find(old=>old.name===file.name)?.id,status:'排队中',createdAt:new Date().toLocaleString('zh-CN',{hour12:false})}));
  onSubmit(incoming);
 }
 return <Modal title="上传并智能解析" onClose={onClose} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn btn-primary" onClick={submit}>开始智能解析</button></>}>
  <div className="dw-upload-steps"><span><b>1</b>选择文件</span><ChevronRight size={14}/><span><b>2</b>自动解析</span><ChevronRight size={14}/><span><b>3</b>查看结果</span></div>
  <div className="dw-mode-note"><ShieldCheck size={19}/><div><strong>智能抽取 · 自动导入</strong><p>按文件用途抽取应答项，完成后直接进入应答项处理。本原型仅记录元数据，抽取内容使用模拟数据。</p></div></div>
  <div className="form-grid"><Field label="文件用途" required><select className="select" value={purpose} onChange={e=>setPurpose(e.target.value)}><option>要求来源</option><option>补充附件</option><option>应答模板</option></select></Field><Field label="文件版本" required><input className="input" value={version} onChange={e=>setVersion(e.target.value)}/></Field><Field label="可见范围"><select className="select" value={visibility} onChange={e=>setVisibility(e.target.value)}><option>项目成员可见</option><option>项目负责人及专业人员</option></select></Field><Field label="关联项目"><input className="input" value={project.name} readOnly/></Field></div>
  <button className={`flow-dropzone ${dragging?'dw-drop-active':''}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);selectFiles(e.dataTransfer.files);}} onClick={()=>input.current?.click()}><Upload size={28}/><strong>拖拽文件到这里，或点击选择</strong><span>DOC / DOCX（主要格式）· 兼容 PDF / Excel / CSV / TXT</span></button>
  <input ref={input} aria-label="选择 RFQ 文件" className="flow-hidden" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={e=>selectFiles(e.target.files)}/>
  {selected.map((file,index)=><div className="flow-upload-item" key={`${file.name}-${index}`}><FileText size={16}/><span>{file.name}<small>{(file.size/1024).toFixed(1)} KB</small></span>{files.some(old=>old.name===file.name)&&<StatusBadge status="同名文件 · 新版本"/>}<button className="text-link" aria-label={`移除 ${file.name}`} onClick={()=>setSelected(old=>old.filter((_,i)=>i!==index))}><X size={16}/></button></div>)}
  {duplicates&&<Field label="替换原因（保留原版本）" required wide><textarea className="input" value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
  {purpose!=='要求来源'&&<p className="muted">该用途仅登记资料，不触发要求解析。</p>}{error&&<p className="flow-error-inline" role="alert">{error}</p>}
 </Modal>;
}
