import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {makeSourceAnchor} from './documentAnchors.js';
import {createCraftProjectEditor} from './craftEditorBridge.js';

test('project editor coordinates native and collaboration comments within one source session',async t=>{
  const window=new Window({url:'http://127.0.0.1:5174',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  const document=window.document;document.write(await readFile(new URL('../../../packages/craft-editors/site/classic.html',import.meta.url),'utf8'));
  Object.assign(globalThis,{window,document,location:window.location,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});
  const source={projectId:'P',fileId:'F',sourceVersion:'V1'},user={id:'actor',name:'Alex'};
  const rows=[{id:'R1',projectId:'P',sourceFileId:'F',sourceVersion:'V1',sourcePage:1,clause:'1',title:'Safety',original:'Exact source'},
    {id:'R2',projectId:'P',sourceFileId:'F',sourceVersion:'V1',sourcePage:2,clause:'2',original:'Other source'}];
  let context={rows,comments:[],people:[user],canEditRow:row=>row.id==='R1',editDocument:false,selectedAnchor:makeSourceAnchor(rows[0])};
  let bridge,notes=[],nextId=10,applied=0,configureFailures=0,outlineVisible=false,editorToolsVisible=false,dirtyCount=0;const calls=[],states=[],errors=[],selected=[],files=[];
  const frame=document.getElementById('word-frame');
  const snapshot=()=>({document:'native-session',fileName:'real.docx',applied,complete:true,author:'Alex',editable:true,formatting:false,outlineVisible,editorToolsControlled:true,editorToolsVisible,headingOutline:{revision:7,items:[{index:0,level:0,text:'Real heading'}]},pages:[],clip:null,active:null,source:{selectedId:'R1',status:'matched'},notes:structuredClone(notes)});
  const send=(type,data={},overrides={})=>window.dispatchEvent(new window.MessageEvent('message',{origin:location.origin,source:native,data:{type:'wordcraft:'+type,...data},...overrides}));
  const native={postMessage(message){
    calls.push(message);if(message.type==='wordcraft:open'){queueMicrotask(()=>send('reviewState',{payload:JSON.stringify(snapshot())}));return;}
    if(message.type!=='wordcraft:review')return;const request=JSON.parse(message.payload);applied=request.request;let result={};
    if(request.action==='outline')outlineVisible=request.params.visible;
    if(request.action==='tools')editorToolsVisible=request.params.visible;
    if(request.action==='configure'&&configureFailures>0){
      configureFailures--;
      queueMicrotask(()=>{send('reviewResult',{payload:JSON.stringify({request:request.request,ok:false,error:'Configuration rejected'})});send('reviewState',{payload:JSON.stringify(snapshot())});});
      return;
    }
    if(request.action==='upsert'){
      const p=request.params;let note=notes.find(n=>n.id===p.id);
      if(!note){const id=nextId++;note={id,nativeKey:'word:'+id,color:0,ranges:[],replies:[]};notes.push(note);}
      Object.assign(note,{text:p.text,author:p.author,quote:p.quote,clauseId:p.clauseId,resolved:p.resolved});
      note.replies=p.replies.map(r=>{const id=r.id||nextId++;return {...r,id,nativeKey:'word:'+id};});
      result={id:note.id,nativeKey:note.nativeKey,replies:note.replies};
    }
    if(request.action==='draft')notes.find(note=>note.id===request.params.id).text=request.params.text;
    queueMicrotask(()=>{send('reviewResult',{payload:JSON.stringify({request:request.request,ok:true,result})});send('reviewState',{payload:JSON.stringify(snapshot())});});
  }};
  Object.defineProperty(frame,'contentWindow',{value:native});
  bridge=createCraftProjectEditor({frame,root:document.getElementById('original-comments'),tools:document.getElementById('review-tools'),
    source,reference:{id:'backend-file'},revision:0,user,engine:'wordcraft',getContext:()=>context,
    onCommentsChange:update=>{context={...context,comments:typeof update==='function'?update(context.comments):update};},
    onState:state=>states.push(state),onError:message=>errors.push(message),onDirty:()=>dirtyCount++,onSave:file=>files.push(file),
    onSelectAnchor:anchor=>selected.push(anchor.requirementId),onSelectComment:(id)=>selected.push(id)});
  const tick=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
  await t.test('only its same-origin iframe can open the file and provide project state',async()=>{
    bridge.open('real.docx',new Uint8Array([1,2,3]).buffer);
    send('ready',{}, {source:{}});send('ready',{}, {origin:'https://foreign.invalid'});await tick();assert.equal(calls.length,0);
    send('ready');await tick();assert.equal(calls[0].type,'wordcraft:open');
    const configure=calls.filter(c=>c.type==='wordcraft:review').map(c=>JSON.parse(c.payload)).find(c=>c.action==='configure');
    assert.equal(configure.params.targets[0].page,0);assert.equal(configure.params.targets[0].editable,true);assert.equal(configure.params.targets[1].editable,false);
    assert.equal(configure.params.targets[0].title,'Safety');
  });
  await t.test('a separate outline changes viewing state without dirtying or saving the document',async()=>{
    const before=dirtyCount;
    await bridge.setOutline(true);await tick();
    assert.equal(states.at(-1).outlineVisible,true);
    await bridge.setOutline(false);await tick();
    assert.equal(states.at(-1).outlineVisible,false);
    assert.equal(dirtyCount,before);
    assert.equal(files.length,0);
    assert.equal(context.comments.length,0);
    assert.equal(calls.filter(c=>c.type==='wordcraft:open').length,1);
  });
  await t.test('Word tools are a view-only native toggle',async()=>{
    const before=dirtyCount;
    assert.equal(states.at(-1).editorToolsVisible,false);
    assert.equal(states.at(-1).editorToolsControlled,true);
    await bridge.setEditorTools(true);await tick();assert.equal(states.at(-1).editorToolsVisible,true);
    await bridge.setEditorTools(false);await tick();assert.equal(states.at(-1).editorToolsVisible,false);
    assert.equal(dirtyCount,before);assert.equal(files.length,0);
    assert.equal(calls.filter(c=>c.type==='wordcraft:open').length,1);
  });
  await t.test('host headings keep their source identity and reject stale navigation without saving',async()=>{
    const before=dirtyCount;
    assert.deepEqual(states.at(-1).documentOutline,{document:'native-session',revision:7,items:[{index:0,level:0,text:'Real heading'}],ready:true,supported:true});
    await bridge.navigateHeading({document:'native-session',revision:7,index:0});await tick();
    const request=calls.filter(call=>call.type==='wordcraft:review').map(call=>JSON.parse(call.payload)).find(call=>call.action==='heading');
    assert.deepEqual(request.params,{revision:7,index:0});
    await assert.rejects(bridge.navigateHeading({document:'previous-file',revision:7,index:0}),/目录已更新/);
    await assert.rejects(bridge.navigateHeading({document:'native-session',revision:6,index:0}),/目录已更新/);
    assert.equal(calls.filter(call=>call.type==='wordcraft:review'&&JSON.parse(call.payload).action==='heading').length,1);
    assert.equal(dirtyCount,before);assert.equal(files.length,0);
  });
  await t.test('native text and replies become one collaboration thread and repeated echoes stay idempotent',async()=>{
    notes=[{id:1,nativeKey:'word:1',author:'Alex',text:'Native discussion',quote:'Exact source',clauseId:'R1',resolved:false,color:0,ranges:[],replies:[{id:2,nativeKey:'word:2',author:'Alex',text:'Native reply'}]}];
    send('reviewState',{payload:JSON.stringify(snapshot())});await tick();
    assert.equal(context.comments.length,1);assert.equal(context.comments[0].text,'Native discussion');assert.equal(context.comments[0].replies.length,1);
    send('reviewState',{payload:JSON.stringify(snapshot())});await tick();assert.equal(context.comments.length,1);assert.equal(context.comments[0].replies.length,1);
  });
  await t.test('failed configuration waits for explicit refresh then retries before merging or writing',async()=>{
    const configureCount=()=>calls.filter(c=>c.type==='wordcraft:review').map(c=>JSON.parse(c.payload)).filter(c=>c.action==='configure').length;
    const before=configureCount();
    context={...context,canEditRow:()=>false};configureFailures=1;
    notes[0].text='Native update while configuration failed';
    send('reviewState',{payload:JSON.stringify(snapshot())});await tick();
    assert.equal(configureCount(),before+1);
    assert.equal(context.comments[0].text,'Native discussion');
    send('reviewState',{payload:JSON.stringify(snapshot())});await tick();
    assert.equal(configureCount(),before+1);
    assert.equal(context.comments[0].text,'Native discussion');
    bridge.refresh();await tick();
    assert.equal(configureCount(),before+2);
    assert.equal(context.comments[0].text,'Native update while configuration failed');
    context={...context,canEditRow:row=>row.id==='R1'};bridge.refresh();await tick();
  });
  await t.test('right-side edits and replies update the real native thread once',async()=>{
    const comment=context.comments[0];context={...context,comments:[{...comment,text:'Edited on the right',replies:[...comment.replies,{text:'Business reply',by:'actor',at:'today'}]}]};
    bridge.refresh();await tick();
    assert.equal(notes[0].text,'Edited on the right');assert.equal(notes[0].replies.length,2);
    const writes=calls.filter(c=>c.type==='wordcraft:review').map(c=>JSON.parse(c.payload)).filter(c=>c.action==='upsert').length;
    bridge.refresh();send('reviewState',{payload:JSON.stringify(snapshot())});await tick();
    assert.equal(calls.filter(c=>c.type==='wordcraft:review').map(c=>JSON.parse(c.payload)).filter(c=>c.action==='upsert').length,writes);
  });
  await t.test('unlinked file comments wait for explicit permitted clause association',async()=>{
    notes.push({id:5,nativeKey:'word:5',author:'Alex',text:'Unparsed source',quote:'',resolved:false,color:1,ranges:[],replies:[]});
    send('reviewState',{payload:JSON.stringify(snapshot())});await tick();assert.equal(context.comments.length,1);
    assert.equal(states.at(-1).unlinked.length,1);
    assert.equal(bridge.associate('word:5','R2'),false);assert.equal(context.comments.length,1);
    assert.equal(bridge.associate('word:5','R1'),true);await tick();assert.equal(context.comments.length,2);
  });
  await t.test('native save forwards bytes with their serialized review checkpoint',async()=>{
    const review={document:'native-session',applied,notes:structuredClone(notes)};send('save',{name:'real.docx',bytes:new Uint8Array([9,8]).buffer,review});await tick();
    assert.equal(files.length,1);assert.deepEqual([...new Uint8Array(files[0].bytes)],[9,8]);assert.equal(files[0].review.document,'native-session');
  });
  await t.test('foreign file names, native tokens, and save checkpoints cannot mutate the bound project',async()=>{
    const before=structuredClone(context.comments),saves=files.length;
    const foreign=[{...notes[0],nativeKey:'word:foreign',text:'Foreign discussion'}];
    send('reviewState',{payload:JSON.stringify({...snapshot(),fileName:'another.docx',notes:foreign})});
    send('reviewState',{payload:JSON.stringify({...snapshot(),document:'another-session',notes:foreign})});
    send('save',{name:'another.docx',bytes:new Uint8Array([7]).buffer,review:{document:'native-session',notes:foreign}});
    send('save',{name:'real.docx',bytes:new Uint8Array([7]).buffer,review:{document:'another-session',notes:foreign}});
    await tick();
    assert.deepEqual(context.comments,before);
    assert.equal(files.length,saves);
  });
  await t.test('right-side typing before an older save packet arrives invalidates that checkpoint immediately',async()=>{
    const review={document:'native-session',applied,notes:structuredClone(notes)};
    assert.equal(bridge.checkpointCovers(review),true);
    context={...context,comments:context.comments.map(comment=>comment.nativeRef.key==='word:1'?{...comment,text:'Draft typed after byte capture'}:comment)};
    assert.equal(bridge.checkpointCovers(review),false);
    bridge.refresh();await tick();
    send('save',{name:'real.docx',bytes:new Uint8Array([4]).buffer,review});await tick();
    assert.equal(bridge.checkpointCovers(files.at(-1).review),false);
    assert.equal(bridge.checkpointCovers({document:'native-session',applied,notes:structuredClone(notes)}),true);
  });
  await t.test('pending right edits and tombstones must match the exact serialized checkpoint',async()=>{
    const review={document:'native-session',applied,notes:structuredClone(notes)},original=context;
    context={...context,comments:context.comments.map((comment,index)=>index===0?{...comment,text:'Right pending before upsert'}:comment)};
    assert.equal(bridge.checkpointCovers(review),false);
    context={...original,comments:original.comments.map((comment,index)=>index===0?{...comment,nativeDeleted:true}:comment)};
    assert.equal(bridge.checkpointCovers(review),false);
    const deleted={...review,notes:review.notes.filter(note=>note.nativeKey!==original.comments[0].nativeRef.key)};
    assert.equal(bridge.checkpointCovers(deleted),true);
    context=original;
  });
  await t.test('checkpoint checks exclude unrelated sources and backend documents but include unbound pending roots',async()=>{
    const review={document:'native-session',applied,notes:structuredClone(notes)},original=context;
    const pending={...context.comments[0],id:'pending',text:'Pending right discussion',nativeRef:undefined};
    context={...original,comments:[...original.comments,
      {...pending,id:'other-project',anchor:{...pending.anchor,projectId:'OTHER'}},
      {...pending,id:'other-file',anchor:{...pending.anchor,fileId:'OTHER'}},
      {...pending,id:'other-version',anchor:{...pending.anchor,sourceVersion:'OTHER'}},
      {...pending,id:'other-document',nativeRef:{documentId:'another-backend-doc',key:'other-key'}},
    ]};
    assert.equal(bridge.checkpointCovers(review),true);
    context={...context,comments:[...context.comments,pending]};
    assert.equal(bridge.checkpointCovers(review),false);
    context=original;
    assert.equal(bridge.checkpointCovers({...review,document:'another-session'}),false);
    assert.equal(bridge.checkpointCovers({document:review.document,notes:review.notes}),false);
  });
  await t.test('an older save checkpoint cannot mark a newer root author as persisted',async()=>{
    const review={document:'native-session',applied,notes:structuredClone(notes)};
    bridge.markSaved({revision:1},review);
    assert.equal(context.comments[0].nativeRef.state,'saved');
    notes[0].author='Updated root author';
    send('reviewState',{payload:JSON.stringify(snapshot())});await tick();
    assert.equal(context.comments[0].nativeAuthor,'Updated root author');
    bridge.markSaved({revision:2},review);
    assert.notEqual(context.comments[0].nativeRef.state,'saved');
  });
  await t.test('an older save checkpoint cannot mark a newer reply author as persisted',async()=>{
    const review={document:'native-session',applied,notes:structuredClone(notes)};
    bridge.markSaved({revision:3},review);
    assert.equal(context.comments[0].nativeRef.state,'saved');
    notes[0].replies[0].author='Updated reply author';
    send('reviewState',{payload:JSON.stringify(snapshot())});await tick();
    assert.equal(context.comments[0].replies[0].nativeAuthor,'Updated reply author');
    bridge.markSaved({revision:4},review);
    assert.notEqual(context.comments[0].nativeRef.state,'saved');
  });
  await t.test('destroyed project frames cannot change records or start further operations',async()=>{
    const count=context.comments.length;bridge.destroy();notes.push({...notes[0],id:99,nativeKey:'word:99'});
    send('reviewState',{payload:JSON.stringify(snapshot())});bridge.refresh();await tick();assert.equal(context.comments.length,count);
    assert.equal(bridge.associate('word:99','R1'),false);
  });
  await window.happyDOM.cancelAsync();
});
