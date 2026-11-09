import React,{useState} from 'react';
import {Alert,Button,Modal,Select,Space} from 'antd';

export default function LibraryImportDialog({title,accept,hint,projects,onImport,onClose}) {
  const [file,setFile]=useState(null),[projectId,setProjectId]=useState(''),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[result,setResult]=useState(null);
  async function submit(){
    if (!file || busy) { return; }
    setBusy(true);
    setError('');
    try {setResult(await onImport(file,projectId));}
    catch (cause) { console.error('导入知识库资料失败', cause); setError(cause.message);}
    finally {setBusy(false);}
  }
  return <Modal open title={title} onCancel={busy?undefined:onClose} closable={!busy} maskClosable={!busy}
    footer={result?<Button type="primary" onClick={onClose}>完成</Button>:<>
      <Button onClick={onClose} disabled={busy}>取消</Button>
      <Button type="primary" disabled={!file} loading={busy} onClick={submit}>导入为草稿</Button>
    </>}>
    {error&&<Alert type="error" showIcon message={error}/>}
    {result?<Space direction="vertical">
      <p>已新增 {result.items?.length||0} 条草稿，跳过 {result.skippedRows?.length||0} 条重复记录。</p>
      {result.errors?.length>0&&<ul>{result.errors.map(row=><li key={row.rowNumber}>第 {row.rowNumber} 行 · {row.message}</li>)}</ul>}
    </Space>:<Space direction="vertical" style={{width:'100%'}}>
      <p>{hint}</p>
      <input aria-label="选择导入文件" type="file" accept={accept} disabled={busy} onChange={e=>setFile(e.target.files[0]||null)}/>
      {projects&&<Select aria-label="导入可见范围" value={projectId} disabled={busy} onChange={setProjectId} style={{width:'100%'}}
        options={[{value:'',label:'BU 共享'},...projects.map(project=>({value:project.id,label:project.name}))]}/>}
    </Space>}
  </Modal>;
}
