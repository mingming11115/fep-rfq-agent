export const panePreferenceKey=(actorId,projectId,layout)=>'rfq.workbench.share:'+JSON.stringify([actorId,projectId,layout]);
export function readPaneShare(storage,key,fallback){
  try{const raw=storage.getItem(key);if(raw==null||raw==='') { return fallback; } const value=Number(raw);return Number.isFinite(value)&&value>=10&&value<=90?value:fallback;}catch (error){ console.error('读取窗格比例失败', error); return fallback;}
}
export function savePaneShare(storage,key,value){
  if(!Number.isFinite(value)||value<10||value>90) { return; }
  try{storage.setItem(key,String(value));}catch (error){ console.error('保存窗格比例失败', error); /* Storage restrictions must not block resizing. */}
}
