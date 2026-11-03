import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@ant-design/v5-patch-for-react-19';
import {App, ConfigProvider, Select} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {KnowledgePage} from '../src/pages/ReferencePages';
import AdminWorkspace from '../src/components/AdminWorkspace';
import ThemeBridge from '../src/components/ThemeBridge';
import {UiSelect} from '../src/components/AntContent';
import PersonPicker from '../src/components/PersonPicker';
import '../src/styles.css';
import '../src/antd-ui.css';
import '../src/ui-polish.css';

// Synthetic records only; no backend, credentials or user data are needed.
const state = {
  accountsById: {sr: {enabled:true}, tech: {enabled:true, name:'测试工程师'}},
  businessUnits: [{id:'A', name:'测试 BU'}], projects: [],
  buPersonnelByBuId: {A: [{userId:'sr', roles:['SR'], enabled:true}, {userId:'tech', roles:['技术'], enabled:true}]},
};
const permissionContext = {state, actorId:'sr', buId:'A'};
localStorage.setItem('rfq.reference.knowledge.v1:A', '[]');
localStorage.setItem('rfq.reference.evidence.v1:A', JSON.stringify([
  {id:'D1', name:'测试历史文档.pdf', version:1, buId:'A', status:'有效', expiry:'2099-12-31', purpose:'能力依据', scope:'FEP 授权项目'},
]));

function Controls() {
  const [base,setBase] = useState(), [wrapped,setWrapped] = useState(), [person,setPerson] = useState('');
  return <main style={{padding:32, display:'grid', gap:24, maxWidth:600}}>
    <h1>公共下拉控件</h1>
    <Select aria-label="基础选择框" placeholder="基础选择框" value={base} onChange={setBase}
      options={[{value:'a',label:'选项一'},{value:'b',label:'选项二'}]}/>
    <UiSelect aria-label="通用选择框" placeholder="通用选择框" value={wrapped} onChange={e=>setWrapped(e.target.value)}>
      <option value="a">选项一</option><option value="b">选项二</option>
    </UiSelect>
    <PersonPicker label="选择确认人员" people={[{id:'tech',name:'测试工程师'}]} value={person} onChange={setPerson}/>
  </main>;
}

const controls = new URLSearchParams(location.search).get('mode') === 'controls';
createRoot(document.getElementById('root')).render(
  <ConfigProvider locale={zhCN} theme={{token:{colorPrimary:'#1677ff',fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif"}}}>
    <App><ThemeBridge>{controls ? <Controls/> :
      <AdminWorkspace page="knowledge" actorRole="SR" permissionContext={permissionContext} onNavigate={()=>{}}>
        <KnowledgePage actorId="sr" actorRole="SR" permissionContext={permissionContext} toast={()=>{}}/>
      </AdminWorkspace>
    }</ThemeBridge></App>
  </ConfigProvider>
);
