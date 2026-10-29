import React from 'react';
import {getEligiblePersonnel,personName} from '../personnelDomain';
import PersonPicker from './PersonPicker';

export default function ReviewerPicker({state,project,value=[],onChange,disabled=false}){
 const people=getEligiblePersonnel(state,{buId:project.buId,projectId:project.id,duty:'confirm'});
 return <div role="group" aria-label="评审人（可多选）"><PersonPicker label="评审人（可多选）" multiple people={people} value={value} onChange={onChange} disabled={disabled} resolveName={id=>personName(state,id)} emptyLabel="暂无可选评审人，请在项目人员配置中添加有确认资格的成员"/></div>;
}
