import React,{useEffect,useState} from 'react';
import {Button,Checkbox,Input,Select,Space} from 'antd';

export const versionKey = row => JSON.stringify([row.id,row.version]);
const options = (rows, label) => rows.map(row=>({value:versionKey(row),label:label(row)}));

function Field({label,children,full=false}){
  return <label className={`field${full?' ref-full':''}`}><span>{label}</span>{children}</label>;
}

export default function CapabilityLibraryFields({form,onChange,models,processes,evidence,histories,projects,isNew,library}){
  const set=(key,value)=>onChange({...form,[key]:value});
  const model=models.find(row=>row.id===form.modelId&&row.version===form.modelVersion);
  const process=processes.find(row=>row.id===form.processId&&row.version===form.processVersion);
  const history=histories.find(row=>row.id===form.historySource?.id&&row.version===form.historySource?.version);
  const processesForModel=processes.filter(row=>row.modelId===model?.id&&(row.modelVersion??1)===model?.version);
  const references=form.evidenceRefs||[];
  const [suggestions,setSuggestions]=useState(null),[extractionError,setExtractionError]=useState('');
  useEffect(()=>{
    if(!history)return;
    let active=true;
    setSuggestions(null);setExtractionError('');
    library.extractHistoryMetrics(history).then(items=>{if(active)setSuggestions(items);})
      .catch(error=>{if(active)setExtractionError(error.message);});
    return ()=>{active=false;};
  },[history?.id,history?.version]);
  function applySuggestion(index){
    const {metric,operator,lower,upper,unit,conditions}=suggestions[index];
    onChange({...form,metric,operator,lower,upper,unit,conditions:conditions||form.conditions});
  }
  const chooseModel=key=>{
    const next=models.find(row=>versionKey(row)===key);
    onChange({...form,modelId:next?.id,modelVersion:next?.version,config:next?.config||'',processId:undefined,processVersion:undefined});
  };
  const chooseProcess=key=>{
    const next=processesForModel.find(row=>versionKey(row)===key);
    onChange({...form,processId:next?.id,processVersion:next?.version});
  };
  const chooseHistory=key=>{
    const next=histories.find(row=>versionKey(row)===key);
    const projectId=next?.projectId||next?.sourceProjectId||form.projectId;
    onChange({...form,historySource:next?{id:next.id,version:next.version}:undefined,projectId,
      evidenceRefs:projectId===form.projectId?references:[]});
  };
  const editReference=(index,patch)=>set('evidenceRefs',references.map((ref,i)=>i===index?{...ref,...patch}:ref));
  const evidenceInScope=evidence.filter(row=>row.scope==='BU共享'||form.projectId&&row.projectId===form.projectId);
  const select=(label,value,onChange,choices)=><Select aria-label={label} value={value} onChange={onChange}
    options={choices} style={{width:'100%'}}/>;
  const input=(label,key)=><Input aria-label={label} value={form[key]??''} onChange={event=>set(key,event.target.value)}/>;
  const area=(label,key)=><Input.TextArea aria-label={label} rows={2} value={form[key]||''} onChange={event=>set(key,event.target.value)}/>;
  return <>
    {isNew&&<>
      <Field label="来源历史 RFQ"><Select aria-label="来源历史 RFQ" allowClear showSearch optionFilterProp="label" placeholder="手动添加"
        value={history?versionKey(history):undefined} onChange={chooseHistory}
        options={options(histories,row=>`${row.title||row.requirement} · v${row.version}`)} style={{width:'100%'}}/></Field>
      {history&&<Field label="从历史答复提取的指标" full>
        {extractionError?<span role="alert">{extractionError}</span>:suggestions==null?'正在提取…':suggestions.length
          ? <><Select aria-label="历史答复指标" placeholder="选择指标带入草稿" style={{width:'100%'}}
              options={suggestions.map((item,index)=>({value:index,label:item.quote}))} onChange={applySuggestion}/>
            <small>请核对指标编码、数值类型、适用配置和证据后保存。</small></>
          : '未找到带明确运算符和单位的指标，可手工填写。'}
      </Field>}
      <Field label="可见范围"><Select aria-label="能力可见范围" value={form.projectId||''} disabled={!!(history?.projectId||history?.sourceProjectId)}
        onChange={projectId=>onChange({...form,projectId,evidenceRefs:[]})}
        options={[{value:'',label:'BU 共享'},...projects.map(project=>({value:project.id,label:project.name}))]} style={{width:'100%'}}/></Field>
    </>}
    <Field label="机型版本">{select('机型版本',model?versionKey(model):undefined,chooseModel,options(models,row=>`${row.name} · ${row.revision} · v${row.version}`))}</Field>
    <Field label="工艺版本">{select('工艺版本',process?versionKey(process):undefined,chooseProcess,options(processesForModel,row=>`${row.code} · ${row.name} · v${row.version}${row.enabled===false?'（已停用）':''}`))}</Field>
    <Field label="配置基线"><Input aria-label="配置基线" value={form.config||''} readOnly/></Field>
    <Field label="指标编码">{input('指标编码','metricCode')}</Field>
    <Field label="指标名称">{input('指标名称','metric')}</Field>
    <Field label="值类型">{select('值类型',form.valueType,value=>set('valueType',value),['保证值','典型值','单次测试值'].map(value=>({value,label:value})))}</Field>
    <Field label="运算符">{select('运算符',form.operator||undefined,operator=>onChange({...form,operator,lower:'',upper:'',lowerInclusive:true,upperInclusive:true}),
      [['LE','≤'],['LT','<'],['GE','≥'],['GT','>'],['EQ','='],['RANGE','区间']].map(([value,label])=>({value,label})))}</Field>
    <Field label="单位">{input('单位','unit')}</Field>
    {['GE','GT','EQ','RANGE'].includes(form.operator)&&<Field label={form.operator==='EQ'?'数值':'下限'}>{input(form.operator==='EQ'?'数值':'下限','lower')}</Field>}
    {['LE','LT','RANGE'].includes(form.operator)&&<Field label="上限">{input('上限','upper')}</Field>}
    {form.operator==='RANGE'&&<Space wrap><Checkbox checked={form.lowerInclusive===true} onChange={e=>set('lowerInclusive',e.target.checked)}>含下限</Checkbox><Checkbox checked={form.upperInclusive===true} onChange={e=>set('upperInclusive',e.target.checked)}>含上限</Checkbox></Space>}
    <Field label="适用条件" full>{area('适用条件','conditions')}</Field>
    <Field label="适用范围限制" full>{area('适用范围限制','limits')}</Field>
    <div className="ref-full">
      <p>证据版本和原文位置</p>
      {references.map((ref,index)=><Space key={index} wrap style={{marginBottom:8}}>
        <Select aria-label={`证据版本 ${index+1}`} value={ref.id?versionKey(ref):undefined} style={{minWidth:240}}
          options={options(evidenceInScope,row=>`${row.name} · v${row.version} · ${row.status}`)} onChange={key=>{
            const row=evidenceInScope.find(item=>versionKey(item)===key);
            editReference(index,{id:row.id,version:row.version,location:row.location||''});
          }}/>
        <Input aria-label={`证据位置 ${index+1}`} value={ref.location||''} onChange={e=>editReference(index,{location:e.target.value})}/>
        <Button onClick={()=>set('evidenceRefs',references.filter((_,i)=>i!==index))}>移除</Button>
      </Space>)}
      <Button disabled={references.length>=20} onClick={()=>set('evidenceRefs',[...references,{id:'',location:''}])}>添加证据引用</Button>
    </div>
  </>;
}
