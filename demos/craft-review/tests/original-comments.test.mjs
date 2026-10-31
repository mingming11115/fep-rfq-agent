import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from '../.cache/dom-qa/node_modules/happy-dom/lib/index.js';
import {createOriginalComments} from '../site/original-comments.js';

test('original Word comment surface uses native state and commands', async t=>{
  const window=new Window({url:'http://127.0.0.1:18771/classic.html',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  const document=window.document;
  document.write(await readFile(new URL('../site/classic.html',import.meta.url),'utf8'));
  Object.assign(globalThis,{document,location:window.location,ResizeObserver:class{observe(){}}});
  const frames=new Map();let nextFrame=0;
  globalThis.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  Object.defineProperty(window.HTMLElement.prototype,'offsetHeight',{get(){return this.tagName==='SECTION'?80:22;}});
  let surface,dirty=0,rejectAction=null;const messages=[],statuses=[];
  const frame=document.getElementById('word-frame');
  Object.defineProperty(frame,'contentWindow',{value:{postMessage(message,origin){
    assert.equal(origin,'http://127.0.0.1:18771');
    const payload=JSON.parse(message.payload);messages.push(payload);
    queueMicrotask(()=>surface.receive('reviewResult',payload.action===rejectAction?{request:payload.request,ok:false,error:'The document refused this reply'}:{request:payload.request,ok:true,result:payload.action==='new'?{id:4}:{}}));
  }}});
  surface=createOriginalComments({frame,onDirty:()=>dirty++,onStatus:message=>statuses.push(message)});
  const seed={document:'11',author:'RFQ Demo',active:1,editable:true,formatting:true,
    clip:{x:0,y:100,w:1000,h:500},pages:[{page:0,x:50,y:0,w:650,h:1000,margin:250}],selection:null,
    notes:[
      {id:1,author:'RFQ Demo',text:'Original comment',color:0,resolved:false,ranges:[{page:0,x:200,y:300,w:100,h:20}],replies:[{id:2,author:'Reviewer',text:'Native reply'}]},
      {id:3,author:'Sales',text:'Second comment',color:1,resolved:false,ranges:[{page:0,x:200,y:500,w:100,h:20}],replies:[]}
    ]};
  const clone=()=>({...structuredClone(seed),applied:messages.at(-1)?.request??0});
  async function tick(){for(let i=0;i<12;i++)await Promise.resolve();const jobs=[...frames.values()];frames.clear();for(const fn of jobs)fn();}
  const click=selector=>{const node=document.querySelector(selector);assert.ok(node,selector);node.click();};
  const input=(node,value)=>{node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}));};
  surface.receive('reviewState',clone());await tick();
  await t.test('reuses master stylesheet and reply SVGs rather than approximations',async()=>{
    assert.equal(await readFile(new URL('../site/word-comments.css',import.meta.url),'utf8'),await readFile(new URL('../../../rfq-react-prototype/public/word-comments.css',import.meta.url),'utf8'));
    assert.equal(document.querySelectorAll('.wc-note').length,2);
    assert.equal(document.querySelector('.wc-author').textContent,'我');
    assert.ok(document.querySelector('[data-reply="1"] .lucide-corner-up-left'));
    assert.equal(document.querySelector('.wc-reply-item p').textContent,'Native reply');
  });
  await t.test('positions cards at native anchors and draws matching solid/dashed connectors',async()=>{
    assert.equal(document.querySelector('[data-note="1"]').style.top,'160px');
    assert.equal(document.querySelector('[data-note="3"]').style.top,'386px');
    assert.equal(document.querySelector('[data-link="1"]').getAttribute('d'),'M 300 200 H 632 L 700 179');
    assert.equal(document.querySelector('[data-link="3"]').getAttribute('stroke-dasharray'),'4 4');
    const shifted=clone();shifted.notes.forEach(n=>n.ranges.forEach(r=>r.y-=50));surface.receive('reviewState',shifted);await tick();
    assert.equal(document.querySelector('[data-note="1"]').style.top,'110px');
    assert.equal(document.querySelector('[data-link="1"]').getAttribute('d'),'M 300 150 H 632 L 700 129');
    surface.receive('reviewState',clone());await tick();
  });
  await t.test('edits stage native drafts and geometry updates preserve the focused textarea',async()=>{
    click('[data-edit="1"]');await tick();
    const area=document.querySelector('[data-edit-input="1"]');assert.ok(area);assert.equal(document.activeElement,area);
    input(area,'Edited through original UI');await tick();
    assert.equal(messages.at(-1).action,'draft');assert.equal(messages.at(-1).params.text,'Edited through original UI');assert.equal(messages.at(-1).document,'11');assert.ok(dirty>0);
    const state=clone();state.notes[0].text='Edited through original UI';state.notes[0].ranges[0].y-=10;surface.receive('reviewState',state);await tick();
    assert.equal(document.querySelector('[data-edit-input="1"]'),area);
    area.dispatchEvent(new window.KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true}));await tick();
    assert.equal(messages.at(-1).action,'save');
  });
  await t.test('reply cancel clears the native draft without submitting it',async()=>{
    click('[data-reply="1"]');await tick();
    input(document.querySelector('[data-reply-input]'),'Discard this reply');await tick();
    const before=messages.filter(m=>m.action==='reply').length;
    click('[data-cancel-reply]');await tick();
    assert.equal(messages.at(-1).action,'cancelReply');assert.equal(messages.filter(m=>m.action==='reply').length,before);
    assert.equal(document.querySelector('[data-reply-input]'),null);
  });
  await t.test('late native echoes cannot overwrite newer typing, including an ABA edit sequence',async()=>{
    click('[data-edit="1"]');await tick();let area=document.querySelector('[data-edit-input="1"]');
    input(area,'A');const aSequence=messages.at(-1).request;input(area,'AB');await tick();
    const old=clone();old.applied=aSequence;old.notes[0].text='A';surface.receive('reviewState',old);await tick();
    area=document.querySelector('[data-edit-input="1"]');assert.equal(area.value,'AB');input(area,'ABC');await tick();
    assert.equal(messages.at(-1).params.text,'ABC');
    input(area,'X');const first=messages.at(-1).request;input(area,'XY');const middle=messages.at(-1).request;input(area,'X');const final=messages.at(-1).request;await tick();
    for(const [sequence,text] of [[first,'X'],[middle,'XY'],[final,'X']]){
      const state=clone();state.applied=sequence;state.notes[0].text=text;surface.receive('reviewState',state);await tick();assert.equal(document.querySelector('[data-edit-input="1"]').value,'X');
    }
    const stale=clone();stale.applied=middle;stale.notes[0].text='XY';surface.receive('reviewState',stale);await tick();assert.equal(document.querySelector('[data-edit-input="1"]').value,'X');
  });
  await t.test('reply submit calls the native reply operation',async()=>{
    click('[data-reply="1"]');await tick();input(document.querySelector('[data-reply-input]'),'Keep this reply');await tick();
    click('[data-send-reply="1"]');await tick();assert.equal(messages.at(-1).action,'reply');assert.equal(messages.at(-1).params.id,1);
  });
  await t.test('a refused reply keeps its text and a second reply-icon click preserves the draft',async()=>{
    click('[data-reply="1"]');await tick();input(document.querySelector('[data-reply-input]'),'Keep on failure');await tick();
    click('[data-reply="1"]');await tick();assert.equal(document.querySelector('[data-reply-input]').value,'Keep on failure');
    rejectAction='reply';click('[data-send-reply="1"]');await tick();
    assert.equal(document.querySelector('[data-reply-input]').value,'Keep on failure');assert.match(statuses.at(-1),/refused/);
    rejectAction=null;click('[data-cancel-reply]');await tick();
  });
  await t.test('new comments retain focus until the native snapshot arrives',async()=>{
    click('#review-tools [data-new]');await tick();
    const state=clone();state.notes.push({id:4,author:'RFQ Demo',text:'',color:2,resolved:false,ranges:[{page:0,x:250,y:400,w:60,h:20}],replies:[]});
    surface.receive('reviewState',state);await tick();const area=document.querySelector('[data-edit-input="4"]');assert.ok(area);assert.equal(document.activeElement,area);
  });
  await t.test('new comments from the native ribbon also focus the original comment editor',async()=>{
    const state=clone();state.notes.push({id:5,author:'RFQ Demo',text:'',color:2,resolved:false,ranges:[{page:0,x:250,y:420,w:60,h:20}],replies:[]});
    surface.receive('reviewState',state);await tick();assert.equal(document.activeElement,document.querySelector('[data-edit-input="5"]'));
  });
  await t.test('file switching discards stale coordinates and card state',async()=>{
    surface.receive('reviewState',clone());await tick();assert.ok(document.querySelector('[data-note="1"]'),'an unsuccessful open that retains the native generation must retain its cards');
    const fresh=clone();fresh.document='12';fresh.notes=[fresh.notes[1]];fresh.active=3;surface.receive('reviewState',fresh);await tick();
    assert.equal(document.querySelectorAll('.wc-note').length,1);assert.equal(document.querySelector('[data-edit-input]'),null);
  });
  await t.test('dense threads have a scrollable margin and connectors follow its scroll position',async()=>{
    const state=clone();state.document='13';state.notes=Array.from({length:9},(_,i)=>({...structuredClone(seed.notes[0]),id:10+i,ranges:[{page:0,x:200,y:300,w:100,h:20}]}));
    state.active=10;surface.receive('reviewState',state);await tick();
    const column=document.querySelector('[data-column]');assert.ok(column.classList.contains('wc-native-column'));assert.equal(column.style.height,'500px');
    const path=document.querySelector('[data-link="10"]');assert.equal(path.getAttribute('d'),'M 300 200 H 632 L 700 179');
    column.scrollTop=60;column.dispatchEvent(new window.Event('scroll'));await tick();assert.equal(path.isConnected,false);
    assert.equal(document.querySelector('[data-link="10"]').getAttribute('d'),'M 300 200 H 632 L 700 119');
    assert.equal(document.querySelector('[data-note="10"]').style.maxHeight,'476px');
    column.scrollTop=500;column.dispatchEvent(new window.Event('scroll'));await tick();
    const last=document.querySelector('[data-note="18"]');last.scrollTop=24;
    click('[data-menu="18"]');await tick();
    assert.equal(document.querySelector('[data-column]').scrollTop,500);assert.equal(document.querySelector('[data-note="18"]').scrollTop,24);
    assert.ok(document.querySelector('[data-note="18"] .wc-menu'),'a menu on a lower card remains in its scrolled margin');
    click('[data-reply="18"]');await tick();assert.equal(document.querySelector('[data-column]').scrollTop,500);assert.ok(document.querySelector('[data-reply-input]'));
  });
  await window.happyDOM.cancelAsync();
});

