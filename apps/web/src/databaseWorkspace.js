import {api as defaultApi} from './authClient.js';
import {hydrateSessionPersonnel} from './sessionPersonnel.js';
import {reconcileTasks} from './taskDomain.js';

const roleNames={SR:'SR',TECH:'技术',APPROVER:'技术'};
async function pages(path,api,filters={}){
 const rows=[];
 for(let page=1;;page++){
  const query=new URLSearchParams({page,size:100,...filters});
  const result=await api.get(`${path}?${query}`),items=result.list||[];
  rows.push(...items);
  if(rows.length>=result.total)return rows;
  if(!items.length)throw new Error('数据库分页数据不完整，请刷新重试');
 }
}
function sectionPath(value){
 if(Array.isArray(value))return value;
 if(!value)return [];
 try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed;}catch{}
 return [value];
}
export function mapDatabaseRequirement(row,files,owner){
 const file=files.find(file=>file.id===row.documentId);
 return {...row,clause:row.customerClauseNo||'',original:row.originalText||'',sourceOriginal:row.originalText||'',
  source:file?.name||'',sourceFileId:row.documentId,sourceVersion:file?.version||'V1.0',activeForApproval:file?.activeForApproval!==false,sectionPath:sectionPath(row.sectionPath),
  category:'未分类',status:'待确认',conclusion:'',draft:'',conditions:row.conditionsText||'',evidence:'',reason:'',
  matchLevel:'none',score:0,backendVersion:row.version,version:Math.max(1,row.version),owner,
  confirmationAssigneeId:row.confirmationAssigneeId||null,confirmationAssignmentSource:row.confirmationAssigneeId?'explicit':null,
  parserNote:row.reviewReasons||'',needsReview:row.extractionStatus!=='VALID',
 };
}
export function mapDatabaseWorkspace({user,projects,archivedProjects=[],directories,details,resources={}}){
 const state={dataSource:'mysql',personnelSchemaVersion:1,schemaVersion:3,projects:[],archivedProjects,businessUnits:[...(user.bus||[])],
  accountsById:{},buPersonnelByBuId:{},buReviewSettingsByBuId:{},members:[],membersByProject:{},
  requirementsByProject:{},documentsByProject:{},reviewsByProject:{},snapshotsByProject:{},commentsByProject:{},exportScopesByProject:{},
  tasksById:{},analysisRuns:[],audit:[],deletedProjectsById:{},navigationContext:{},responseReviewSchemaVersion:1,resourcesByBuId:resources,
 };
 for(const [buId,members]of Object.entries(directories)){
  if(!state.businessUnits.some(unit=>unit.id===buId))state.businessUnits.push({id:buId,name:buId});
  state.buReviewSettingsByBuId[buId]={technicalMode:'all',version:1};
  state.buPersonnelByBuId[buId]=members.map(member=>{
   const previous=state.accountsById[member.userId];
   state.accountsById[member.userId]={id:member.userId,name:member.displayName||member.userId,enabled:previous?.enabled||member.enabled,systemAdmin:false,
    managedBuIds:[...(previous?.managedBuIds||[]),...(member.enabled&&member.roles.includes('BU_ADMIN')?[buId]:[])]};
   return {...member,codes:member.roles,roles:[...new Set(member.roles.map(role=>roleNames[role]).filter(Boolean))]};
  });
 }
 for(const row of projects){
  const workflow=details[row.id]?.workflow||{},metadata=workflow.metadata||{};
  const members=state.buPersonnelByBuId[row.buId]||[],owner=state.accountsById[row.ownerId]?.name||row.ownerId;
  state.projects.push({...metadata,...row,backendStage:row.stage,backendProjectId:row.id,backendBuId:row.buId,owner,createdById:row.createdBy||'',
   defaultConfirmationAssigneeId:workflow.defaultConfirmationAssigneeId,
   workVersion:workflow.workVersion||1,replacements:workflow.replacements||[],
   participantIds:[...new Set([...(workflow.participantIds||metadata.participantIds||[]),row.ownerId,workflow.defaultConfirmationAssigneeId,user.id].filter(Boolean))],equipment:metadata.equipment||'',responseReviewSchemaVersion:1,
   technicalReviewSettings:metadata.technicalReviewSettings||{technicalMode:'all',version:1},approvalConfig:metadata.approvalConfig||{finalReviewers:{srId:null,technicalIds:[],technicalRepresentativeId:null}},
  });
  const replacements=workflow.replacements||[];
  const retired=new Set(replacements.flatMap(item=>item.status==='active'?[item.oldDocumentId]:item.status==='cancelled'?[item.newDocumentId]:[]));
  const pending=new Set(replacements.filter(item=>item.status==='pending').map(item=>item.newDocumentId));
  const documents=(details[row.id]?.documents||[]).map(file=>({...file,backendDocumentId:file.id,backendProjectId:row.id,
   retired:retired.has(file.id),activeForApproval:!retired.has(file.id)&&!pending.has(file.id),
   version:`V${file.version}.0`,purpose:'要求来源',size:file.sizeBytes,
   status:({PARSED:'完成',UPLOADED:'待核对',PARSING:'处理中',PARTIAL:'部分完成',FAILED:'失败'})[file.status]||file.status,
  }));
  state.documentsByProject[row.id]=documents.filter(file=>!file.retired);
  state.requirementsByProject[row.id]=(details[row.id]?.requirements||[]).filter(requirement=>!retired.has(requirement.documentId)).map(requirement=>{
   const source=mapDatabaseRequirement(requirement,documents,owner),response=workflow.responses?.find(r=>r.id===requirement.id)||{};
   return {...source,...response,id:source.id,projectId:row.id,title:source.title,clause:source.clause,original:source.original,sourceOriginal:source.sourceOriginal,
    source:source.source,sourceFileId:source.sourceFileId,sourceVersion:source.sourceVersion,sectionPath:source.sectionPath,backendVersion:source.backendVersion,
    confirmationAssigneeId:source.confirmationAssigneeId||response.confirmationAssigneeId||null,
    confirmationAssignmentSource:source.confirmationAssignmentSource||response.confirmationAssignmentSource||null};
  });
  state.membersByProject[row.id]=members.filter(member=>[row.ownerId,user.id].includes(member.userId)).map(member=>({
   id:member.userId,name:member.displayName,role:member.roles.join(' / '),scope:'后端授权项目',status:member.enabled?'生效':'停用',canConfirm:member.canConfirm,
  }));
  const requirementIds=new Set(state.requirementsByProject[row.id].map(requirement=>requirement.id));
  state.reviewsByProject[row.id]=(workflow.reviews||[]).filter(review=>!review.requirementId||requirementIds.has(review.requirementId));state.snapshotsByProject[row.id]=workflow.snapshots||[];state.commentsByProject[row.id]=[];
 }
 state.activeProjectId=state.projects[0]?.id||'';
 return reconcileTasks(hydrateSessionPersonnel(state,user,{activate:true}));
}
export async function loadDatabaseWorkspace(user,api=defaultApi){
 if(!user?.id)throw new Error('登录会话不存在，请重新登录');
 const [projects,archivedProjects]=await Promise.all([pages('/projects',api),pages('/projects',api,{archived:true})]);
 const buIds=[...new Set([...(user.roles||[]).map(grant=>grant.buId),...projects.map(project=>project.buId)])];
 const [directories,details,resources]=await Promise.all([
  Promise.all(buIds.map(async id=>[id,await api.get(`/business-units/${encodeURIComponent(id)}/members`)])),
  Promise.all(projects.map(async project=>{
   const path=`/projects/${encodeURIComponent(project.id)}`;
   const [documents,requirements,workflow]=await Promise.all([pages(`${path}/documents`,api),pages(`${path}/requirements`,api),api.get(`${path}/workflow-records`)]);
   return [project.id,{documents,requirements,workflow}];
  })),
  Promise.all(buIds.map(async id=>[id,await api.get(`/business-units/${encodeURIComponent(id)}/resources`)])),
 ]);
 return mapDatabaseWorkspace({user,projects,archivedProjects,directories:Object.fromEntries(directories),details:Object.fromEntries(details),resources:Object.fromEntries(resources)});
}
