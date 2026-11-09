import React,{createContext,useContext} from 'react';
import {Select} from 'antd';
import {nodeEnabled,nodePath} from '../genericCatalog';
export const KnowledgeGroupContext=createContext(null);
export const useKnowledgeGroup=()=>useContext(KnowledgeGroupContext);
export default function GroupPicker({value=[],onChange,disabled=false,label='关联分组'}){
 const scope=useKnowledgeGroup();if(!scope) { return null; }
 return <div className="knowledge-group-picker"><label>{label}</label><Select aria-label={label} mode="multiple" allowClear showSearch optionFilterProp="label" style={{width:'100%'}} disabled={disabled} placeholder="可选择多个分组" value={value} options={scope.catalog.nodes.map(n=>({value:n.id,label:nodePath(scope.catalog,n.id),disabled:!nodeEnabled(scope.catalog,n.id)}))} onChange={onChange}/></div>;
}
