import {nodeEnabled} from './genericCatalog.js';
export const UNGROUPED='__ungrouped';
export const ALL_GROUPS='__all_groups';
export function resourceGroupIds(kind,row={},catalog){
 const values=Array.isArray(row.groupIds)?row.groupIds:[...(row.groupId?[row.groupId]:[]),...(kind==='capability'?(catalog?.attachments||[]).filter(a=>a.capabilityId===row.id&&a.version===(row.version||1)).map(a=>a.nodeId):[])];
 return [...new Set(values)].filter(id=>catalog.nodes.some(n=>n.id===id));
}
export function matchesResourceGroup(kind,row,groupId,catalog){
 if(row.buId&&row.buId!==catalog.buId)return false;
 if(groupId===ALL_GROUPS)return true;
 const ids=resourceGroupIds(kind,row,catalog);return groupId===UNGROUPED?!ids.length:ids.includes(groupId);
}
export function validateResourceGroups(catalog,values=[],previous=[]){
 if(!Array.isArray(values))throw new Error('分组关联格式无效');
 const ids=[...new Set(values)];for(const id of ids){if(!catalog.nodes.some(n=>n.id===id))throw new Error('关联分组不存在或不属于当前BU');if(!previous.includes(id)&&!nodeEnabled(catalog,id))throw new Error('不能关联停用的分组');}return ids;
}
