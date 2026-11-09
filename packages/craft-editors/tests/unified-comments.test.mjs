import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from './dom-test-support.mjs';

test('Word and PDF use independent instances of the original comment surface', async t=>{
  const window=new Window({url:'http://127.0.0.1:18771/classic.html',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  const document=window.document;
  document.write(await readFile(new URL('../site/classic.html',import.meta.url),'utf8'));
  const frames=new Map();let nextFrame=0;
  Object.assign(globalThis,{window,document,location:window.location,history:window.history,ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id)});
  Object.defineProperty(window.HTMLElement.prototype,'offsetHeight',{get(){return this.tagName==='SECTION'?80:22;}});
  const messages={word:[],pdf:[]}, native={};let rejected=null;
  const project={word:'wordcraft',pdf:'pdfcraft'};
  function send(key,kind,payload,{origin=window.location.origin,source=native[key],namespace=project[key]}={}){
    window.dispatchEvent(new window.MessageEvent('message',{origin,source,data:{type:namespace+':'+kind,payload:JSON.stringify(payload)}}));
  }
  for(const key of ['word','pdf']){
    native[key]={postMessage(message,origin){
      assert.equal(origin,'http://127.0.0.1:18771');
      if(!message.type.endsWith(':review')) { return; }
      const payload=JSON.parse(message.payload);messages[key].push({type:message.type,...payload});
      queueMicrotask(()=>send(key,'reviewResult',payload.action===rejected?{request:payload.request,ok:false,error:'PDF reply refused'}:{request:payload.request,ok:true,result:payload.action==='new'?{id:4}:{}}));
    }};
    Object.defineProperty(document.getElementById(key+'-frame'),'contentWindow',{value:native[key]});
  }
  const seed=key=>({document:key+'-document',applied:messages[key].at(-1)?.request??0,author:'RFQ Demo',active:1,editable:true,formatting:key==='word',
    clip:{x:0,y:100,w:1000,h:500},pages:[{page:0,x:50,y:0,w:650,h:1000,margin:250}],selection:null,
    notes:[{id:1,author:'RFQ Demo',text:key==='word'?'Word comment':'PDF comment',color:0,resolved:false,ranges:[{page:0,x:200,y:300,w:100,h:20}],replies:[{id:2,author:'Reviewer',text:key+' native reply'}]}]});
  async function tick(){for(let i=0;i<16;i++)await Promise.resolve();const jobs=[...frames.values()];frames.clear();for(const fn of jobs)fn();}
  const click=selector=>{const node=document.querySelector(selector);assert.ok(node,selector);node.click();};
  const input=(node,value)=>{node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}));};
  await import('../site/classic-demo.js?unified-regression');
  const wordRoot=document.getElementById('original-comments'), wordTools=document.getElementById('review-tools');
  const pdfRoot=document.getElementById('pdf-original-comments'), pdfTools=document.getElementById('pdf-review-tools');
  await t.test('PDF uses the Word markup, icons and native anchor geometry without its formatting command',async()=>{
    assert.ok(pdfRoot,'PDF needs its own instance of the shared comment surface');assert.ok(pdfTools);
    assert.ok(wordRoot.classList.contains('original-comments'));assert.ok(pdfRoot.classList.contains('original-comments'));
    assert.ok(wordRoot.classList.contains('word-classic-document'));assert.ok(pdfRoot.classList.contains('word-classic-document'));
    send('word','reviewState',seed('word'));send('pdf','reviewState',seed('pdf'));await tick();
    assert.equal(wordRoot.querySelector('.wc-note-body-button').textContent,'Word comment ↵');
    assert.equal(pdfRoot.querySelector('.wc-note-body-button').textContent,'PDF comment');
    assert.equal(pdfRoot.querySelector('.wc-reply-item p').textContent,'pdf native reply');
    assert.ok(pdfRoot.querySelector('[data-reply="1"] .lucide-corner-up-left'));
    click('[data-app="pdf"]');await tick();
    assert.equal(document.getElementById('pdf-frame').src,'http://127.0.0.1:18771/pdfcraft-classic/?host=parent&author=RFQ%20Demo&comments=classic');
    assert.equal(pdfRoot.hidden,false);assert.equal(pdfTools.hidden,false);assert.equal(wordRoot.hidden,true);assert.equal(wordTools.hidden,true);
    assert.equal(pdfRoot.querySelector('[data-note="1"]').style.top,'160px');
    assert.equal(pdfRoot.querySelector('[data-link="1"]').getAttribute('d'),'M 300 200 H 632 L 700 179');
    assert.equal(pdfTools.querySelector('[data-format]').hidden,true);assert.equal(wordTools.querySelector('[data-format]').hidden,false);
    const before=messages.pdf.length;pdfTools.querySelector('[data-format]').click();await tick();assert.equal(messages.pdf.length,before,'PDF must never send the unsupported format action');
  });
  await t.test('native messages require the matching frame, origin and namespace',async()=>{
    for(const overrides of [{source:native.word},{origin:'https://other.invalid'},{namespace:'wordcraft'}]){
      const foreign=seed('pdf');foreign.notes[0].text='Must be ignored';send('pdf','reviewState',foreign,overrides);
    }
    await tick();assert.equal(pdfRoot.querySelector('.wc-note-body-button').textContent,'PDF comment');
    assert.equal(wordRoot.querySelector('.wc-note-body-button').textContent,'Word comment ↵');
    assert.ok(messages.pdf.every(message=>message.type==='pdfcraft:review'));
    assert.ok(messages.word.every(message=>message.type==='wordcraft:review'));
  });
  await t.test('switching preserves separate drafts, replies and margin scroll with identical note IDs',async()=>{
    click('[data-app="word"]');click('#original-comments [data-edit="1"]');await tick();
    input(wordRoot.querySelector('[data-edit-input="1"]'),'Word draft retained');await tick();
    wordRoot.querySelector('[data-column]').scrollTop=70;wordRoot.querySelector('[data-note="1"]').scrollTop=12;
    click('[data-app="pdf"]');click('#pdf-original-comments [data-reply="1"]');await tick();
    input(pdfRoot.querySelector('[data-reply-input]'),'PDF reply retained');await tick();
    pdfRoot.querySelector('[data-column]').scrollTop=120;pdfRoot.querySelector('[data-note="1"]').scrollTop=24;
    click('[data-app="word"]');await tick();
    assert.equal(wordRoot.querySelector('[data-edit-input="1"]').value,'Word draft retained');assert.equal(wordRoot.querySelector('[data-reply-input]'),null);
    assert.equal(wordRoot.querySelector('[data-column]').scrollTop,70);assert.equal(wordRoot.querySelector('[data-note="1"]').scrollTop,12);
    click('[data-app="pdf"]');await tick();
    assert.equal(pdfRoot.querySelector('[data-reply-input]').value,'PDF reply retained');assert.equal(pdfRoot.querySelector('[data-edit-input]'),null);
    assert.equal(pdfRoot.querySelector('[data-column]').scrollTop,120);assert.equal(pdfRoot.querySelector('[data-note="1"]').scrollTop,24);
    assert.equal(messages.pdf.at(-1).action,'replyDraft');assert.equal(messages.pdf.at(-1).params.text,'PDF reply retained');assert.equal(messages.pdf.at(-1).document,'pdf-document');
    assert.ok(messages.word.some(message=>message.action==='draft'&&message.params.text==='Word draft retained'&&message.document==='word-document'));
  });
  await t.test('PDF reply failures and cancellation stay scoped to PDF',async()=>{
    rejected='reply';click('#pdf-original-comments [data-send-reply="1"]');await tick();
    assert.equal(document.getElementById('status').textContent,'PDF reply refused');assert.equal(pdfRoot.querySelector('[data-reply-input]').value,'PDF reply retained');
    click('[data-app="word"]');await tick();assert.equal(document.getElementById('status').textContent,'有未保存修改');
    click('[data-app="pdf"]');rejected=null;click('#pdf-original-comments [data-cancel-reply]');await tick();
    assert.equal(messages.pdf.at(-1).action,'cancelReply');assert.equal(pdfRoot.querySelector('[data-reply-input]'),null);
    assert.equal(wordRoot.querySelector('[data-edit-input="1"]').value,'Word draft retained');
  });
  await t.test('background PDF updates preserve the active Word editor focus',async()=>{
    click('[data-app="word"]');await tick();const wordInput=wordRoot.querySelector('[data-edit-input="1"]');wordInput.focus();
    const state=seed('pdf');state.notes.push({id:7,author:'RFQ Demo',text:'',color:1,resolved:false,ranges:[{page:0,x:250,y:400,w:60,h:20}],replies:[]});
    send('pdf','reviewState',state);await tick();assert.equal(document.activeElement,wordInput);
    click('[data-app="pdf"]');await tick();assert.equal(document.activeElement,pdfRoot.querySelector('[data-edit-input="7"]'));
  });
  await t.test('new PDF comments focus the shared editor and describe saving a PDF',async()=>{
    click('#pdf-review-tools [data-new]');await tick();assert.equal(messages.pdf.at(-1).action,'new');
    const state=seed('pdf');state.notes.push({id:4,author:'RFQ Demo',text:'',color:1,resolved:false,ranges:[{page:0,x:250,y:400,w:60,h:20}],replies:[]});
    send('pdf','reviewState',state);await tick();
    assert.equal(document.activeElement,pdfRoot.querySelector('[data-edit-input="4"]'));assert.match(document.getElementById('status').textContent,/PDF/);
    assert.equal(wordRoot.querySelector('[data-note="4"]'),null);
  });
  await t.test('save shortcuts target only the active document, including within the PDF composer',async()=>{
    const beforeWord=messages.word.filter(message=>message.action==='save').length,beforePdf=messages.pdf.filter(message=>message.action==='save').length;
    pdfRoot.querySelector('[data-edit-input="4"]').dispatchEvent(new window.KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));await tick();
    assert.equal(messages.pdf.filter(message=>message.action==='save').length,beforePdf+1);assert.equal(messages.word.filter(message=>message.action==='save').length,beforeWord);
    click('[data-app="word"]');window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'s',metaKey:true,cancelable:true}));await tick();
    assert.equal(messages.word.filter(message=>message.action==='save').length,beforeWord+1);
    click('[data-app="pdf"]');window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'s',metaKey:true,cancelable:true}));await tick();
    assert.equal(messages.pdf.filter(message=>message.action==='save').length,beforePdf+2);
  });
  await t.test('PDF retains native marks and hides cards whose source page is outside the viewport',async()=>{
    const state=seed('pdf');state.notes[0].highlight=false;
    state.notes.push({id:20,page:1,author:'Reviewer',text:'Offscreen PDF comment',color:2,resolved:false,ranges:[],replies:[]});
    send('pdf','reviewState',state);await tick();
    assert.equal(pdfRoot.querySelector('[data-native-highlights]').childElementCount,0,'native PDF marks must stay visible without a second highlight');
    assert.equal(pdfRoot.querySelector('[data-note="20"]').hidden,true,'comments on other PDF pages must not float over the current page');
    assert.ok(pdfRoot.querySelector('[data-link="1"]'),'the native mark still links to its shared card');
  });
  await t.test('a native PDF edit request focuses the shared card once',async()=>{
    const state=seed('pdf');state.edit=1;state.editRequest=8;
    send('pdf','reviewState',state);await tick();
    assert.ok(document.activeElement===pdfRoot.querySelector('[data-edit-input="1"]'),"native request should focus PDF comment");
    click('#pdf-original-comments [data-reply="1"]');await tick();const replyInput=pdfRoot.querySelector('[data-reply-input]');replyInput.focus();
    send('pdf','reviewState',state);await tick();
    assert.equal(document.activeElement,replyInput,'geometry echoes must not reopen the comment editor');
  });
  await t.test('PDF comments reappear after leaving their source page and returning',async()=>{
    const state=seed('pdf');state.notes[0].page=0;
    send('pdf','reviewState',state);await tick();
    const column=pdfRoot.querySelector('[data-column]');column.scrollTop=60;
    const away=structuredClone(state);away.pages=[{page:1,x:50,y:0,w:650,h:1000,margin:250}];away.notes[0].ranges=[];
    send('pdf','reviewState',away);await tick();
    assert.ok(pdfRoot.querySelector('[data-note="1"]')?.hidden,'the hidden card must remain available');
    send('pdf','reviewState',state);await tick();
    assert.ok(pdfRoot.querySelector('[data-note="1"]')?.hidden===false,'returning to the source page must restore its card');
    assert.equal(pdfRoot.querySelector('[data-column]').scrollTop,60);
    assert.ok(pdfRoot.querySelector('[data-link="1"]'));
  });
  await window.happyDOM.cancelAsync();
});
