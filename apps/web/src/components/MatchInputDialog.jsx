import React, {useEffect, useState} from 'react';
import {Alert, Button, Checkbox, Input, Select, Space} from 'antd';
import {Modal} from './ui';

const versionKey = (id, version) => id ? `${id}:${version}` : undefined;
const optionKey = row => versionKey(row.id, row.version);
const operators = [['LE','≤'],['LT','<'],['GE','≥'],['GT','>'],['EQ','='],['RANGE','区间']];
const emptyMetric = () => ({metricCode:'', operator:'LE', unit:'', lower:null, upper:null, lowerInclusive:true, upperInclusive:true});
const emptyDevice = () => ({deviceId:'', config:'', conditions:'', metrics:[emptyMetric()]});
const textField = (label, value, onChange) =>
  <label className="field"><span>{label}</span><Input value={value ?? ''} onChange={event => onChange(event.target.value)}/></label>;

function DeviceFields({device, models, processes, onChange, onRemove}) {
  const set = (key, value) => onChange({...device, [key]:value});
  const updateMetric = (index, patch) => set('metrics', device.metrics.map((metric, i) => i === index ? {...metric, ...patch} : metric));
  const availableProcesses = processes.filter(row => row.modelId === device.modelId && row.modelVersion === device.modelVersion);
  return <fieldset>
    <legend>设备项</legend>
    <div className="form-grid">
      {textField('设备编号', device.deviceId, value => set('deviceId', value))}
      <label className="field"><span>机型版本</span><Select aria-label="机型版本"
        value={versionKey(device.modelId, device.modelVersion)} options={models.map(row => ({value:optionKey(row), label:`${row.name} · v${row.version}`}))}
        onChange={key => {
          const model = models.find(row => optionKey(row) === key);
          onChange({...device, modelId:model.id, modelVersion:model.version, config:model.config || '', processId:null, processVersion:null});
        }}/></label>
      <label className="field"><span>工艺版本</span><Select aria-label="工艺版本"
        value={versionKey(device.processId, device.processVersion)} options={availableProcesses.map(row => ({value:optionKey(row), label:`${row.name} · v${row.version}`}))}
        onChange={key => {
          const process = availableProcesses.find(row => optionKey(row) === key);
          onChange({...device, processId:process.id, processVersion:process.version});
        }}/></label>
      <label className="field"><span>配置基线</span><Input value={device.config || ''} readOnly/></label>
      {textField('已核对工况', device.conditions, value => set('conditions', value))}
    </div>
    {device.metrics.map((metric, index) => <div key={index} className="form-grid">
      {textField('指标编码', metric.metricCode, metricCode => updateMetric(index, {metricCode}))}
      {textField('单位', metric.unit, unit => updateMetric(index, {unit}))}
      <label className="field"><span>运算符</span><Select aria-label="运算符" value={metric.operator}
        options={operators.map(([value,label]) => ({value,label}))}
        onChange={operator => updateMetric(index, {operator, lower:null, upper:null})}/></label>
      {['GE','GT','EQ','RANGE'].includes(metric.operator) && textField(metric.operator === 'EQ' ? '数值' : '下限', metric.lower,
        lower => updateMetric(index, {lower:lower.trim() || null}))}
      {['LE','LT','RANGE'].includes(metric.operator) && textField('上限', metric.upper,
        upper => updateMetric(index, {upper:upper.trim() || null}))}
      {metric.operator === 'RANGE' && <Space>
        <Checkbox checked={metric.lowerInclusive} onChange={event => updateMetric(index, {lowerInclusive:event.target.checked})}>含下限</Checkbox>
        <Checkbox checked={metric.upperInclusive} onChange={event => updateMetric(index, {upperInclusive:event.target.checked})}>含上限</Checkbox>
      </Space>}
      <Button disabled={device.metrics.length === 1} onClick={() => set('metrics', device.metrics.filter((_, i) => i !== index))}>移除指标</Button>
    </div>)}
    <Space><Button disabled={device.metrics.length >= 8} onClick={() => set('metrics', [...device.metrics, emptyMetric()])}>添加指标</Button>
      <Button onClick={onRemove}>移除设备项</Button></Space>
  </fieldset>;
}

export default function MatchInputDialog({row, resources, client, onClose, onSaved}) {
  const [input, setInput] = useState(null);
  const [context, setContext] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    client.input(row.id).then(value => {
      if (!active) { return; }
      setInput(value);
      setContext({capabilityApplicable:null, verifiedConditions:'', ...value.context, devices:value.context?.devices ?? []});
    }).catch(error => { console.error('加载条款比对输入失败', error); if (active) { setError(error.message); } });
    return () => { active = false; };
  }, [client, row.id]);
  async function save() {
    setSaving(true);
    setError('');
    try {
      await client.saveInput(row.id, {version:input.version, sourceRequirementVersion:input.sourceRequirementVersion, context});
      onSaved();
    } catch (error) { console.error('保存条款比对输入失败', error); setError(error.message); }
    finally { setSaving(false); }
  }
  const set = (key, value) => setContext(current => ({...current, [key]:value}));
  const models = (resources?.models || []).filter(row => row.lifecycle !== '停用');
  const processes = (resources?.processes || []).filter(row => row.enabled !== false);
  return <Modal title="设置条款比对条件" width={760} onClose={() => { if (!saving) { onClose(); } }}
    footer={<Space><Button disabled={saving} onClick={onClose}>取消</Button>
      <Button type="primary" loading={saving} disabled={!context} onClick={save}>保存并比对</Button></Space>}>
    {error && <Alert type="error" message={error} showIcon/>}
    {!context ? !error && <p>正在加载比对条件…</p> : <>
      {textField('已核实的适用条件', context.verifiedConditions, value => set('verifiedConditions', value))}
      <label className="field"><span>机型能力是否适用</span><Select aria-label="机型能力是否适用"
        value={String(context.capabilityApplicable)}
        options={[{value:'null',label:'待确认'},{value:'true',label:'适用'},{value:'false',label:'不适用'}]}
        onChange={value => setContext(current => ({...current, capabilityApplicable:JSON.parse(value),
          devices:value === 'false' ? [] : current.devices}))}/></label>
      {context.devices.map((device, index) => <DeviceFields key={index} device={device} models={models} processes={processes}
        onChange={value => set('devices', context.devices.map((item, i) => i === index ? value : item))}
        onRemove={() => set('devices', context.devices.filter((_, i) => i !== index))}/>)}
      {context.capabilityApplicable !== false && <Button disabled={context.devices.length >= 8} onClick={() => set('devices', [...context.devices, emptyDevice()])}>添加设备项</Button>}
    </>}
  </Modal>;
}
