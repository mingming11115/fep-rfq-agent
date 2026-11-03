// Originals are blobs, kept out of localStorage and its small synchronous quota.
const database=()=>new Promise((resolve,reject)=>{
 if(!globalThis.indexedDB)return reject(new Error('浏览器未提供原件存储，请使用支持 IndexedDB 的浏览器'));
 const request=indexedDB.open('rfq-history-originals',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('files');
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(new Error('无法打开原件存储，请检查浏览器存储权限'));
});
async function transaction(mode,action){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('files',mode),request=action(tx.objectStore('files'));
  tx.oncomplete=()=>resolve(request.result);
  tx.onerror=tx.onabort=()=>reject(new Error('原件保存失败，可能是浏览器空间不足'));
 });}finally{db.close();}
}
const key=(buId,id)=>`${buId}:${id}`;
export const historyFiles={
 put:(buId,id,files)=>transaction('readwrite',store=>store.put(files,key(buId,id))),
 get:(buId,id)=>transaction('readonly',store=>store.get(key(buId,id))),
 delete:(buId,id)=>transaction('readwrite',store=>store.delete(key(buId,id))),
};
