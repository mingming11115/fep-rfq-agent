import {api} from './authClient.js';
export function writeResponse(row,patch,confirm=false,client=api){
 const path=`/requirements/${encodeURIComponent(row.id)}/response`;
 const body={version:row.version||1,sourceVersion:row.backendVersion};
 return confirm?client.post(`${path}/confirm`,body):client.patch(path,{...body,patch});
}