test('native refusal remains visible after the document becomes dirty',async()=>{
  const window=new Window({url:'http://127.0.0.1:18771/classic.html',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  const document=window.document;document.write(await readFile(new URL('../site/classic.html',import.meta.url),'utf8'));
  Object.assign(globalThis,{window,document,location:window.location,history:window.history,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});
  const frame=document.getElementById('word-frame');
  const native={postMessage(message){if(message.type!=='wordcraft:review')return;const p=JSON.parse(message.payload);queueMicrotask(()=>send('reviewResult',p.action==='draft'?{request:p.request,ok:false,error:'Native edit refused'}:{request:p.request,ok:true,result:{}}));}};
  Object.defineProperty(frame,'contentWindow',{value:native});
  function send(kind,payload){window.dispatchEvent(new window.MessageEvent('message',{origin:window.location.origin,source:native,data:{type:'wordcraft:'+kind,payload:JSON.stringify(payload)}}));}
  await import('../site/classic-demo.js?status-regression');
  send('reviewState',{document:'50',applied:0,author:'Me',active:1,editable:true,formatting:true,pages:[],clip:null,notes:[{id:1,author:'Me',text:'Original',color:0,resolved:false,ranges:[],replies:[]}]});
  document.querySelector('[data-edit="1"]').click();for(let i=0;i<12;i++)await Promise.resolve();
  const area=document.querySelector('[data-edit-input="1"]');assert.ok(area);area.value='Rejected';area.dispatchEvent(new window.Event('input',{bubbles:true}));
  for(let i=0;i<12;i++)await Promise.resolve();assert.equal(document.getElementById('status').textContent,'Native edit refused');
  await window.happyDOM.cancelAsync();
});
