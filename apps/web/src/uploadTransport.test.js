import test from 'node:test';
import assert from 'node:assert/strict';

async function transport(){const module=await import('./uploadTransport.js').catch(()=>null);assert.ok(module?.uploadWithProgress,'upload progress transport is implemented');return module.uploadWithProgress;}
class UploadRequest {
 headers={};upload={};status=200;responseText='{"code":0,"data":{"id":"D"}}';
 open(method,url){this.method=method;this.url=url;}
 setRequestHeader(name,value){this.headers[name]=value;}
 getAllResponseHeaders(){return 'Content-Type: application/json\r\n';}
 send(body){this.body=body;}
 abort(){this.onabort?.();}
}
test('upload reports measured bytes and preserves request headers and server response',async()=>{
 const upload=await transport(),previous=globalThis.XMLHttpRequest;let xhr;
 globalThis.XMLHttpRequest=class extends UploadRequest{constructor(){super();xhr=this;}};
 try{
  const progress=[],body=new FormData();body.append('file',new Blob(['abc']),'x.pdf');
  const result=upload('/api/rfq/projects/P/documents',{method:'POST',body,headers:{Authorization:'Bearer token'}},event=>progress.push(event));
  xhr.upload.onprogress({lengthComputable:true,loaded:25,total:100});
  assert.deepEqual(progress,[{loaded:25,total:100,percent:25}]);
  assert.equal(xhr.headers.authorization,'Bearer token');assert.equal(xhr.body,body);
  xhr.onload();assert.deepEqual(await (await result).json(),{code:0,data:{id:'D'}});
 }finally{globalThis.XMLHttpRequest=previous;}
});
test('unknown upload size stays indeterminate and abort rejects with AbortError',async()=>{
 const upload=await transport(),previous=globalThis.XMLHttpRequest;let xhr;
 globalThis.XMLHttpRequest=class extends UploadRequest{constructor(){super();xhr=this;}};
 try{
  const progress=[],controller=new AbortController();
  const pending=upload('/upload',{method:'POST',signal:controller.signal},event=>progress.push(event));
  xhr.upload.onprogress({lengthComputable:false,loaded:15,total:0});
  assert.equal(progress[0].percent,undefined);controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
 }finally{globalThis.XMLHttpRequest=previous;}
});

test('empty responses settle and upload authentication failures clear the session',async()=>{
 const upload=await transport(),previousXHR=globalThis.XMLHttpRequest,previousStorage=globalThis.localStorage;let xhr;
 const entries=new Map();globalThis.localStorage={getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
 globalThis.XMLHttpRequest=class extends UploadRequest{constructor(){super();xhr=this;}};
 try{
  const empty=upload('/upload');xhr.status=204;xhr.responseText='';xhr.onload();assert.equal((await empty).status,204);
  const {api,persistSession,readSession,subscribeSession}=await import('./authClient.js');
  persistSession({token:'test-token',user:{id:'U'}});const snapshots=[],unsubscribe=subscribeSession(value=>snapshots.push(value));
  try{
   const denied=api.upload('/documents',new FormData(),{onUploadProgress:()=>{}});
   assert.equal(xhr.headers.authorization,'Bearer test-token');xhr.status=401;xhr.responseText='{"code":401,"msg":"expired"}';xhr.onload();
   await assert.rejects(denied,{message:'expired',status:401});assert.equal(readSession(),null);assert.deepEqual(snapshots,[null]);
  }finally{unsubscribe();}
 }finally{globalThis.XMLHttpRequest=previousXHR;globalThis.localStorage=previousStorage;}
});
