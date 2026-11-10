import {api} from './authClient.js';
import {getPersonnelContext} from './personnelDomain.js';

const encode = encodeURIComponent;
const buPath = buId => `/business-units/${encode(buId)}`;
const versionPath = (base, row) => `${base}/${encode(row.id)}/versions/${encode(row.version)}`;
const fields = (record, keys) => Object.fromEntries(keys.map(key => [key, record[key]]));
const scope = projectId => projectId ? {projectId} : {};

function uploadBody(file, extra = {}) {
  const body = new FormData();
  body.append('file', file);
  for (const [key, value] of Object.entries(extra)) {
    if (value != null) { body.append(key, value); }
  }
  return body;
}

export function libraryPermissions(context, role, kind) {
  const {state, actorId, buId} = context;
  const {member, enabled, managed} = getPersonnelContext(state, actorId, buId);
  const admin = role === 'BU管理员' && managed && member?.enabled !== false;
  const editor = enabled && member.roles.includes(role) && (kind !== 'capability'
    || role === '技术' && (!member.codes || member.codes.includes('TECH')));
  const qualification = kind === 'capability' ? 'capability-publish' : 'knowledge-publish';
  return {edit:admin || editor, approve:admin && !!member?.resourceQualifications?.includes(qualification), configure:admin};
}

export function loadLibraryResources(buId, client = api) {
  return client.get(`${buPath(buId)}/resources`);
}

export function createKnowledgeLibraryClient(buId, client = api) {
  const base = buPath(buId);
  const history = `${base}/history-rfq`;
  const capability = `${base}/capability-library`;
  const collections = {reply:`${base}/standard-replies`,history:`${history}/clauses`,capability:`${capability}/capabilities`,evidence:`${capability}/evidence`};
  const saveText = (kind, row) => client.patch(versionPath(collections[kind], row), {
    revision:row.revision ?? 0, ...fields(row,['title','requirement','answer','conditions']),
  });
  return {
    read:(kind,row)=>client.get(versionPath(collections[kind], row)),
    transition:(kind,row,action,reason='')=>client.post(`${versionPath(collections[kind], row)}/${action}`, {revision:row.revision ?? 0,reason}),
    saveReply:row=>saveText('reply', row),
    saveHistoryClause:row=>saveText('history', row),
    importReplies:file=>client.upload(`${collections.reply}/import`,uploadBody(file)),
    importHistory({file,responseFile,shareWithBu,projectId,previousDocumentId,revision,changeNote}) {
      if (Boolean(projectId) === Boolean(shareWithBu)) { throw new Error('请选择 BU 共享或一个项目范围'); }
      return client.upload(`${history}/import`,uploadBody(file,{responseFile,...(shareWithBu ? {shareWithBu:'true'} : {projectId}),
        previousDocumentId,revision,changeNote}));
    },
    editHistoryDocument:row=>client.patch(`${history}/documents/${encode(row.id)}`,{...fields(row,['metadata','groupIds']),revision:row.revision||0}),
    deleteHistoryDocument:row=>client.post(`${history}/documents/${encode(row.id)}/delete`,{revision:row.revision??0}),
    addHistoryClause:row=>client.post(`${history}/documents/${encode(row.documentId)}/clauses`,
      fields(row,['id','title','clauseNo','section','requirement','answer','conditions'])),
    createHistoryDocument:(row,projectId)=>client.post(`${history}/documents/manual`,{
      name:row.documentName,projectId,shareWithBu:!projectId,clause:fields(row,['id','title','clauseNo','section','requirement','answer','conditions']),
    }),
    reparseHistory:row=>client.post(`${history}/documents/${encode(row.id)}/reparse`,{revision:row.revision||0}),
    saveCatalog:catalog=>client.put(`${base}/knowledge-groups`,catalog),
    assignGroups:(kind,row,groupIds)=>client.patch(versionPath(`${base}/knowledge-groups/${encode(kind)}`,row),{
      revision:row.groupRevision||0,groupIds,
    }),
    historyOriginal:(id,part='main',options)=>client.download(`${history}/documents/${encode(id)}/original?part=${encode(part)}`,options),
    extractHistoryMetrics:row=>client.get(`${versionPath(`${capability}/history`,row)}/metrics`),
    importCapabilities:(file,projectId)=>client.upload(`${collections.capability}/import`,uploadBody(file,scope(projectId))),
    saveCapability(row, existing = false) {
      const body = {
        ...scope(row.projectId), ...fields(row,['modelId','modelVersion','processId','processVersion','config','metricCode',
          'metric','operator','lowerInclusive','upperInclusive','unit','valueType','conditions','limits']),
        lower:row.lower === '' ? null : row.lower,
        upper:row.upper === '' ? null : row.upper,
        evidence:(row.evidenceRefs || []).map(ref=>fields(ref,['id','version','location'])),
      };
      if (existing) { return client.patch(versionPath(collections.capability, row),{...body,revision:row.revision ?? 0}); }
      if (row.historySource) {
        return client.post(`${versionPath(`${capability}/history`,row.historySource)}/candidate`,body);
      }
      return client.post(collections.capability,body);
    },
    saveModel(row, existing) {
      const path = `${capability}/models`;
      return client.post(existing ? `${versionPath(path,row)}/revise` : path,
        {...fields(row,['code','name','config','series','lifecycle','standard','options']),modelRevision:row.revision});
    },
    saveProcess(row, existing) {
      const path = `${capability}/processes`;
      return client.post(existing ? `${versionPath(path,row)}/revise` : path,
        fields(row,['modelId','modelVersion','code','name','enabled','conditions']));
    },
    saveEvidence(row, existing) {
      const path = collections.evidence;
      return client.post(existing ? `${versionPath(path,row)}/revise` : path,
        {...fields(row,['name','source','location','conditions']),...scope(row.projectId),expiry:row.expiry || null});
    },
  };
}
