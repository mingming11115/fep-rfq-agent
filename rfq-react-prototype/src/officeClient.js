export const supportsOffice = name => /\.(docx|pdf)$/i.test(name || '');
export const officeSourceKey = (source, identity = '') => JSON.stringify([source.projectId,source.fileId,source.sourceVersion,identity]);
export const saveReached = (before, after) => !after.lastError && (after.revision > before.revision || Boolean(after.savedAt && after.savedAt !== before.savedAt));

export async function officeRequest(path, ref, options = {}) {
  const headers = new Headers(options.headers);
  if (ref?.access) headers.set('X-Office-Access',ref.access);
  let response;
  try { response = await fetch('/api/office'+path,{...options,headers}); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new Error('无法连接文档服务，请检查 RFQ 后端是否启动'); }
  if (options.binary && response.ok) return response.blob();
  const body = await response.json().catch(()=>null);
  if (!response.ok || body?.code !== 0) throw new Error(body?.msg || '文档服务暂不可用，请检查后端和 ONLYOFFICE 配置');
  return body.data;
}
export async function uploadOfficeFile(file, source, signal) {
  const body = new FormData(); body.append('file',file);
  for (const key of ['projectId','fileId','sourceVersion']) body.append(key,source[key] || '');
  return officeRequest('/documents',null,{method:'POST',body,signal});
}
const scripts = new Map();
export function loadOfficeApi(url) {
  if (window.DocsAPI) return Promise.resolve(window.DocsAPI);
  if (!scripts.has(url)) {
    const script = document.createElement('script'); script.src = url; script.async = true;
    const promise = new Promise((resolve,reject)=>{
      const failed = () => { clearTimeout(timer); script.remove(); scripts.delete(url); reject(new Error('ONLYOFFICE 未能加载，请确认文档服务已启动后重试')); };
      const timer = setTimeout(failed,25000);
      script.onerror = failed;
      script.onload = () => { clearTimeout(timer); if(window.DocsAPI)resolve(window.DocsAPI);else failed(); };
      document.head.appendChild(script);
    });
    scripts.set(url,promise);
  }
  return scripts.get(url);
}
export function officeCanLeave() {
  return !window.__rfqOfficeUnsaved?.dirty || window.confirm('文档修改尚未确认保存到服务器。建议先保存原文；仍要离开吗？');
}
export async function downloadOfficeFile(ref, kind = 'review') {
  const blob = await officeRequest(`/documents/${ref.id}/download?kind=${kind}`,ref,{binary:true});
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href=url; anchor.download=kind==='original'?ref.name:ref.name.replace(/(\.[^.]+)$/,'-批阅版$1');
  anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
