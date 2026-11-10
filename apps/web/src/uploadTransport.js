// Keep the same Response contract as fetch while exposing real upload bytes.
export function uploadWithProgress(url, {method='POST',body,headers,signal}={}, onProgress) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('请求已取消','AbortError'));return;}
    const xhr=new XMLHttpRequest();
    const abort=()=>xhr.abort();
    const finish=(callback,value)=>{signal?.removeEventListener('abort',abort);callback(value);};
    xhr.open(method,url,true);
    new Headers(headers).forEach((value,name)=>xhr.setRequestHeader(name,value));
    xhr.upload.onprogress=event=>onProgress?.({loaded:event.loaded,total:event.lengthComputable?event.total:undefined,
      percent:event.lengthComputable&&event.total>0?Math.min(100,event.loaded/event.total*100):undefined});
    xhr.upload.onload=event=>onProgress?.({loaded:event.loaded,total:event.lengthComputable?event.total:undefined,percent:100});
    xhr.onload=()=>{
      if(!xhr.status){finish(reject,new TypeError('网络请求未完成'));return;}
      try{
        finish(resolve,new Response([204,205,304].includes(xhr.status)?null:xhr.responseText,{status:xhr.status,headers:new Headers(
          xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).filter(Boolean).map(line=>{const i=line.indexOf(':');return [line.slice(0,i),line.slice(i+1).trim()];})
        )}));
      }catch(error){ console.error('读取文件上传响应失败'); finish(reject,error);}
    };
    xhr.onerror=()=>finish(reject,new TypeError('网络请求未完成'));
    xhr.onabort=()=>finish(reject,new DOMException('请求已取消','AbortError'));
    signal?.addEventListener('abort',abort,{once:true});
    try{xhr.send(body);}catch(error){ console.error('发送文件上传请求失败', error); finish(reject,error);}
  });
}
