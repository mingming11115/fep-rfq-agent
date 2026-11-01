import {icons} from './word-comment-icons.js';

// The markup and class names deliberately follow master's word-comments.html.
const palette = [
  {ink:'#6633a4', fill:'#d9c6ec'}, {ink:'#df3540', fill:'#f8d9db'}, {ink:'#008cf0', fill:'#d1e9fa'}
];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const overlap = (a,b) => a.y+a.h>b.y && a.y<b.y+b.h && a.x+a.w>b.x && a.x<b.x+b.w;

export function createOriginalComments({frame, onStatus, onDirty, namespace='wordcraft', root=document.getElementById('original-comments'), tools=document.getElementById('review-tools'), documentFormat='DOCX', supportsFormatting=true}) {
  const clip=root.querySelector('[data-native-clip]');
  const margin=root.querySelector('[data-margin]'), svg=root.querySelector('[data-connectors]');
  const highlights=root.querySelector('[data-native-highlights]'), backgrounds=root.querySelector('[data-native-margins]');
  const floating=root.querySelector('[data-floating]');
  for(const owner of [root,tools])for(const placeholder of owner.querySelectorAll('[data-icon]'))placeholder.outerHTML=icons[placeholder.dataset.icon]||'';
  tools.querySelector('[data-format]').hidden=!supportsFormatting;
  let snapshot=null, active=null, editing=null, menu=null, replyTarget=null, reply='', focusTarget=null;
  let requestId=0, frameId=0, visible=!root.hidden, composing=false,reveal=null;
  const pending=new Map(), localEdits=new Map();let applied=0;
  const columnScrolls=new Map(), cardScrolls=new Map();
  const noteFor=id=>snapshot?.notes.find(n=>n.id===id);
  const content=state=>JSON.stringify(state?.notes.map(({ranges,...note})=>note));
  function request(action, params={}) {
    if (!snapshot) return Promise.reject(new Error('编辑器还未就绪'));
    const request=++requestId;
    frame.contentWindow.postMessage({type:namespace+':review',payload:JSON.stringify({document:snapshot.document,request,action,params})},location.origin);
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{pending.delete(request);reject(new Error('批注操作未收到响应，请先保存后刷新'));},10000);
      pending.set(request,{resolve,reject,timeout});
    });
  }
  const run=(action,params={})=>request(action,params).catch(error=>{onStatus(error.message);return false;});
  function setVisible(value) { const showing=value&&!visible;visible=value;root.hidden=!value;tools.hidden=!value;if(showing&&focusTarget!==null)renderNotes();if(value)schedule(); }
  function receive(kind, payload) {
    if(kind==='reviewResult'){
      const item=pending.get(payload.request);if(!item)return;clearTimeout(item.timeout);pending.delete(payload.request);
      if(payload.ok)item.resolve(payload.result);else item.reject(new Error(payload.error));return;
    }
    if(kind!=='reviewState'||!payload||!Array.isArray(payload.notes))return;
    const changed=snapshot?.document!==payload.document;
    if(!changed&&(payload.applied??0)<applied)return;
    if(changed){active=editing=menu=replyTarget=null;reply='';focusTarget=null;localEdits.clear();reveal=null;}
    const previous=snapshot;
    const created=!changed&&payload.editable?payload.notes.filter(n=>n.author===payload.author&&!n.text&&!previous.notes.some(old=>old.id===n.id)).at(-1):null;
    const nativeEdit=!changed&&payload.editable&&payload.editRequest>0&&payload.editRequest!==previous?.editRequest?payload.notes.find(n=>n.id===payload.edit):null;
    const previousContent=content(previous), previousActive=active;
    applied=payload.applied??0;
    for(const [id,draft] of localEdits){
      const note=payload.notes.find(n=>n.id===id);
      if(!note||(applied>=draft.sequence&&note.text===draft.text))localEdits.delete(id);
      else note.text=draft.text;
    }
    snapshot=payload;
    if(!noteFor(editing))editing=null;
    if(replyTarget!==null){
      const before=previous?.notes.find(n=>n.id===replyTarget), after=noteFor(replyTarget);
      if(!after || (before && after.replies.length>before.replies.length)){replyTarget=null;reply='';}
    }
    // A click in the native page determines the selected card; DOM input retains its own focus.
    if(payload.active!==previous?.active || active===null){
      active=payload.active;
      if(document.activeElement===frame)editing=null;
    }
    if(created){active=editing=created.id;focusTarget=created.id;}
    if(nativeEdit){active=editing=nativeEdit.id;focusTarget=nativeEdit.id;}
    tools.querySelector('[data-count]').textContent=payload.notes.length+' 条批注';
    tools.querySelector('[data-format]').setAttribute('aria-pressed',String(payload.formatting));
    tools.querySelectorAll('button').forEach(button=>button.disabled=false);
    tools.querySelector('[data-new]').disabled=!payload.editable;
    root.classList.toggle('wc-hide-format',!supportsFormatting||!payload.formatting);
    if(!composing&&(changed||created||nativeEdit||previousContent!==content(payload)||previousActive!==active||previous?.author!==payload.author||previous?.editable!==payload.editable||previous?.formatting!==payload.formatting))renderNotes(changed);
    schedule();
    if(changed&&payload.notes.length){void navigate(payload.notes[0].id);}
  }
  const author=name=>name===snapshot.author?'我':name||'审阅人';
  function renderNotes(resetScroll=false){
    if(!snapshot)return;
    if(resetScroll){columnScrolls.clear();cardScrolls.clear();}
    else{
      margin.querySelectorAll('[data-column]').forEach(column=>columnScrolls.set(column.dataset.column,column.scrollTop));
      margin.querySelectorAll('[data-note]').forEach(card=>cardScrolls.set(card.dataset.note,card.scrollTop));
    }
    const focused=document.activeElement, preserve=root.contains(focused)&&focused.matches('textarea');
    const field=preserve?{edit:focused.dataset.editInput,reply:focused.hasAttribute('data-reply-input'),start:focused.selectionStart,end:focused.selectionEnd}:null;
    margin.innerHTML=snapshot.notes.map(n=>{
      const color=palette[n.color%3], selected=active===n.id, own=n.author===snapshot.author, isEditing=editing===n.id;
      const mark=snapshot.formatting?'<span class="wc-format" aria-hidden="true"> ↵</span>':'';
      const body=isEditing?`<textarea class="wc-edit" data-edit-input="${n.id}" aria-label="批注内容" rows="1" placeholder="输入批注…" ${!snapshot.editable?'readonly':''}>${esc(n.text)}</textarea>`:
        own?`<button type="button" class="wc-note-body-button" data-edit="${n.id}" ${!snapshot.editable?'disabled':''}>${esc(n.text||'空白批注')}${mark}</button>`:`<p class="wc-note-body">${esc(n.text)}${mark}</p>`;
      const thread=n.replies.length?`<div class="wc-replies">${n.replies.map(r=>`<div class="wc-reply-item"><span class="wc-reply-author">${esc(author(r.author))}</span><p>${esc(r.text)}</p></div>`).join('')}</div>`:'';
      const composer=replyTarget===n.id?`<textarea class="wc-reply-input" data-reply-input aria-label="回复批注" rows="2" placeholder="输入回复…">${esc(reply)}</textarea><div class="wc-reply-actions"><button type="button" class="wc-button" data-cancel-reply>取消</button><button type="button" class="wc-button" data-send-reply="${n.id}" ${!reply.trim()?'disabled':''}>回复</button></div>`:'';
      const popup=menu===n.id?`<div class="wc-menu">${own?`<button type="button" data-edit="${n.id}">编辑批注</button>`:''}<button type="button" data-goto="${n.id}">转到原文</button><button type="button" data-resolve="${n.id}">${n.resolved?'重新打开':'解决批注'}</button><button type="button" data-delete="${n.id}">删除批注</button></div>`:'';
      return `<section class="wc-note${selected?' wc-note-active':''}" style="--wc-color:${color.ink};--wc-fill:${color.fill}" data-note="${n.id}" aria-label="${esc(author(n.author))}的批注"><div class="wc-note-head"><span class="wc-author">${esc(author(n.author))}</span>${own?'<span class="wc-time">刚刚</span>':''}<button type="button" class="wc-icon" data-reply="${n.id}" aria-label="回复此批注" ${!snapshot.editable?'disabled':''}>${icons['corner-up-left']}</button><button type="button" class="wc-icon" data-menu="${n.id}" aria-label="批注操作" aria-expanded="${menu===n.id}">${icons.ellipsis}</button></div>${n.resolved?'<p class="wc-reply-author">已解决</p>':''}${body}${thread}${composer}${popup}</section>`;
    }).join('');
    root.querySelectorAll('[data-edit-input]').forEach(grow);
    let restore=focusTarget;
    if(!restore&&field)restore=field.reply?'reply':Number(field.edit);
    const input=restore==='reply'?root.querySelector('[data-reply-input]'):restore!==null?root.querySelector(`[data-edit-input="${restore}"]`):null;
    if(input&&visible){input.focus({preventScroll:true});if(field)input.setSelectionRange(field.start,field.end);else input.setSelectionRange(input.value.length,input.value.length);focusTarget=null;}
    schedule();
  }
  function grow(input){input.style.height='auto';input.style.height=Math.max(22,input.scrollHeight)+'px';}
  function schedule(){if(frameId)cancelAnimationFrame(frameId);frameId=requestAnimationFrame(()=>{frameId=0;layout();});}
  function layout(){
    if(!snapshot?.clip||!visible)return;
    const view=snapshot.clip;
    Object.assign(clip.style,{left:view.x+'px',top:view.y+'px',width:view.w+'px',height:view.h+'px'});
    const pages=new Map(snapshot.pages.map(p=>[p.page,p]));
    backgrounds.innerHTML=snapshot.pages.map(p=>`<div class="wc-native-margin" style="left:${p.x+p.w-view.x}px;top:${p.y-view.y}px;width:${p.margin}px;height:${p.h}px"></div>`).join('');
    const entries=snapshot.notes.map(n=>{
      const ranges=n.ranges.filter(r=>overlap(r,view));
      const onVisiblePage=n.ranges.filter(r=>{const p=pages.get(r.page);return p&&p.y+p.h>view.y&&p.y<view.y+view.h;});
      const anchor=ranges.at(-1)||onVisiblePage.at(-1), page=pages.get(anchor?.page),box=margin.querySelector(`[data-note="${n.id}"]`);
      if(!box)return null;
      box.hidden=!anchor&&(n.ranges.length>0||(Number.isInteger(n.page)&&!pages.has(n.page)));
      if(box.hidden){
        if(box.parentElement!==margin){const column=box.parentElement;columnScrolls.set(column.dataset.column,column.scrollTop);margin.append(box);}
        return null;
      }
      return {n,box,anchor,page};
    }).filter(Boolean).sort((a,b)=>(a.anchor?.y??view.y)-(b.anchor?.y??view.y));
    const bottoms=new Map(), columns=new Set(), newColumns=new Set(), connections=[];
    for(const {n,box,anchor,page} of entries){
      const edge=page?page.x+page.w:view.x+Math.max(0,view.w-288), width=page?Math.max(96,page.margin-8):280;
      const key=String(Math.round(edge)), top=Math.max((page?.y??view.y)-view.y+12,(anchor?.y??view.y+26)-view.y-(n.id===active?40:14),bottoms.get(key)??-Infinity);
      let column=margin.querySelector(`[data-column="${key}"]`);
      if(!column){column=document.createElement('div');column.className='wc-native-column';column.dataset.column=key;margin.append(column);newColumns.add(key);}
      columns.add(key);Object.assign(column.style,{left:edge-view.x+'px',width:width+8+'px',height:view.h+'px'});
      if(box.parentElement!==column){const focused=box.contains(document.activeElement)?document.activeElement:null;column.append(box);focused?.focus({preventScroll:true});}
      Object.assign(box.style,{left:'0px',right:'auto',width:width+'px',top:top+'px',maxHeight:Math.max(36,view.h-24)+'px',overflowY:'auto'});
      if(box.scrollHeight<=Math.max(36,view.h-24))box.style.overflowY='visible';
      if(newColumns.has(key)&&cardScrolls.has(String(n.id)))box.scrollTop=cardScrolls.get(String(n.id));
      bottoms.set(key,top+box.offsetHeight+3);
      if(anchor)connections.push({n,box,anchor,edge,top,column});
    }
    margin.querySelectorAll('[data-column]').forEach(column=>{if(!columns.has(column.dataset.column))column.remove();});
    margin.querySelectorAll('[data-column]').forEach(column=>{if(newColumns.has(column.dataset.column))column.scrollTop=columnScrolls.get(column.dataset.column)||0;});
    if(reveal&&applied>=reveal.sequence){
      const item=connections.find(item=>item.n.id===reveal.id);
      if(item){const {column,top,box}=item;if(top<column.scrollTop)column.scrollTop=Math.max(0,top-12);else if(top+box.offsetHeight>column.scrollTop+view.h)column.scrollTop=Math.max(0,top+box.offsetHeight-view.h+12);}
      reveal=null;
    }
    const paths=connections.map(({n,box,anchor,edge,top,column})=>{
      const x=anchor.x+anchor.w-view.x,y=anchor.y-view.y,elbow=Math.max(x,edge-view.x-68),target=top-column.scrollTop+Math.min(19,box.offsetHeight/2);
      return `<path data-link="${n.id}" d="M ${x} ${y} H ${elbow} L ${edge-view.x} ${target}" fill="none" stroke="${palette[n.color%3].ink}" stroke-width="1.15"${n.id===active?'':' stroke-dasharray="4 4"'}/>`;
    });
    svg.setAttribute('viewBox',`0 0 ${view.w} ${view.h}`);svg.innerHTML=paths.join('');
    highlights.setAttribute('viewBox',`0 0 ${view.w} ${view.h}`);
    highlights.innerHTML=snapshot.notes.filter(n=>n.highlight!==false).flatMap(n=>n.ranges.filter(r=>overlap(r,view)).map(r=>`<rect x="${r.x-view.x}" y="${r.y-view.y}" width="${Math.max(2,r.w)}" height="${r.h}" fill="${palette[n.color%3].fill}"/><path d="M ${r.x-view.x} ${r.y-view.y} v ${r.h} M ${r.x+r.w-view.x} ${r.y-view.y} v ${r.h}" stroke="${palette[n.color%3].ink}" stroke-width="${n.id===active?2:1}"/>`)).join('');
    const selection=snapshot.selection;floating.hidden=!selection||!snapshot.editable;
    if(selection)Object.assign(floating.style,{left:Math.max(5,Math.min(selection.x+selection.w-view.x-110,view.w-135))+'px',top:Math.max(2,selection.y-view.y-35)+'px'});
  }
  async function select(id, edit=false){
    if(edit&&!snapshot.editable)return false;
    if(editing!==null&&editing!==id&&await run('flush')===false)return false;
    if(replyTarget!==null&&replyTarget!==id){if(await run('cancelReply',{id:replyTarget})===false)return false;replyTarget=null;reply='';}
    if(await navigate(id)===false)return false;
    active=id;editing=edit?id:null;menu=null;
    if(edit)focusTarget=id;renderNotes();
    return true;
  }
  async function navigate(id){
    const sequence=requestId+1,result=await run('select',{id});
    if(result!==false){reveal={id,sequence};schedule();}
    return result;
  }
  async function newComment(){
    try{
      const result=await request('new');active=editing=result.id;focusTarget=result.id;menu=null;
      renderNotes();onStatus('已在对应页边新建批注，输入内容后可保存 '+documentFormat+'。');
    }catch(error){onStatus(error.message);}
  }
  root.addEventListener('compositionstart',()=>{composing=true;});
  root.addEventListener('compositionend',event=>{composing=false;stage(event.target);});
  function stage(input){
    if(input.matches('[data-edit-input]')){
      const id=Number(input.dataset.editInput);const n=noteFor(id);if(n)n.text=input.value;
      localEdits.set(id,{text:input.value,sequence:requestId+1});
      onDirty();run('draft',{id,text:input.value});grow(input);schedule();
    }else if(input.matches('[data-reply-input]')){
      reply=input.value;onDirty();run('replyDraft',{id:replyTarget,text:reply});
      const send=root.querySelector('[data-send-reply]');if(send)send.disabled=!reply.trim();schedule();
    }
  }
  root.addEventListener('input',event=>stage(event.target));
  root.addEventListener('focusout',event=>{
    if(event.target.matches('[data-edit-input]')&&!composing)run('flush');
  });
  root.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.altKey&&event.key.toLowerCase()==='m'){event.preventDefault();void newComment();}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();run('save');}
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&event.target.matches('[data-reply-input]')){event.preventDefault();root.querySelector('[data-send-reply]')?.click();}
    if(event.key==='Escape'&&editing!==null){event.preventDefault();const id=editing;void run('cancelEdit',{id}).then(result=>{if(result!==false){localEdits.delete(id);editing=null;renderNotes();}});}
  });
  async function click(event){
    const button=event.target.closest('button');
    if(!button){const card=event.target.closest('[data-note]');if(card&&!event.target.closest('textarea'))await select(Number(card.dataset.note));return;}
    if(button.hasAttribute('data-new'))return newComment();
    if(button.hasAttribute('data-edit'))return select(Number(button.dataset.edit),true);
    if(button.hasAttribute('data-goto'))return select(Number(button.dataset.goto));
    if(button.hasAttribute('data-menu')){const id=Number(button.dataset.menu);menu=menu===id?null:id;renderNotes();return;}
    if(button.hasAttribute('data-reply')){
      const id=Number(button.dataset.reply);
      if(replyTarget===id){focusTarget='reply';renderNotes();return;}
      if(await select(id)===false)return;
      replyTarget=id;reply='';editing=null;focusTarget='reply';renderNotes();return;
    }
    if(button.hasAttribute('data-cancel-reply')){if(await run('cancelReply',{id:replyTarget})===false)return;replyTarget=null;reply='';renderNotes();return;}
    if(button.hasAttribute('data-send-reply')){
      if(!reply.trim())return;if(await run('reply',{id:replyTarget})===false)return;replyTarget=null;reply='';renderNotes();return;
    }
    for(const action of ['delete','resolve'])if(button.hasAttribute('data-'+action)){menu=null;await run(action,{id:Number(button.dataset[action])});return;}
    for(const action of ['previous','next','format'])if(button.hasAttribute('data-'+action)){if(action==='format'&&!supportsFormatting)return;editing=null;await run(action);return;}
  }
  root.addEventListener('click',event=>{void click(event);});
  tools.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();});
  tools.addEventListener('click',event=>{void click(event);});
  margin.addEventListener('scroll',schedule,true);
  new ResizeObserver(schedule).observe(root);
  document.fonts?.ready.then(schedule);
  return {receive,setVisible,save:()=>run('save')};
}
