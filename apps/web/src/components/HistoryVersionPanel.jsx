import React,{useState} from 'react';
import {Alert,Button,Empty,Modal,Select,Space,Table,Tag} from 'antd';
import {clausesForDocument} from '../historyKnowledge';
import {compareHistoryVersions,versionFamily} from '../historyVersions';

function ChangedText({value='',other=''}){
 if(value===other)return value||'—';
 let start=0,end=0;
 while(start<value.length&&start<other.length&&value[start]===other[start])start++;
 while(end<value.length-start&&end<other.length-start&&value[value.length-1-end]===other[other.length-1-end])end++;
 return <>{value.slice(0,start)}<mark>{value.slice(start,end?value.length-end:undefined)||'（空）'}</mark>{end?value.slice(-end):''}</>;
}

export default function HistoryVersionPanel({active,documents,clauses,onLocate}){
 const [opened,setOpened]=useState(false),[baseline,setBaseline]=useState(''),[target,setTarget]=useState(active.id),[filter,setFilter]=useState('变化');
 const family=documents.filter(doc=>!doc.legacy&&versionFamily(doc)===versionFamily(active)).sort((a,b)=>(b.revision||1)-(a.revision||1));
 const before=family.find(doc=>doc.id===baseline),after=family.find(doc=>doc.id===target);
 const ready=before&&after&&before.id!==after.id&&!['parsing','failed'].includes(before.parseStatus)&&!['parsing','failed'].includes(after.parseStatus);
 const changes=ready?compareHistoryVersions(clausesForDocument(before,clauses),clausesForDocument(after,clauses)):[];
 const kinds=['新增条款','删除条款','要求变更','答复变更','位置调整','未变化'];
 const options=family.map(doc=>({value:doc.id,label:`${doc.version} · ${doc.name}`}));
 function open(){setTarget(active.id);setBaseline(active.previousDocumentId||family.find(doc=>doc.id!==active.id)?.id||'');setOpened(true);}
 const content=(row,doc,other)=>row?<div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}><strong>{row.clauseNo||'无编号'} · {row.section||'正文'}</strong><p>要求：<ChangedText value={row.requirement} other={other?.requirement}/></p><p>答复：<ChangedText value={row.answer} other={other?.answer}/></p><p>条件：<ChangedText value={row.conditions} other={other?.conditions}/></p>{(row.modelOverride||row.configOverride)&&<p>机型／配置：{row.modelOverride||'—'} / {row.configOverride||'—'}</p>}<Button type="link" onClick={()=>{setOpened(false);onLocate(doc,row);}}>打开条款／定位原文</Button></div>:'—';
 return <section className="panel" style={{padding:20,marginBottom:16}}><Space wrap><strong>版本记录 · {family.length} 版</strong><Button disabled={family.length<2} onClick={open}>版本比对</Button></Space><Table size="small" rowKey="id" pagination={false} dataSource={family} columns={[
 {title:'版本',render:(_,doc)=><>{doc.version} {doc.id===active.id&&<Tag>当前查看</Tag>}</>},
 {title:'文件',dataIndex:'name'},{title:'上传人',dataIndex:'uploadedBy'},
 {title:'上传时间',render:(_,doc)=>doc.createdAt?new Date(doc.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'—'},
 {title:'变更说明',render:(_,doc)=>doc.changeNote||'—'},
 {title:'操作',render:(_,doc)=><Button type="link" onClick={()=>onLocate(doc)}>查看该版</Button>}
 ]}/><Modal title="历史 RFQ 版本比对" open={opened} onCancel={()=>setOpened(false)} footer={<Button onClick={()=>setOpened(false)}>关闭</Button>} width="min(1400px, 96vw)">
 <Space wrap><span>基准版</span><Select aria-label="比对基准版" style={{width:280}} value={baseline||undefined} options={options} onChange={setBaseline}/><span>目标版</span><Select aria-label="比对目标版" style={{width:280}} value={target} options={options} onChange={setTarget}/><Select aria-label="差异筛选" value={filter} style={{width:150}} onChange={setFilter} options={['变化','全部',...kinds,'待核对'].map(value=>({value,label:value}))}/></Space>
 {!ready?<Alert style={{marginTop:16}} type="info" message="请选择两个不同且已完成解析的版本。"/>:<>
 <Alert style={{margin:'16px 0'}} type="info" message="按条款最新内部修订比对；要求变化需重新确认答复。编号或内容无法唯一匹配时保留为新增／删除并提示核对，不自动沿用审核结论。"/>
 <Space wrap>{kinds.map(kind=><Tag key={kind}>{kind} {changes.filter(row=>row.kind===kind).length}</Tag>)}</Space>
 <Table rowKey="key" style={{marginTop:12}} scroll={{x:850}} pagination={{pageSize:10}} locale={{emptyText:<Empty description="当前筛选无差异"/>}} dataSource={changes.filter(row=>filter==='全部'||filter==='变化'&&row.kind!=='未变化'||filter==='待核对'&&(row.uncertain||row.needsReview)||filter===row.kind)} columns={[
 {title:'变化',width:160,render:(_,row)=><><Tag>{row.kind}</Tag>{row.uncertain&&<p>关联不确定，请人工核对</p>}{row.needsReview&&<p style={{color:'#b45309'}}>需确认答复</p>}</>},
 {title:`基准版 ${before.version}`,width:400,render:(_,row)=>content(row.before,before,row.after)},
 {title:`目标版 ${after.version}`,width:400,render:(_,row)=>content(row.after,after,row.before)}
 ]}/></>}
 </Modal></section>;
}
