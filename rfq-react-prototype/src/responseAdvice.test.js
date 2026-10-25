import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from './responseAdvice.js';
const row={title:'安全防护与联锁',matchLevel:'standard',score:92,original:'安全门打开时停止加工'};
const suggestion={conclusion:'Comply',version:'V2',evidence:'安全方案 V2 第4页',conditions:''};

test('a standard reply with evidence does not invent an unresolved applicability check',()=>{
 const advice=model.buildResponseAdvice(row,suggestion);
 assert.equal(advice?.conclusion,'满足');
 assert.equal(advice?.reference,'标准回复 V2');
 assert.equal(advice?.evidence,'安全方案 V2 第4页');
 assert.deepEqual(advice?.checks,[]);
});

test('a parameter comparison that passes with matching conditions is not listed as pending',()=>{
 const check={label:'最大切缝宽度',requested:{value:50,unit:'μm',operator:'<='},capability:{value:0.05,unit:'mm'},contextMatches:true,evidence:'已核对试切报告'};
 const advice=model.buildResponseAdvice({...row,matchLevel:'capability'},suggestion,{check});
 assert.equal(advice.conclusion,'满足');
 assert.deepEqual(advice.checks,[]);
});
test('conditional advice names the unconfirmed conditions and missing evidence',()=>{
 const advice=model.buildResponseAdvice({...row,matchLevel:'history'},{conclusion:'有条件 Comply',version:'V3',conditions:'选配 X 和 1.2 mm 硅晶圆试切',evidence:''});
 assert.equal(advice?.conclusion,'有条件满足');
 assert.equal(advice?.reference,'历史应答 V3');
 assert.ok(advice?.checks.some(item=>item.includes('选配 X 和 1.2 mm 硅晶圆试切')));
 assert.ok(advice?.checks.some(item=>item.includes('证据编号、版本和定位')));
});
test('changed customer source does not continue displaying an earlier matching recommendation',()=>{
 for(const changed of [{sourceRevision:true},{sourceCorrected:true}]){
  const advice=model.buildResponseAdvice({...row,...changed},suggestion);
  assert.equal(advice?.conclusion,'待确认');
  assert.equal(advice?.evidence,'');
  assert.deepEqual(advice?.checks,['按当前来源版本重新匹配并核对参考答复']);
 }
});
test('failed or inaccessible retrieval does not expose cached references or imply a successful match',()=>{
 for(const retrieval of ['failed','denied']){
  const advice=model.buildResponseAdvice(row,suggestion,{retrieval});
  assert.equal(advice?.conclusion,'待确认');
  assert.equal(advice?.evidence,'');
  assert.ok(!advice?.reference.includes('标准回复'));
 }
});
test('known parameter differences remain visible as a specific item to check',()=>{
 const check={label:'最大切缝宽度',requested:{value:50,unit:'μm',operator:'<='},capability:{value:0.06,unit:'mm'},contextMatches:false,conditions:'须验证 1.2 mm 硅晶圆',evidence:'试切报告'};
 const advice=model.buildResponseAdvice({...row,title:'最大切缝宽度',matchLevel:'history'},suggestion,{check});
 assert.ok(advice?.checks.some(item=>item.includes('≤50 μm')&&item.includes('60 μm')&&item.includes('差距 10 μm')));
 assert.ok(advice?.checks.some(item=>item.includes('1.2 mm 硅晶圆')));
});
test('a manual conclusion does not become a system suggestion when no reference exists',()=>{
 const input={...row,matchLevel:'none',conclusion:'Comply',draft:'人工答复'};
 const before=structuredClone(input);
 const advice=model.buildResponseAdvice(input,suggestion);
 assert.equal(advice?.conclusion,'待确认');
 assert.equal(advice?.reference,'暂无可用参考依据');
 assert.equal(advice?.evidence,'');
 assert.deepEqual(input,before);
});

test('the same report is listed once while references to different pages stay distinct',()=>{
 const check={label:'交期',requested:{value:12,unit:'周',operator:'<='},capability:{value:16,unit:'周'},contextMatches:true,evidence:'排产基线 SCH-016；非真实交期承诺'};
 const advice=model.buildResponseAdvice(row,{...suggestion,evidence:'排产基线 SCH-016；非真实交付承诺'},{check});
 assert.equal(advice.evidence,'排产基线 SCH-016；非真实交付承诺');
 const pages=model.buildResponseAdvice(row,{...suggestion,evidence:'报告 V1；第4页'},{check:{...check,evidence:'报告 V1；第5页'}});
 assert.equal(pages.evidence,'报告 V1；第4页；报告 V1；第5页');
});
