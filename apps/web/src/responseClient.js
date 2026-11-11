import {api} from './authClient.js';
import {normalizeResponseRemark} from './responseFields.js';

const responsePath=id=>`/requirements/${encodeURIComponent(id)}/response`;
const revisions=row=>({version:row.version||1,sourceVersion:row.backendVersion});

export function writeResponse(row,patch,confirm=false,client=api,matchChoice){
 const path=responsePath(row.id),body={...revisions(row),...matchChoice};
 const responsePatch=patch?normalizeResponseRemark(patch):patch;
 return confirm?client.post(`${path}/confirm`,responsePatch?{...body,patch:responsePatch}:body):client.patch(path,{...body,patch:responsePatch});
}

export const loadResponseHistory=(id,client=api)=>client.get(`${responsePath(id)}/history`);

export function restoreResponse(row,{kind,historyVersion},client=api){
 return client.post(`${responsePath(row.id)}/restore`,{...revisions(row),kind,historyVersion});
}
