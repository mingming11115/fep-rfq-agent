import {getEligiblePersonnel,getProjectFinalReview,getRequiredFinalReviewers,personName} from './personnelDomain.js';
import {createProjectReviewSettings} from './projectDomain.js';
import {applyFinalReviewDecision} from './finalReviewDomain.js';
import {getFinalReviewScope,snapshotFingerprint} from './snapshotDomain.js';
import {resolveRfqProcessBinding} from './rfqProcessBinding.js';
import {MODELS,PROCESSES} from './modelProcessSeeds.js';

const version=1;
const scenarios=[
  {kind:'partial-review',id:'RFQ-DEMO-PARTIAL-REVIEW',name:'【Mock】部分条款待评审 · 工艺验证设备'},
  {kind:'ready-final',id:'RFQ-DEMO-READY-FINAL',name:'【Mock】待发起最终评审 · 接口配套设备'},
  {kind:'approved-final',id:'RFQ-DEMO-FINAL-APPROVED',name:'【Mock】最终评审通过 · 安全防护设备'},
];
const projectMaps=['requirementsByProject','reviewsByProject','snapshotsByProject','documentsByProject','exportScopesByProject','commentsByProject','membersByProject'];
const template={id:'standard',title:'标准 RFQ 应答矩阵',version:'V2.1',description:'逐条列出客户要求、结论与最终答复，适合技术应答。'};
const mapping=Object.fromEntries(['clause','original','conclusion','draft','conditions','status'].map(key=>[key,key]));
const clauses=[
  {title:'安全防护与联锁',original:'防护门开启时停止危险运动，复位确认后方可恢复。',conclusion:'Comply',draft:'【模拟】配置门禁联锁，按双方确认的演示验收方案验证。',conditions:'',evidence:'【模拟】安全联锁验证报告 DEMO-SAF-001 V1'},
  {title:'公用设施接口',original:'提供电力、冷却水和排风接口要求及允许范围。',conclusion:'有条件 Comply',draft:'【模拟】按最终配置提供公用设施接口表。',conditions:'【模拟】现场参数与双方确认的接口表一致后实施。',evidence:'【模拟】接口配套条件表 DEMO-FAC-002 V1'},
  {title:'加工精度验证',original:'按双方确认的样品和测量方案提供精度验证记录。',conclusion:'Comply',draft:'【模拟】按确认后的样品、图纸和测量方案提供精度验证记录。',conditions:'',evidence:'【模拟】精度试验记录 DEMO-ACC-003 V1'},
  {title:'交货周期',original:'合同生效后8周内完成设备交付。',conclusion:'不满足',draft:'【模拟】演示排产周期为12周，需与客户核对交付安排。',conditions:'',evidence:'【模拟】排产基线 DEMO-SCH-004 V1'},
];

