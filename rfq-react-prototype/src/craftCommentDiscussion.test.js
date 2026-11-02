import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {createCraftProjectEditor} from './craftEditorBridge.js';

for(const engine of ['wordcraft','pdfcraft'])test(`${engine} margin opens a single right-side thread and retains exact native anchors`,async()=>{
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableIframePageLoading:true,disableJavaScriptEvaluation:true,disableCSSFileLoading:true}});
  const document=window.document;document.write(await readFile(new URL('../../demos/craft-review/site/classic.html',import.meta.url),'utf8'));
  Object.assign(globalThis,{window,document,location:window.location,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});
  const source={projectId:'P',fileId:'F',sourceVersion:'V1'},user={id:'actor',name:'Alex'};
  const rows=[{id:'R',projectId:'P',sourceFileId:'F',sourceVersion:'V1',original:'Unique clause with exact selected words',sourcePage:1}];
  let context={rows,comments:[],people:[user],canEditRow:()=>true,selectedAnchor:{...source,requirementId:'R'}};
  const note=(id,text,quote='exact selected words')=>({id,nativeKey:`native:${id}`,text,quote,author:'Alex',color:0,ranges:[],replies:[]});
  let notes=[{...note(1,'Existing text'),clauseId:'R'},note(2,'')],applied=0,editRequest=0,editing=null,bridge;
  const commands=[],opened=[],errors=[],states=[],unlinked=[],published=[];let dirty=0;
  const frame=document.getElementById('word-frame');
  const snapshot=()=>({document:'session',fileName:'file',applied,author:'Alex',editable:true,active:null,formatting:false,pages:[],clip:null,notes:structuredClone(notes),source:{selectedId:'R',status:'matched'},edit:editing,editRequest});
  const send=(kind,payload)=>window.dispatchEvent(new window.MessageEvent('message',{origin:location.origin,source:native,data:{type:engine+':'+kind,payload:JSON.stringify(payload)}}));
  const native={postMessage(message){
    if(message.type===engine+':open'){queueMicrotask(()=>send('reviewState',snapshot()));return;}
    const request=JSON.parse(message.payload);commands.push(request);applied=request.request;let result={};
    if(request.action==='new'){notes.push(note(3,''));result={id:3};}
    if(request.action==='delete')notes=notes.filter(note=>note.id!==request.params.id);
    if(request.action==='upsert'){const n=notes.find(n=>n.id===request.params.id);Object.assign(n,request.params);result={id:n.id,nativeKey:n.nativeKey,replies:[]};}
    queueMicrotask(()=>{send('reviewResult',{request:request.request,ok:true,result});send('reviewState',snapshot());});
  }};
  Object.defineProperty(frame,'contentWindow',{value:native});
  const tick=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
  bridge=createCraftProjectEditor({frame,root:document.getElementById('original-comments'),tools:document.getElementById('review-tools'),source,reference:{id:'backend'},user,engine,getContext:()=>context,
    onCommentsChange:update=>{published.push({update,before:context.comments});context={...context,comments:update(context.comments)};},onUnlinkedComment:value=>unlinked.push(value),onState:state=>states.push(state),onSelectComment:(id,anchor,options)=>opened.push({id,anchor,options}),onError:message=>errors.push(message),onDirty:()=>dirty++});
  try{
    bridge.open('file',new ArrayBuffer(0));send('ready',{});await tick();
    assert.equal(context.comments.length,1,'unopened existing empty notes stay out of collaboration');
    assert.equal(document.querySelectorAll('textarea,[data-edit],[data-reply],[data-menu]').length,0,'project margin has no full editing controls');
    const existing=context.comments[0],before=dirty;
    document.querySelector('[data-open-discussion="1"]').click();await tick();
    assert.equal(opened.at(-1).id,existing.id);assert.equal(opened.at(-1).options.edit,false);
    assert.equal(dirty,before,'opening a margin summary does not dirty the file');
    document.querySelector('#review-tools [data-new]').click();await tick();
    const draft=context.comments.find(c=>c.nativeRef.key==='native:3');assert.ok(draft);
    assert.equal(draft.quote,'exact selected words');assert.equal(draft.anchor.requirementId,'R');
    assert.equal(opened.at(-1).id,draft.id);assert.equal(opened.at(-1).options.edit,true);
    assert.equal(opened.filter(item=>item.id===draft.id).length,1);
    assert.equal(context.comments.length,2,'the new native note is bound rather than duplicated');
    assert.equal(commands.filter(c=>c.action==='upsert').length,0,'empty native draft keeps its original anchor');
    context={...context,comments:context.comments.map(c=>c.id===draft.id?{...c,text:'Written on the right'}:c)};bridge.refresh();await tick();
    assert.equal(notes.find(n=>n.id===3).text,'Written on the right');assert.equal(notes.length,3);
    const count=opened.length;send('reviewState',snapshot());await tick();assert.equal(opened.length,count,'geometry echoes do not reopen editors');
    editRequest++;editing=1;send('reviewState',snapshot());await tick();
    assert.equal(opened.at(-1).id,existing.id);assert.equal(opened.at(-1).options.edit,true);
    const selectsBefore=commands.filter(command=>command.action==='select').length;
    assert.equal(bridge.openFileComment('native:2',{locate:true}),true);await tick();
    assert.equal(commands.filter(command=>command.action==='select').length,selectsBefore+1,'a summary in the shared column locates its original native anchor');
    assert.equal(commands.filter(command=>command.action==='select').at(-1).params.id,2);
    assert.ok(states.at(-1).unlinked.some(note=>note.nativeKey==='native:2'),'an explicitly clicked pre-existing empty note offers association');
    assert.equal(bridge.associate('native:2','R'),true);await tick();
    assert.equal(opened.at(-1).id,context.comments.find(c=>c.nativeRef.key==='native:2').id);
    context={...context,rows:[...rows,{...rows[0],id:'DUP'}]};
    notes.push(note(4,''));send('reviewState',snapshot());await tick();
    assert.equal(context.comments.some(c=>c.nativeRef.key==='native:4'),false,'an ambiguous fresh quote cannot attach to the selected clause');
    assert.equal(unlinked.at(-1)?.note.nativeKey,'native:4','unlinked draft opens a right-side file thread without guessing a clause');
    assert.equal(unlinked.at(-1).note.canDelete,true,'creator can cancel a new draft whose creation the native engine authorized');
    await unlinked.at(-1).onAction('delete');await tick();assert.equal(notes.some(n=>n.id===4),false);
    for(const [id,quote] of [[6,''],[7,'outside every clause']]){
      notes.push(note(id,'',quote));send('reviewState',snapshot());await tick();
      assert.equal(unlinked.at(-1).note.nativeKey,`native:${id}`);
      await unlinked.at(-1).onAction('delete');await tick();assert.equal(notes.some(n=>n.id===id),false);
      assert.equal(context.comments.some(c=>c.nativeRef.key===`native:${id}`),false);
    }
    notes.push(note(4,''));send('reviewState',snapshot());await tick();
    assert.equal(bridge.associate('native:4','R'),true);await tick();
    assert.equal(opened.at(-1).id,context.comments.find(c=>c.nativeRef.key==='native:4').id);
    notes.push({...note(8,'External unlinked','outside'),author:'Other'});send('reviewState',snapshot());await tick();
    assert.equal(bridge.openFileComment('native:8'),true);await tick();const readThread=unlinked.at(-1);
    assert.equal(readThread.note.canDelete,false);await assert.rejects(readThread.onAction('delete'),/权限|无权/);
    notes.push({...note(9,'Another outside thread','outside'),author:'Other'});send('reviewState',snapshot());await tick();
    bridge.openFileComment('native:9');await tick();readThread.onClose();
    assert.equal(unlinked.at(-1)?.note?.nativeKey,'native:9','a stale close callback cannot close a newly selected file thread');
    bridge.openFileComment('native:8');await tick();
    context={...context,editDocument:true};bridge.refresh();await tick();
    assert.equal(unlinked.at(-1).note.canDelete,true,'document manager retains deletion of a foreign unlinked note');
    send('reviewState',{...snapshot(),editable:false});await tick();
    assert.equal(unlinked.at(-1).note.canDelete,false,'native file protection also disables right-side file actions');
    await assert.rejects(unlinked.at(-1).onAction('delete'),/无权/);
    context={...context,editDocument:true,canEditRow:()=>true,comments:context.comments.map(c=>c.id===existing.id?{...c,nativeDeleted:true,nativeRef:{...c.nativeRef,state:'delete-pending'}}:c)};bridge.refresh();await tick();
    assert.equal(notes.some(n=>n.id===1),false);
    const reuseUpdate=published.length;
    notes.push(note(1,'','outside every clause'));send('reviewState',snapshot());await tick();
    assert.equal(context.comments.find(c=>c.id===existing.id).nativeDeleted,true,'reused native ID cannot revive a deleted discussion');
    assert.equal(unlinked.at(-1).note.nativeKey,'native:1','new note does not inherit an old clause association');
    const deferred=published[reuseUpdate];assert.ok(deferred);
    assert.equal(deferred.update(deferred.before).find(c=>c.id===existing.id).nativeRef.key,undefined,'a deferred page update retains the fresh-note boundary');
    assert.equal(bridge.checkpointCovers({document:'session',applied,notes:structuredClone(notes)}),true,'archived deletion does not block file checkpoints');
    await unlinked.at(-1).onAction('delete');await tick();
    send('reviewState',snapshot());await tick();
    bridge.openFileComment('native:8');await tick();
    await unlinked.at(-1).onAction('delete');await tick();assert.equal(notes.some(n=>n.id===8),false);
    context={...context,editDocument:false,canEditRow:()=>false};bridge.refresh();await tick();
    notes.push(note(5,''));send('reviewState',{...snapshot(),editable:false});await tick();
    assert.equal(context.comments.some(c=>c.nativeRef.key==='native:5'),false);
    notes.push(note(10,'Read-only outside','outside'));send('reviewState',{...snapshot(),editable:false});await tick();
    bridge.openFileComment('native:10');await tick();
    assert.equal(unlinked.at(-1).note.canDelete,false);assert.deepEqual(unlinked.at(-1).targets,[]);
    await assert.rejects(unlinked.at(-1).onAction('delete'),/无权/);
    const records=structuredClone(context.comments),openCount=opened.length;
    send('reviewState',{...snapshot(),document:'stale',notes:[note(90,'')]});await tick();
    assert.deepEqual(context.comments,records);assert.equal(opened.length,openCount);
    bridge.destroy();await assert.rejects(readThread.onAction('delete'),/关闭|变化/);
  }finally{bridge.destroy();await window.happyDOM.cancelAsync();}
});
