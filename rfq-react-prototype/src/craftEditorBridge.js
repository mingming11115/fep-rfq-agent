import {createOriginalComments} from '../../demos/craft-review/site/original-comments.js';
import {officeClauseTargets} from './officeClauseLink.js';
import {makeSourceAnchor} from './documentAnchors.js';
import {mergeNativeComments,planCraftWrites,applyCraftBinding,markCraftSaved,craftCommentFingerprint} from './craftCommentSync.js';

const changed=(a,b)=>JSON.stringify(a)!==JSON.stringify(b);
const modifying=new Set(['draft','replyDraft','reply','delete','resolve','new','upsert']);

export function createCraftProjectEditor({frame,root,tools,source,reference,revision=0,user,engine,getContext,
  onCommentsChange,onState=()=>{},onError=()=>{},onDirty=()=>{},onSave=()=>{},onSelectAnchor=()=>{},onSelectComment=()=>{}}){
  let alive=true,ready=false,file=null,sent=false,boundToken='',snapshot=null,busy=false,scheduled=false;
  let configuration='',failedConfiguration='',minimumApplied=0,lastMutatingSequence=0,lastActive=null,lastBusinessSelection='',lastState='';
  const associations={},failures=new Map();
  const context=()=>({...getContext(),source,documentId:reference.id,revision,engine,actor:user,associations});
  const publish=update=>{
    const current=getContext().comments||[],next=update(current);
    if(changed(current,next))onCommentsChange(update);
  };
  function permissions(note){
    const c=getContext(),comment=(c.comments||[]).find(item=>item.nativeRef?.documentId===reference.id&&item.nativeRef.key===note.nativeKey);
    const id=comment?.anchor?.requirementId||associations[note.nativeKey]||note.clauseId,row=c.rows.find(row=>row.id===id);
    const canWrite=row?Boolean(c.canEditRow?.(row,comment)):Boolean(c.editDocument);
    const own=comment?comment.createdBy===user.id:note.author===user.name;
    return {canEdit:canWrite&&own,canReply:canWrite,canResolve:canWrite,canDelete:canWrite&&(own||c.editDocument)};
  }
  const surface=createOriginalComments({frame,root,tools,namespace:engine,documentFormat:engine==='pdfcraft'?'PDF':'DOCX',supportsFormatting:engine==='wordcraft',
    onStatus:message=>{if(alive)onError(message);},onDirty:()=>{if(alive)onDirty();},
    onSelect:(_id,note)=>{const c=(getContext().comments||[]).find(c=>c.nativeRef?.documentId===reference.id&&c.nativeRef.key===note?.nativeKey);if(c&&!c.nativeDeleted)onSelectComment(c.id,c.anchor);},
    beforeCommand:(action,params)=>{
      if(!modifying.has(action))return;
      const c=getContext();let blocked;
      if(action==='upsert'){const row=c.rows.find(r=>r.id===params.clauseId);if(!row||!c.canEditRow?.(row))blocked='当前身份无该条款的批注权限';}
      else if(action==='new'){const row=c.rows.find(r=>r.id===c.selectedAnchor?.requirementId);if(!c.editDocument&&!c.canEditRow?.(row))blocked='当前身份只读，不能新增批注';}
      else{
        const note=snapshot?.notes.find(n=>n.id===params.id);
        if(!note)blocked='批注已不存在，请重新定位';
        else{const p=permissions(note),key=action==='draft'?'canEdit':action==='delete'?'canDelete':action==='resolve'?'canResolve':'canReply';if(!p[key])blocked='当前身份无权修改这条批注';}
      }
      if(blocked)return blocked;
      lastMutatingSequence=surface.sequence+1;
    }});

  function matchesCheckpoint(comment,review){
    const key=comment.nativeRef?.key;
    if(!key||comment.nativeRef.documentId!==reference.id)return false;
    const notes=review.notes.filter(note=>note.nativeKey===key);
    if(comment.nativeDeleted)return notes.length===0;
    if(notes.length!==1)return false;
    const note=notes[0],author=comment.nativeAuthor??comment.nativeRef.base?.author;
    if(note.text!==comment.text||note.author!==author||Boolean(note.resolved)!==(comment.status==='已解决'))return false;
    const replies=comment.replies||[],nativeReplies=note.replies||[],seen=new Set();
    if(replies.length!==nativeReplies.length)return false;
    return replies.every(reply=>{
      const replyKey=reply.nativeRef?.key;
      if(!replyKey||seen.has(replyKey))return false;
      seen.add(replyKey);
      const matches=nativeReplies.filter(native=>native.nativeKey===replyKey);
      const replyAuthor=reply.nativeAuthor??comment.nativeRef.base?.replies?.find(base=>base.key===replyKey)?.author;
      return matches.length===1&&matches[0].text===reply.text&&matches[0].author===replyAuthor;
    });
  }
  function checkpointCovers(review){
    if(!alive||!boundToken||review?.document!==boundToken||!Array.isArray(review.notes)||!Number.isSafeInteger(review.applied)||review.applied<lastMutatingSequence)return false;
    return (getContext().comments||[]).every(comment=>{
      const anchor=comment.anchor;
      if(!anchor||anchor.projectId!==source.projectId||anchor.fileId!==source.fileId||String(anchor.sourceVersion)!==String(source.sourceVersion)||(comment.nativeRef?.documentId&&comment.nativeRef.documentId!==reference.id))return true;
      if(!comment.nativeDeleted&&!String(comment.text||'').trim()&&!(comment.replies||[]).some(reply=>String(reply.text||'').trim()))return true;
      return matchesCheckpoint(comment,review);
    });
  }

  function state(){
    if(!alive)return;
    const c=context(),merged=snapshot?mergeNativeComments({...c,snapshot}):{unlinked:[],conflicts:[]};
    const value={ready:Boolean(boundToken),synchronizing:busy,source:snapshot?.source||{status:'waiting'},
      unlinked:(merged.unlinked||[]).map(({id,nativeKey,text,author,reason})=>({id,nativeKey,text,author,reason})),conflicts:merged.conflicts||[]};
    const key=JSON.stringify(value);if(key!==lastState){lastState=key;onState(value);}
  }
  function schedule(){if(!alive||scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;void pump();});}
  function configurationFor(){
    const c=getContext();
    const targets=officeClauseTargets(source,c.rows).map(({anchor,tag,...target})=>({...target,page:Number.isFinite(Number(anchor.locator.page))?Math.max(0,Number(anchor.locator.page)-1):null,editable:Boolean(c.canEditRow?.(c.rows.find(r=>r.id===target.id)))}));
    const linked=(c.comments||[]).filter(comment=>comment.nativeRef?.documentId===reference.id&&comment.nativeRef.key&&!comment.nativeDeleted).map(comment=>({nativeKey:comment.nativeRef.key,clauseId:comment.anchor.requirementId,...permissions({nativeKey:comment.nativeRef.key})}));
    for(const [nativeKey,clauseId] of Object.entries(associations))if(!linked.some(item=>item.nativeKey===nativeKey))linked.push({nativeKey,clauseId});
    return {editable:targets.some(t=>t.editable)||Boolean(c.editDocument),editDocument:Boolean(c.editDocument),targets,selectedId:c.selectedAnchor?.requirementId,associations:linked};
  }
  async function command(action,params){
    const pending=surface.command(action,params);minimumApplied=Math.max(minimumApplied,surface.sequence);
    return pending;
  }
  async function pump(){
    if(!alive||busy||!snapshot||!boundToken||(snapshot.applied||0)<minimumApplied)return;
    busy=true;
    try{
      const config=configurationFor(),key=JSON.stringify(config);
      if(configuration!==key){
        if(failedConfiguration===key)return;
        try{await command('configure',config);configuration=key;failedConfiguration='';}
        catch(error){failedConfiguration=key;throw error;}
        if(!alive||configuration!==JSON.stringify(configurationFor())||(snapshot.applied||0)<minimumApplied)return;
      }
      const merged=mergeNativeComments({...context(),snapshot});
      if(merged.changed)publish(comments=>mergeNativeComments({...context(),comments,snapshot}).comments);
      const operations=planCraftWrites({...context(),snapshot});
      for(const operation of operations){
        if(!alive)return;
        const signature=JSON.stringify(operation.params);if(failures.get(operation.commentId)===signature)continue;
        try{
          onDirty();
          const result=await command(operation.action,operation.params);
          if(!alive)return;
          if(operation.action==='upsert')publish(comments=>applyCraftBinding(comments,operation.commentId,{...result,projection:operation.projection},context()));
          failures.delete(operation.commentId);
        }catch(error){failures.set(operation.commentId,signature);onError('批注尚未写入原文件：'+error.message);}
      }
      const c=getContext();
      if(c.activeCommentId&&c.activeCommentId!==lastBusinessSelection){
        const comment=c.comments.find(item=>item.id===c.activeCommentId),note=snapshot.notes.find(note=>note.nativeKey===comment?.nativeRef?.key);
        if(note){lastBusinessSelection=c.activeCommentId;await command('select',{id:note.id});}
      }
      if(!c.activeCommentId)lastBusinessSelection='';
    }catch(error){if(alive)onError(error.message);}
    finally{
      busy=false;state();
      const nextConfiguration=alive?JSON.stringify(configurationFor()):'';
      if(alive&&snapshot&&(snapshot.applied||0)>=minimumApplied&&configuration!==nextConfiguration&&failedConfiguration!==nextConfiguration)schedule();
    }
  }
  function sendFile(){
    if(!ready||!file||sent)return;
    sent=true;
    // Keep the local bytes for retry; transfer a copy into the editor.
    const bytes=file.bytes.slice(0);frame.contentWindow.postMessage({type:engine+':open',name:file.name,bytes},location.origin,[bytes]);
  }
  function receive(event){
    if(!alive||event.origin!==location.origin||event.source!==frame.contentWindow)return;
    const data=event.data;if(typeof data?.type!=='string'||!data.type.startsWith(engine+':'))return;
    const kind=data.type.slice(engine.length+1);
    if(kind==='ready'){ready=true;sendFile();return;}
    if(kind==='failed'){onError('编辑器启动失败：'+(data.error||'请检查静态资源'));return;}
    if(kind==='dirty'){if(data.dirty)onDirty();return;}
    if(kind==='save'){
      const bytes=data.bytes instanceof ArrayBuffer?data.bytes:ArrayBuffer.isView(data.bytes)?data.bytes.buffer.slice(data.bytes.byteOffset,data.bytes.byteOffset+data.bytes.byteLength):null;
      if(!bytes||!boundToken||!file||data.name!==file.name){onError('编辑器文件与当前项目来源不一致，已停止保存');return;}
      let review=data.review;try{if(typeof review==='string')review=JSON.parse(review);}catch{review=null;}
      if(review?.document&&review.document!==boundToken){onError('保存来源已变化，当前文件未被覆盖');return;}
      void Promise.resolve(onSave({name:data.name,bytes,review,document:boundToken})).catch(error=>{if(alive)onError(error.message);});return;
    }
    if(kind!=='reviewState'&&kind!=='reviewResult')return;
    let payload;try{payload=typeof data.payload==='string'?JSON.parse(data.payload):data.payload;}catch{onError('批注数据无法读取，请保留修改后重试');return;}
    if(kind==='reviewResult'){surface.receive(kind,payload);return;}
    if(!sent||!payload?.document||!Array.isArray(payload.notes)||payload.fileName!==file?.name)return;
    if(boundToken&&payload.document!==boundToken){onError('编辑器已切换到其他文件，请从项目入口打开原件');return;}
    if(snapshot&&(payload.applied||0)<(snapshot.applied||0))return;
    boundToken=payload.document;
    const previous=snapshot;snapshot=payload;
    surface.receive(kind,{...payload,notes:payload.notes.map(note=>({...note,...permissions(note)}))});
    if(configuration&&payload.source?.status==='matched'&&payload.source.selectedId!==getContext().selectedAnchor?.requirementId){
      const row=getContext().rows.find(row=>row.id===payload.source.selectedId);
      if(row&&onSelectAnchor(makeSourceAnchor(row))===false)void command('locate',{id:getContext().selectedAnchor?.requirementId}).catch(()=>{});
    }
    if(configuration&&payload.active!==lastActive&&previous){
      const note=payload.notes.find(note=>note.id===payload.active),comment=getContext().comments.find(c=>c.nativeRef?.documentId===reference.id&&c.nativeRef.key===note?.nativeKey);
      if(comment&&!comment.nativeDeleted)onSelectComment(comment.id,comment.anchor);
    }
    lastActive=payload.active;schedule();state();
  }
  window.addEventListener('message',receive);
  return {
    checkpointCovers,
    open(name,bytes){file={name,bytes};sendFile();},refresh(){failedConfiguration='';schedule();},
    save:()=>command('save',{}),setVisible:value=>surface.setVisible(value),
    locate:()=>command('locate',{id:getContext().selectedAnchor?.requirementId}),
    retry(){failures.clear();configuration='';failedConfiguration='';schedule();},
    associate(nativeKey,clauseId){
      if(!alive)return false;const c=getContext(),row=c.rows.find(row=>row.id===clauseId),note=snapshot?.notes.find(note=>note.nativeKey===nativeKey);
      if(!row||!note||!officeClauseTargets(source,[row]).length||!c.canEditRow?.(row))return false;
      associations[nativeKey]=clauseId;publish(comments=>mergeNativeComments({...context(),comments,snapshot}).comments);schedule();state();onDirty();return true;
    },
    markSaved(meta,review){
      revision=meta.revision;
      if(review?.document===boundToken&&Array.isArray(review.notes)){
        const fingerprints={};
        for(const comment of getContext().comments||[]){
          if(!matchesCheckpoint(comment,review))continue;
          fingerprints[comment.id]=craftCommentFingerprint(comment,context());
        }
        publish(comments=>markCraftSaved(comments,{documentId:reference.id,revision, fingerprints}));
      }
      state();
    },
    destroy(){alive=false;window.removeEventListener('message',receive);surface.destroy();},
  };
}