// Append new synthetic projects once. Never reset an existing project or a user's work.
export function addReviewScenarioDemos(state,{at=new Date().toISOString()}={}) {
  if(state.demoReviewScenariosVersion>=version) { return state; }
  const buId='BU-DEMO';
  const owner=getEligiblePersonnel(state,{buId,duty:'final-review',side:'sr'}).find(person=>person.userId==='demo-sales');
  const candidates=getEligiblePersonnel(state,{buId,duty:'final-review',side:'technical'});
  const technicalIds=['demo-technical','demo-technical-2','demo-technical-3'].filter(id=>candidates.some(person=>person.userId===id));
  if(!owner||!technicalIds.length) { return state; }
  const next=structuredClone(state),deadline=new Date(Date.parse(at)+14*86400000).toISOString().slice(0,10);
  for(const key of projectMaps)next[key]||={};
  const occupied=new Set([...next.projects.map(project=>project.id),...Object.keys(next.deletedProjectsById||{}),...Object.keys(next.requirementsByProject)]);
  for(const scenario of scenarios){
    if([...next.projects,...Object.values(next.deletedProjectsById||{}).map(record=>record.project)].some(project=>project?.demoReviewScenario===scenario.kind)) { continue; }
    let id=scenario.id,suffix=2;
    while(occupied.has(id))id=`${scenario.id}-${suffix++}`;
    occupied.add(id);
    const binding=resolveRfqProcessBinding({models:MODELS,processes:PROCESSES,modelId:'MOD-A-R2',processId:'PROC-A-R2-P1',buId});
    const project={id,name:scenario.name,customer:'演示客户（模拟）',buId,...binding,
      equipment:[binding.modelName,binding.modelRevision,binding.modelConfig].filter(Boolean).join(' · '),
      ownerId:owner.userId,owner:personName(next,owner.userId),createdById:owner.userId,
      participantIds:[owner.userId,...technicalIds],deadline,createdAt:at,version:1,sample:true,demoReviewScenario:scenario.kind,
      technicalReviewSettings:createProjectReviewSettings('all'),
      approvalConfig:{finalReviewers:{srId:owner.userId,technicalIds:[...technicalIds],technicalRepresentativeId:null}}};
    next.projects.push(project);
    const file={id:`${id}-SOURCE`,name:`${scenario.name}_客户要求（模拟）.pdf`,purpose:'要求来源',version:'V1.0',status:'完成',createdAt:at,parsedCount:clauses.length,sample:true,visibility:'项目成员可见'};
    const rows=clauses.map((clause,index)=>{
      const pending=scenario.kind==='partial-review'&&index>=2;
      return {...clause,id:`${id}-REQ-${index+1}`,clause:`${index+1}`,category:index===3?'商务':'技术',source:file.name,sourceFileId:file.id,sourceVersion:file.version,sourcePage:1,sourceOrder:index,sourceOriginal:clause.original,sectionPath:['模拟要求'],
        version:1,status:pending?'评审中':'已确认',needsReview:pending,readyForConfirmation:!pending,matchLevel:'none',score:0,remark:'【模拟】仅用于评审流程演示，不作为真实能力或对外承诺。',
        owner:personName(next,pending?technicalIds[(index-2)%technicalIds.length]:owner.userId),deadline,sample:true,
        ...(!pending?{confirmedAt:at,confirmedBy:personName(next,owner.userId),confirmedById:owner.userId}:{}),
      };
    });
    const reviews=rows.filter(row=>row.status==='评审中').map((row,index)=>{
      const reviewerId=technicalIds[index%technicalIds.length];
      return {id:`row-review-${row.id}`,requirementId:row.id,title:`【模拟评审】${row.title}`,kind:'review',type:'应答评审',source:'演示场景',status:'待处理',version:1,round:1,requirementVersion:1,
        ownerId:reviewerId,owner:personName(next,reviewerId),reviewerIds:[reviewerId],confirmations:{},deadline,
        description:'【模拟】核对本条客户要求、证据及应答，完成本人评审。',plan:'【模拟】核对演示依据与应答内容。',
        proposedDraft:row.draft,proposedConclusion:row.conclusion,conditions:row.conditions,evidence:row.evidence,reason:row.remark,sample:true,
        history:[{action:'创建模拟评审',actor:'系统演示',time:at,reason:'用于部分条款待评审演示'}]};
    });
    next.requirementsByProject[id]=rows;next.reviewsByProject[id]=reviews;next.snapshotsByProject[id]=[];next.documentsByProject[id]=[file];next.commentsByProject[id]=[];
    next.membersByProject[id]=project.participantIds.map(userId=>({id:userId,name:personName(next,userId),role:userId===owner.userId?'SR':'技术',status:'生效',scope:'模拟项目成员'}));
    const scope={rows:structuredClone(rows),sourceVersions:[`${file.id}:${file.version}`],configuration:{equipment:project.equipment,approvalConfig:structuredClone(project.approvalConfig),personnel:getFinalReviewScope(next,id)},template:structuredClone(template),mapping:{...mapping},attachments:[]};
    next.exportScopesByProject[id]=structuredClone(scope);
    if(scenario.kind==='approved-final'){
      let snapshot={id:`SNAP-${id}-V1`,projectId:id,status:'审批中',createdAt:at,createdBy:personName(next,owner.userId),createdById:owner.userId,rows:structuredClone(rows),
        finalReview:getProjectFinalReview(next,id),approvalScope:structuredClone(scope),approvalFingerprint:snapshotFingerprint(scope),template:structuredClone(template),mapping:{...mapping},approvalConfig:structuredClone(project.approvalConfig),attachments:[],unconfirmedComplyIds:[],sample:true,
        submissionReason:'【模拟】用于演示最终评审全部通过及正式导出入口。',history:[{action:'发起模拟最终评审',actor:personName(next,owner.userId),time:at,reason:'【模拟】全部应答已确认，冻结演示快照。'}]};
      for(const reviewer of getRequiredFinalReviewers(snapshot.finalReview))snapshot=applyFinalReviewDecision(snapshot,{...reviewer,result:'approved',reason:'【模拟】本方已核对演示应答和依据，同意本轮演示快照。',at});
      next.snapshotsByProject[id]=[snapshot];
    }
  }
  next.demoReviewScenariosVersion=version;
  return next;
}

export function addStoredReviewScenarioDemos(storage,state,options={}) {
  const next=addReviewScenarioDemos(state,options);
  if(next===state) { return state; }
  const beforeIds=new Set(state.projects.map(project=>project.id)),backupKey='fep-rfq-demo-before-review-scenarios-v1';
  const changes=[];
  if(storage.getItem(backupKey)===null) { changes.push([backupKey,JSON.stringify({savedAt:options.at||new Date().toISOString(),state})]); }
  for(const project of next.projects.filter(project=>!beforeIds.has(project.id)))changes.push([`fep-rfq-documents:${project.id}`,JSON.stringify({files:next.documentsByProject[project.id],parsed:next.requirementsByProject[project.id]})]);
  changes.push(['fep-rfq-app-v1',JSON.stringify(next)]);
  const written=[];
  try{
    for(const [key,value]of changes){const previous=storage.getItem(key);storage.setItem(key,value);written.push([key,previous]);}
  }catch(error){
    console.error('写入演示评审场景失败', error);
    for(const [key,previous]of written.reverse())if(previous===null) { storage.removeItem(key); } else { storage.setItem(key,previous); }
    throw error;
  }
  return next;
}
