import React,{useState} from 'react';
import {Alert,Button,Input,Modal,Select,Space,Table} from 'antd';
import {versionKey} from './CapabilityLibraryFields';
import {useLibraryMutation} from '../useLibraryMutation';

export default function LibraryEvidenceDialog({rows,projects,library,rights,actorId,refresh,toast,onClose}){
  const [form,setForm]=useState(null),[action,setAction]=useState(null),[reason,setReason]=useState('');
  const [error,setError]=useState('');
  const {busy,run}=useLibraryMutation(refresh,toast);
  const start=row=>{setError('');setForm(row?{...row}:{name:'',source:'',location:'',conditions:'',expiry:'',projectId:''});};
  const field=(label,key,type)=><label className="field"><span>{label}</span><Input aria-label={label}
    type={type} value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>;
  function save(){
    if(!['name','source','location'].every(key=>form[key]?.trim())) { return setError('请填写证据名称、来源和原文位置'); }
    setError('');
    run(()=>library.saveEvidence(form,Boolean(form.id)),()=>{setForm(null);toast?.('证据版本已登记');},cause=>setError(cause.message));
  }
  function review(){
    if(action.kind==='revoke'&&!reason.trim()) { return setError('请填写撤销原因'); }
    setError('');
    run(()=>library.transition('evidence',action.row,action.kind,reason),()=>{setAction(null);toast?.('证据状态已更新');},cause=>setError(cause.message));
  }
  const startAction=(row,kind)=>{setError('');setReason('');setAction({row,kind});};
  return <Modal open title="能力证据" width={860} onCancel={busy?undefined:onClose} maskClosable={!busy}
    footer={form||action?<><Button disabled={busy} onClick={()=>{setForm(null);setAction(null);setError('');}}>返回列表</Button>
      <Button type="primary" loading={busy} onClick={form?save:review}>{form?'保存证据':action.kind==='verify'?'确认核对':'确认撤销'}</Button></>:<Button onClick={onClose}>关闭</Button>}>
    {error&&<Alert type="error" showIcon message={error}/>}
    {form?<div className="form-grid">
      {field('证据名称','name')}{field('资料来源','source')}{field('原文位置','location')}{field('有效期','expiry','date')}{field('适用条件','conditions')}
      <label className="field"><span>可见范围</span><Select aria-label="证据可见范围" disabled={Boolean(form.id)} value={form.projectId||''}
        options={[{value:'',label:'BU 共享'},...projects.map(row=>({value:row.id,label:row.name}))]} onChange={projectId=>setForm({...form,projectId})}/></label>
    </div>:action?<Space direction="vertical" style={{width:'100%'}}>
      <p>{action.row.name} · v{action.row.version}</p>
      <p>{action.row.source} · {action.row.location}</p>
      <Input.TextArea aria-label="操作原因" value={reason} onChange={event=>setReason(event.target.value)}/>
    </Space>:<>
      <Button type="primary" disabled={!rights.edit} onClick={()=>start(null)}>登记证据</Button>
      <Table rowKey={versionKey} dataSource={rows} pagination={{pageSize:6}} columns={[
        {title:'证据',dataIndex:'name'},{title:'版本',dataIndex:'version'},{title:'状态',dataIndex:'status'},
        {title:'操作',render:(_,row)=><Space wrap>
          {rights.edit&&['BU共享','仅当前项目'].includes(row.scope)&&!rows.some(next=>next.id===row.id&&next.version>row.version)&&<Button onClick={()=>start(row)}>登记新版</Button>}
          {rights.approve&&row.status==='待核对'&&row.registeredById&&row.registeredById!==actorId&&<Button onClick={()=>startAction(row,'verify')}>确认核对</Button>}
          {rights.approve&&row.status==='有效'&&<Button danger onClick={()=>startAction(row,'revoke')}>撤销</Button>}
        </Space>},
      ]}/>
    </>}
  </Modal>;
}
