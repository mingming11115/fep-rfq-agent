import React from 'react';
import {Select} from 'antd';
import {conditionTags,conditionText} from '../knowledgeConditions';
export default function ConditionTagInput({value,onChange}){
 return <Select aria-label="适用条件" mode="tags" open={false} style={{width:'100%'}} value={conditionTags(value)} onChange={values=>onChange(conditionText(values))} tokenSeparators={['；',';','\n']} suffixIcon={null} placeholder="输入条件后按回车添加标签"/>;
}
