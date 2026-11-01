import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../../rfq-service/src/main/resources/office-plugin/clause-link.js',import.meta.url),'utf8');
function harness({controls=[],ranges=1,paragraph='甲',defer=false,deferInspection=false,currentControl=null}={}){
  const sent=[],calls=[],events={},timers=[],callbacks=[];let receive,selected=0;
  const top={postMessage:data=>sent.push(data)},origin='http://localhost:5173',channel='b221c509-e18c-4d97-a387-22f57e505a68';
  const api={GetDocument:()=>({GetCurrentParagraph:()=>({GetText:()=>paragraph}),Search:()=>Array.from({length:ranges},()=>({Select:()=>selected++}))})};
  const context={URLSearchParams,location:{origin,hash:'#channel='+channel+'?lang=zh-CN'},setTimeout:fn=>{timers.push(fn);},clearTimeout:()=>{},window:{top,addEventListener:(name,fn)=>receive=fn},Api:api,Asc:{scope:{},plugin:{
    executeMethod:(name,args,cb)=>{calls.push(name);if(name==='GetAllContentControls'){if(defer)callbacks.push(()=>cb(controls));else cb(controls);}else if(name==='GetCurrentContentControlPr'){const captured=currentControl;if(deferInspection)callbacks.push(()=>cb(captured));else cb(captured);}else if(name==='GetSelectedText')cb(paragraph);else if(name==='SearchNext'){selected++;cb(true);}else cb(null);},
    callCommand:(fn,close,calc,cb)=>{assert.equal(close,false);assert.equal(calc,false);cb(vm.runInContext('('+fn.toString()+')()',ctx));},
    attachEditorEvent:(name,fn)=>events[name]=fn,
  }}};
  const ctx=vm.createContext(context);vm.runInContext(code,ctx);context.Asc.plugin.init();
  return {sent,calls,events,timers,callbacks,setControl:value=>{currentControl=value;},get selected(){return selected;},navigate:(id='A',extra={})=>receive({origin,source:top,data:{type:'rfq:locate',channel,requestId:1,targets:[{id:'A',tag:'rfq:A',quote:'甲'},{id:'B',tag:'rfq:B',quote:'乙'}],targetId:id,...extra}})};
}
test('native plugin selects a unique tagged control and does not write document content',()=>{
  const h=harness({controls:[{Tag:'rfq:A',InternalId:'10'}]});h.navigate();
  assert.deepEqual(h.calls,['GetAllContentControls','SelectContentControl','GetSelectedText','SearchNext']);assert.equal(h.sent.at(-1).status,'matched');
});
test('ordinary Word quote must match exactly once before selecting any text',()=>{
  for(const [ranges,status]of [[0,'missing'],[1,'matched'],[2,'ambiguous']]){
    const h=harness({ranges});h.navigate();assert.equal(h.sent.at(-1).status,status);assert.equal(h.selected,ranges===1?1:0);
  }
});
test('user cursor movement reports a unique matching clause and avoids duplicate paragraph guesses',()=>{
  const h=harness({paragraph:'乙'});h.navigate();h.events.onClick();h.timers.at(-1)();assert.equal(h.sent.at(-1).id,'B');assert.equal(h.sent.at(-1).requestId,1);
  const ambiguous=harness({paragraph:'甲乙'});ambiguous.navigate();ambiguous.events.onClick();ambiguous.timers.at(-1)();assert.equal(ambiguous.sent.at(-1).type,'rfq:located');
});
test('reverse mapping refuses a quote duplicated elsewhere in the document',()=>{
  const h=harness({paragraph:'甲',ranges:2});h.navigate();h.events.onClick();h.timers.at(-1)();assert.equal(h.sent.at(-1).type,'rfq:located');
});
test('reverse mapping never conflates paragraphs with different whitespace',()=>{
  const h=harness({paragraph:'甲乙',ranges:1});h.navigate('A',{targets:[{id:'A',tag:'rfq:A',quote:'甲 乙'}]});h.events.onClick();h.timers.at(-1)();assert.equal(h.sent.at(-1).type,'rfq:located');
});
test('rapid navigation runs only the last queued target after the active command',()=>{
  const h=harness({defer:true});h.navigate('A');h.navigate('B',{requestId:2});h.navigate('A',{requestId:3});
  h.callbacks.shift()();h.callbacks.shift()();assert.deepEqual(h.sent.filter(m=>m.type==='rfq:located').map(m=>m.requestId),[1,3]);
});
test('an in-flight old cursor inspection is invalidated immediately when a new card arrives',()=>{
  const controls=[{Tag:'rfq:A',InternalId:'1'},{Tag:'rfq:B',InternalId:'2'}];
  const h=harness({controls,currentControl:controls[0],deferInspection:true});h.navigate('A');h.events.onClick();h.timers.at(-1)();
  h.navigate('B',{requestId:2});h.callbacks.shift()();
  assert.equal(h.sent.filter(message=>message.type==='rfq:selected').length,0);assert.equal(h.sent.at(-1).requestId,2);
});
test('duplicated content control tags cannot cause a reverse card jump',()=>{
  const controls=[{Tag:'rfq:A',InternalId:'1'},{Tag:'rfq:A',InternalId:'2'}];
  const h=harness({controls,currentControl:controls[0]});h.navigate();h.events.onClick();h.timers.at(-1)();
  assert.equal(h.sent.filter(message=>message.type==='rfq:selected').length,0);
});
test('rapid native cursor movement rechecks the last position after an older inspection',()=>{
  const controls=[{Tag:'rfq:A',InternalId:'1'},{Tag:'rfq:B',InternalId:'2'}];
  const h=harness({controls,currentControl:controls[1],deferInspection:true});h.navigate('A');h.events.onClick();h.timers.shift()();
  h.setControl(controls[0]);h.events.onClick();h.callbacks.shift()();
  assert.equal(h.sent.filter(message=>message.type==='rfq:selected').length,0);
  assert.equal(h.timers.length,1);h.timers.shift()();h.callbacks.shift()();assert.equal(h.sent.at(-1).id,'A');
});
