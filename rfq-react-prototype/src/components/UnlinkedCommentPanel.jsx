import React,{useEffect,useRef,useState} from 'react';
import {Input,Select} from 'antd';
import {UiButton,UiTag} from './AntContent';

// These are real file threads, kept separate from collaboration until a clause is chosen.
export default function UnlinkedCommentPanel({value}){
  const {note}=value,panel=useRef(null);
  const [editing,setEditing]=useState(Boolean(value.edit&&note.canEdit)),[text,setText]=useState(note.text||''),[reply,setReply]=useState(''),[target,setTarget]=useState(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const empty=!note.text?.trim()&&!note.replies?.some(item=>item.text?.trim());
  useEffect(()=>{if(!note.canEdit)setEditing(false);},[note.canEdit]);
  useEffect(()=>{if(editing)panel.current?.querySelector('[aria-label="修改未关联文件批注"]')?.focus();},[editing]);
  async function run(action,content){
    if(busy)return;setBusy(true);setError('');
    try{await value.onAction(action,content);if(action==='save')setEditing(false);if(action==='reply')setReply('');}
    catch(cause){setError(cause.message);}finally{setBusy(false);}
  }
  async function associate(){
    if(!target||busy)return;setBusy(true);setError('');
    try{if(!await value.onAssociate(target))throw new Error('当前身份不能关联到该条款，请重新选择。');}
    catch(cause){setError(cause.message);}finally{setBusy(false);}
  }
  return <section className="annotation-panel" aria-label="待关联文件批注" ref={panel}>
    <div className="detail-section-intro"><div><strong>文件批注 · 待关联条款</strong><span>选择对应条款后，同步到协作记录</span></div><UiButton className="text-link" onClick={value.onClose}>收起</UiButton></div>
    <article className="annotation-card active"><UiTag className="badge neutral">{note.resolved?'已解决':'未解决'}</UiTag><blockquote>{note.quote||'此批注没有文字摘录'}</blockquote>
      {editing?<div className="annotation-edit"><Input.TextArea aria-label="修改未关联文件批注" value={text} onChange={event=>setText(event.target.value)} autoSize={{minRows:3,maxRows:8}}/><UiButton className="text-link" disabled={busy} onClick={()=>empty&&note.canDelete?run('delete'):setEditing(false)}>取消</UiButton><UiButton className="text-link" disabled={busy||!text.trim()} onClick={()=>run('save',text.trim())}>保存修改</UiButton></div>:<p>{note.text||'新批注，等待关联或填写'}</p>}
      <small>{note.author}</small>
      <div className="workspace-row-actions">
        {note.canEdit&&!editing&&<UiButton className="text-link" disabled={busy} onClick={()=>{setText(note.text||'');setEditing(true);}}>编辑</UiButton>}
        {note.canResolve&&<UiButton className="text-link" disabled={busy} onClick={()=>run('resolve')}>{note.resolved?'重新打开':'解决'}</UiButton>}
        {note.canDelete&&(!empty||!editing)&&<UiButton className="text-link" disabled={busy} onClick={()=>run('delete')}>{empty?'取消新批注':'删除'}</UiButton>}
      </div>
      {(note.replies||[]).map(item=><div className="annotation-reply" key={item.nativeKey||item.id}>{item.text}<small>{item.author}</small></div>)}
      {note.canReply&&<div className="annotation-reply-form"><Input.TextArea aria-label="回复未关联文件批注" value={reply} onChange={event=>setReply(event.target.value)} autoSize={{minRows:1,maxRows:5}}/><UiButton className="text-link" disabled={busy||!reply.trim()} onClick={()=>run('reply',reply.trim())}>回复</UiButton></div>}
      {!!value.targets.length&&<div className="workspace-row-actions"><Select style={{minWidth:180,maxWidth:'100%'}} aria-label="为当前文件批注选择条款" placeholder="选择对应条款" options={value.targets} value={target} onChange={setTarget}/><UiButton className="text-link" disabled={!target||busy} onClick={associate}>关联并同步</UiButton></div>}
      {error&&<p className="response-error" role="alert">{error}</p>}
    </article>
  </section>;
}
