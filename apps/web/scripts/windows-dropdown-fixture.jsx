import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@ant-design/v5-patch-for-react-19';
import {App, Button, ConfigProvider, DatePicker, Dropdown, Select} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {KnowledgePage} from '../src/pages/ReferencePages';
import AdminWorkspace from '../src/components/AdminWorkspace';
import ThemeBridge from '../src/components/ThemeBridge';
import {UiSelect} from '../src/components/AntContent';
import PersonPicker from '../src/components/PersonPicker';
import BuMetricLabel from '../src/components/BuMetricHelp';
import {EMPTY_CARD_FILTERS, ResponseCardQuery} from '../src/components/ResponseCardFilters';
import {Modal, Drawer} from '../src/components/ui';
import RfqApp from '../src/App';
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

function PopupControls() {
  const [surface,setSurface] = useState(null), [date,setDate] = useState(''), [menu,setMenu] = useState('');
  const [filters,setFilters] = useState(EMPTY_CARD_FILTERS), [draft,setDraft] = useState(EMPTY_CARD_FILTERS);
  const Surface = surface === 'modal' ? Modal : Drawer;
  return <main style={{padding:32,display:'grid',gap:24,maxWidth:640}}>
    <h1>浮层兼容性检查</h1>
    <DatePicker aria-label="兼容性日期" onChange={(_,value)=>setDate(value)}/>
    <output data-testid="picked-date">{date}</output>
    <Dropdown trigger={['click']} menu={{items:[{key:'selected',label:'选择菜单项'}],onClick:({key})=>setMenu(key)}}>
      <Button>兼容性菜单</Button>
    </Dropdown>
    <output data-testid="picked-menu">{menu}</output>
    <BuMetricLabel metric="平均审批时长"/>
    <ResponseCardQuery filters={filters} draft={draft} sources={['测试来源']} onDraftChange={setDraft} onApply={setFilters}/>
    <output data-testid="applied-filter">{filters.type}</output>
    <Button onClick={()=>setSurface('modal')}>打开兼容性弹窗</Button>
    <Button onClick={()=>setSurface('drawer')}>打开兼容性抽屉</Button>
    {surface&&<Surface title={surface==='modal'?'兼容性弹窗':'兼容性抽屉'} onClose={()=>setSurface(null)}>
      <DatePicker aria-label="容器内日期" onChange={(_,value)=>setDate(value)}/>
      <Select aria-label="容器内选项" style={{width:'100%',marginTop:16}} options={[{value:'a',label:'容器选项一'},{value:'b',label:'容器选项二'}]}/>
    </Surface>}
  </main>;
}

const mode = new URLSearchParams(location.search).get('mode');
createRoot(document.getElementById('root')).render(
  <ConfigProvider locale={zhCN} theme={{token:{colorPrimary:'#1677ff',fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif"}}}>
    <App><ThemeBridge>{mode === 'controls' ? <Controls/> : mode === 'popups' ? <PopupControls/> : mode === 'application' ? <RfqApp/> :
      <AdminWorkspace page="knowledge" actorRole="SR" permissionContext={permissionContext} onNavigate={()=>{}}>
        <KnowledgePage actorId="sr" actorRole="SR" permissionContext={permissionContext} toast={()=>{}}/>
      </AdminWorkspace>
    }</ThemeBridge></App>
  </ConfigProvider>
);
