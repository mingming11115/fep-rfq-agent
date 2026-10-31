import {createOriginalComments} from './original-comments.js';
const options = {
  word: {project:'wordcraft', version:'0.13.2', engine:'wordcraft-classic', ext:'docx', hint:'页边批注沿用原版样式：选中文字新建批注，点击卡片定位原文；批注与回复可随 DOCX 保存。'},
  pdf: {project:'pdfcraft', version:'0.16.1', ext:'pdf', hint:'示例已带一条便笺。可使用评论、高亮或圈画工具；点击编辑器里的保存，或按 Ctrl / ⌘ + S，再下载带批注的 PDF。'}
};
const states = Object.fromEntries(Object.keys(options).map(key=>[key,{frame:document.getElementById(key+'-frame'), ready:false, dirty:false, loading:false, filename:'RFQ-review-example.'+options[key].ext, message:'正在加载编辑器…', notice:'', saved:null, pending:0}]));
const el = id => document.getElementById(id);
let active = 'word';
const comments=createOriginalComments({frame:states.word.frame,onStatus:message=>{states.word.notice=message;render();},onDirty:()=>{states.word.dirty=true;states.word.notice='';render();}});
function render(){
  const state=states[active], option=options[active];
  document.querySelectorAll('[data-app]').forEach(a=>a.setAttribute('aria-current',a.dataset.app===active?'page':'false'));
  for(const [key,s] of Object.entries(states))s.frame.hidden=key!==active;
  comments.setVisible(active==='word');
  el('filename').textContent=state.filename;
  el('status').textContent=state.pending?'正在保存批阅稿…':state.notice|| (state.dirty?'有未保存修改':state.message);
  el('hint').textContent=option.hint;
  el('version').textContent=option.project+' '+option.version+' · Alpha';
  el('footer-text').textContent='本地演示 · 中文 RFQ 示例 · '+(state.saved?'最近保存 '+state.saved.time:'文件在本机处理');
  el('loading').hidden=state.ready;
  el('open-file').disabled=!state.ready;
  el('reopen').disabled=!state.saved||!state.ready||!!state.pending;
  const link=el('download');link.setAttribute('aria-disabled',state.saved?'false':'true');
  if(state.saved){link.href=state.saved.url;link.download=state.saved.name}else{link.removeAttribute('href');link.removeAttribute('download')}
}
function activate(key){
  if(!options[key])key='word';active=key;
  const state=states[key], option=options[key];
  if(!state.loading){state.loading=true;state.frame.src='/'+(option.engine||option.project)+'/?host=parent&author='+encodeURIComponent('RFQ Demo')+(key==='word'?'&comments=classic':'')}
  history.replaceState(null,'',location.pathname+'?app='+key);render();
}
async function sendFile(key,name,bytes){
  const state=states[key];state.filename=name;state.message='已连接 · 示例可批阅';state.dirty=false;
  state.frame.contentWindow.postMessage({type:options[key].project+':open',name,bytes},location.origin,[bytes]);render();
}
window.addEventListener('message',async event=>{
  if(event.origin!==location.origin)return;
  const key=Object.keys(states).find(k=>states[k].frame.contentWindow===event.source);
  if(!key)return;
  const state=states[key], option=options[key], data=event.data;
  if(!data||typeof data.type!=='string'||!data.type.startsWith(option.project+':'))return;
  const kind=data.type.slice(option.project.length+1);
  if(kind==='ready'){
    if(state.ready)return;state.ready=true;render();
    try{const response=await fetch('/samples/RFQ-review-example.'+option.ext);if(!response.ok)throw new Error('示例文件读取失败');await sendFile(key,state.filename,await response.arrayBuffer())}catch(error){state.message=error.message;render()}
  }else if(kind==='failed'){state.ready=true;state.message='启动失败：'+data.error;render()}
  else if(kind==='dirty'){state.dirty=!!data.dirty;render()}
  else if(key==='word'&&(kind==='reviewState'||kind==='reviewResult')){
    try{comments.receive(kind,JSON.parse(data.payload))}catch(error){state.message='批注同步失败：'+error.message;render()}
  }
  else if(kind==='save'){
    if(!(data.bytes instanceof ArrayBuffer)&&!ArrayBuffer.isView(data.bytes))return;
    state.pending++;render();
    try{
      const name=typeof data.name==='string'?data.name:state.filename;
      const response=await fetch('/api/save?app='+key,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Demo-Filename':encodeURIComponent(name)},body:data.bytes});
      if(!response.ok)throw new Error(await response.text());
      state.saved=await response.json();state.notice='';state.message='已保存，可下载或重开';
    }catch(error){state.message='保存失败：'+error.message;state.dirty=true;alert(state.message)}
    finally{state.pending--;render()}
  }
});
document.querySelectorAll('[data-app]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();activate(link.dataset.app)}));
el('open-file').addEventListener('click',()=>{el('file-picker').accept=active==='word'?'.docx,.doc,.odt,.rtf':'.pdf';el('file-picker').click()});
el('file-picker').addEventListener('change',async event=>{
  const file=event.target.files[0],key=active;if(!file)return;
  if(states[key].dirty&&!confirm('当前文件有未保存修改，仍要打开另一个文件吗？')){event.target.value='';return}
  await sendFile(key,file.name,await file.arrayBuffer());event.target.value='';
});
el('reopen').addEventListener('click',async()=>{
  const key=active,state=states[key];if(!state.saved)return;
  if(state.dirty&&!confirm('当前还有未保存修改，要重开上次保存的版本吗？'))return;
  const response=await fetch(state.saved.url);if(response.ok)await sendFile(key,state.saved.name,await response.arrayBuffer());
});
window.addEventListener('beforeunload',event=>{if(Object.values(states).some(state=>state.dirty||state.pending)){event.preventDefault();event.returnValue=''}});
window.addEventListener('keydown',event=>{if(active==='word'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();comments.save();}});
activate(new URLSearchParams(location.search).get('app')||'word');
