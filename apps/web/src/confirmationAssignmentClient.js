import {api as defaultApi} from './authClient.js';
export const confirmationCandidates=(id,api=defaultApi)=>api.get('/requirements/'+encodeURIComponent(id)+'/confirmation-candidates');
export const assignConfirmation=(id,{userId,version,reason},api=defaultApi)=>api.patch('/requirements/'+encodeURIComponent(id)+'/confirmation-assignment',{userId,version,reason});
