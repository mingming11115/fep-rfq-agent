import {api,readSession} from './authClient.js';
import {resourceStorageKey} from './resourceVisibility.js';
import {historyFiles} from './historyFiles.js';
import {HISTORY_DOCUMENT_KEY,HISTORY_KNOWLEDGE_KEY,mergeHistoryParse} from './historyKnowledge.js';

const jobs=new Map();
const uploads=new Map();
const jobKey=(buId,id)=>`${buId}:${id}`;
const changed=()=>window.dispatchEvent(new CustomEvent('rfq-history-change'));
const read=(key,fallback)=>{const raw=localStorage.getItem(key);if(!raw)return fallback;const value=JSON.parse(raw);if(!Array.isArray(value))throw new Error('历史 RFQ 保存数据格式异常，请保留浏览器数据并联系维护人员');return value;};
export function readHistorySnapshot(buId,legacy=[]){
 return {documents:read(resourceStorageKey(HISTORY_DOCUMENT_KEY,buId),[]),clauses:read(resourceStorageKey(HISTORY_KNOWLEDGE_KEY,buId),legacy)};
}
export function writeHistorySnapshot(buId,{documents,clauses}){
 const documentKey=resourceStorageKey(HISTORY_DOCUMENT_KEY,buId),clauseKey=resourceStorageKey(HISTORY_KNOWLEDGE_KEY,buId);
 const previous=localStorage.getItem(documentKey);
 try{localStorage.setItem(documentKey,JSON.stringify(documents));localStorage.setItem(clauseKey,JSON.stringify(clauses));}
 catch{if(previous==null)localStorage.removeItem(documentKey);else localStorage.setItem(documentKey,previous);throw new Error('草稿保存失败，浏览器存储空间可能不足；请先下载原件并保留当前修改');}
 changed();
}
export const historyJobRunning=(buId,id)=>jobs.has(jobKey(buId,id));
const supported=file=>file&&/\.(docx|pdf)$/i.test(file.name)&&file.size>0&&file.size<=30*1024*1024;
async function fingerprint(file,responseFile){
 const digest=async source=>source?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await source.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join(''):'';
 return `${await digest(file)}:${await digest(responseFile)}`;
}
export async function startHistoryUpload({file,responseFile,buId,actor,legacy=[]},{files=historyFiles,parse=api.upload}={}){
 const previous=uploads.get(buId)||Promise.resolve();
 const pending=previous.catch(()=>{}).then(()=>upload({file,responseFile,buId,actor,legacy},{files,parse}));
 uploads.set(buId,pending);
 try{return await pending;}finally{if(uploads.get(buId)===pending)uploads.delete(buId);}
}
async function upload({file,responseFile,buId,actor,legacy},{files,parse}){
 if(!actor.canEdit)throw new Error('当前身份无上传权限');
 if(!supported(file)||responseFile&&!supported(responseFile))throw new Error('请选择非空 DOCX／PDF 文件，每个文件不超过 30 MiB');
 const hash=await fingerprint(file,responseFile),snapshot=readHistorySnapshot(buId,legacy),duplicate=snapshot.documents.find(doc=>doc.fingerprint===hash);
 if(duplicate){await files.put(buId,duplicate.id,{file,responseFile});return {document:duplicate,duplicate:true};}
 const document={id:`HD-${crypto.randomUUID()}`,buId,name:file.name,responseName:responseFile?.name||'',version:'V1',metadata:{},scope:'FEP 授权项目',parseStatus:'parsing',fingerprint:hash,createdAt:new Date().toISOString(),uploadedBy:actor.name||actor.id,uploadedById:actor.id,sources:[],issues:[]};
 await files.put(buId,document.id,{file,responseFile});
 try{writeHistorySnapshot(buId,{...snapshot,documents:[document,...snapshot.documents]});}
 catch(error){await files.delete(buId,document.id);throw error;}
 run(document,{file,responseFile},actor,{parse,legacy});
 return {document};
}
function run(document,originals,actor,{parse,legacy}){
 const key=jobKey(document.buId,document.id);
 const task=Promise.resolve().then(async()=>{
  try{
   const session=readSession();
   const parseBu=document.buId==='BU-DEMO'&&session?.user?.roles?.some(role=>role.buId==='BU-FEP')?'BU-FEP':document.buId;
   const body=new FormData();body.append('file',originals.file,originals.file.name||document.name);body.append('buId',parseBu);
   if(originals.responseFile)body.append('responseFile',originals.responseFile,originals.responseFile.name||document.responseName);
   const result=await parse('/history/parse',body);
   if(!Array.isArray(result?.clauses)||!Array.isArray(result?.sources)||!Array.isArray(result?.issues))throw new Error('解析服务返回格式异常，请重试');
   const latest=readHistorySnapshot(document.buId,legacy),current=latest.documents.find(doc=>doc.id===document.id);
   if(!current)return;
   const merged=mergeHistoryParse(current,latest.clauses,result,actor);
   writeHistorySnapshot(document.buId,{documents:latest.documents.map(doc=>doc.id===current.id?merged.document:doc),clauses:[...latest.clauses.filter(row=>row.documentId!==current.id),...merged.clauses]});
  }catch(error){
   const latest=readHistorySnapshot(document.buId,legacy);
   writeHistorySnapshot(document.buId,{...latest,documents:latest.documents.map(doc=>doc.id===document.id?{...doc,parseStatus:'failed',error:error.message}:doc)});
  }finally{jobs.delete(key);changed();}
 });
 jobs.set(key,task);task.catch(()=>{jobs.delete(key);changed();});
 return task;
}
export async function retryHistoryParse(document,actor,{files=historyFiles,parse=api.upload,legacy=[]}={}){
 if(!actor.canEdit)throw new Error('当前身份无解析权限');
 if(historyJobRunning(document.buId,document.id))return;
 const originals=await files.get(document.buId,document.id);
 if(!originals?.file)throw new Error('未找到原件，请重新选择相同文件上传');
 const latest=readHistorySnapshot(document.buId,legacy);
 writeHistorySnapshot(document.buId,{...latest,documents:latest.documents.map(doc=>doc.id===document.id?{...doc,parseStatus:'parsing',error:''}:doc)});
 return run(document,originals,actor,{parse,legacy});
}
