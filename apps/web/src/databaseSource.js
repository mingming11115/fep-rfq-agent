import {readSession} from './authClient.js';
import {uploadCraftFile} from './craftClient.js';

export async function loadDatabaseOriginal(file,{session=readSession(),fetcher=fetch,signal}={}){
 if(!session?.token)throw new Error('请先登录后读取原件');
 if(!file.backendDocumentId)throw new Error('文件尚未关联数据库原件');
 const response=await fetcher(`/api/rfq/documents/${encodeURIComponent(file.backendDocumentId)}/download`,{headers:{Authorization:`Bearer ${session.token}`},signal});
 if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.msg||'原件读取失败，请重试');}
 return new File([await response.blob()],file.name,{type:file.contentType||'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
export async function importDatabaseOriginal(file,source,signal){
 const original=await loadDatabaseOriginal(file,{signal});
 return uploadCraftFile(original,source,{signal});
}
