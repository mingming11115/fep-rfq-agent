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

test('Comply has no recommended exception wording',()=>{
 assert.equal(model.generateRecommendedWording({...row,conclusion:'Comply'}),'');
});
test('conditional wording retains the actual conditions and reason without changing the saved answer',()=>{
 const input={...row,clause:'2.1',conclusion:'有条件 Comply',conditions:'客户提供样品并完成1.2 mm材料试切',reason:'选配X需双方确认',draft:'原人工答复'};
 const before=structuredClone(input);
 const text=model.generateRecommendedWording(input);
 for(const value of ['2.1',row.title,input.conditions,input.reason])assert.ok(text.includes(value));
 assert.ok(text.includes('有条件'));
 assert.ok(!text.includes('已通过')&&!text.includes('无条件满足'));
 assert.deepEqual(input,before);
});
test('noncompliant wording states the gap without inventing an accepted alternative',()=>{
 const text=model.generateRecommendedWording({...row,conclusion:'不满足',reason:'当前排产为16周，客户要求12周'});
 assert.ok(text.includes('无法满足'));
 assert.ok(text.includes('当前排产为16周，客户要求12周'));
 assert.ok(text.includes('替代方案'));
 assert.ok(!text.includes('已批准')&&!text.includes('已接受'));
});
test('not-applicable wording includes its basis and keeps missing scope explicit',()=>{
 const text=model.generateRecommendedWording({...row,conclusion:'不适用',reason:'本次仅供设备，不含厂房改造'});
 assert.ok(text.includes('本次仅供设备，不含厂房改造'));
 const incomplete=model.generateRecommendedWording({...row,conclusion:'不适用'});
 assert.ok(incomplete.includes('不适用范围及依据尚待确认'));
});
test('pending or missing conclusions do not generate wording or change the manual draft',()=>{
 for(const conclusion of ['待确认',undefined,'','未评估']){
  const input={...row,conclusion,reason:'客户尚未提供最终图纸',draft:'已有人工草稿'};
  const before=structuredClone(input);
  assert.equal(model.generateRecommendedWording(input),'');
  assert.deepEqual(input,before);
 }
});
test('incomplete conditional wording does not invent a satisfied commitment',()=>{
 const conditional=model.generateRecommendedWording({...row,conclusion:'有条件 Comply'});
 assert.ok(conditional.includes('适用条件尚待确认'));
 assert.ok(!conditional.includes('已满足'));
});

test('source margin shows only Comply for a compliant clause, without its saved draft',()=>{
 const input={...row,conclusion:'Comply',draft:'保留的人工答复'};
 const before=structuredClone(input);
 const annotation=model.buildSourceResponseAnnotation?.(input);
 assert.equal(annotation?.kind,'comply');
 assert.equal(annotation?.label,'Comply');
 assert.equal(annotation?.wording,'');
 assert.deepEqual(input,before);
});

test('explicit exception conclusions show their corresponding recommendation in the source margin',()=>{
 for(const [conclusion,phrase] of [
  ['有条件 Comply','有条件响应'],['不满足','无法满足'],
  ['不适用','不适用'],
 ]){
  const annotation=model.buildSourceResponseAnnotation?.({...row,clause:'2.1',conclusion,conditions:'采用选配 X',reason:'需核对最终范围'});
  assert.equal(annotation?.kind,'recommendation',conclusion);
  assert.equal(annotation?.label,'推荐话术');
  assert.equal(annotation?.conclusion,conclusion);
  assert.ok(annotation?.wording.includes(phrase),conclusion);
  assert.ok(annotation?.wording.includes('2.1'));
  assert.ok(annotation?.wording.includes('采用选配 X'));
  assert.ok(annotation?.wording.includes('需核对最终范围'));
 }
});

test('source margin uses the latest saved response rather than an old parsed conclusion',()=>{
 const parsed={...row,conclusion:'Comply',conditions:'旧条件',draft:'解析时的草稿'};
 const response={conclusion:'不满足',conditions:'当前排产16周',reason:'客户要求12周',draft:'当前人工答复'};
 const before=structuredClone({parsed,response});
 const annotation=model.buildSourceResponseAnnotation?.(parsed,response);
 assert.equal(annotation?.kind,'recommendation');
 assert.equal(annotation?.conclusion,'不满足');
 assert.ok(annotation?.wording.includes('当前排产16周'));
 assert.ok(annotation?.wording.includes('客户要求12周'));
 assert.ok(!annotation?.wording.includes('旧条件'));
 assert.deepEqual({parsed,response},before);
 const compliant=model.buildSourceResponseAnnotation?.({...parsed,conclusion:'不满足'},{conclusion:'Comply'});
 assert.equal(compliant?.label,'Comply');
 assert.equal(compliant?.wording,'');
});

test('pending, missing or unrecognized source conclusions show only a pending marker',()=>{
 for(const conclusion of ['待确认',undefined,'','未评估']){
  const annotation=model.buildSourceResponseAnnotation?.({...row,conclusion});
  assert.equal(annotation?.kind,'pending');
  assert.equal(annotation?.label,'待确认');
  assert.equal(annotation?.conclusion,'待确认');
  assert.equal(annotation?.wording,'');
 }
});

test('source annotation filters match each conclusion exactly and allow all or no types',()=>{
 const rows=[
  {id:'yes',conclusion:'Comply'},
  {id:'conditional',conclusion:'有条件 Comply'},
  {id:'no',conclusion:'不满足'},
  {id:'na',conclusion:'不适用'},
  {id:'pending',conclusion:'待确认'},
 ];
 const before=structuredClone(rows);
 const ids=options=>model.selectSourceResponseAnnotations(rows,options).map(note=>note.row.id);
 assert.deepEqual(ids(),['yes','conditional','no','na','pending']);
 assert.deepEqual(ids({conclusions:['有条件 Comply','不满足','不适用','待确认']}),['conditional','no','na','pending']);
 assert.deepEqual(ids({conclusions:['Comply']}),['yes']);
 assert.deepEqual(ids({conclusions:['不满足','不适用']}),['no','na']);
 assert.deepEqual(ids({conclusions:[]}),[]);
 assert.deepEqual(rows,before);
});

test('source annotation filters follow current saved and edited conclusions without altering source rows',()=>{
 const rows=[{id:'one',conclusion:'Comply'},{id:'two',conclusion:'不满足'}];
 const responseRows=[{id:'one',conclusion:'不适用'}];
 const before=structuredClone({rows,responseRows});
 assert.deepEqual(model.selectSourceResponseAnnotations(rows,{responseRows,conclusions:['Comply']}),[]);
 const visible=model.selectSourceResponseAnnotations(rows,{
  responseRows,responsePreview:{id:'one',conclusion:'有条件 Comply',conditions:'采用选配 X'},conclusions:['有条件 Comply'],
 });
 assert.deepEqual(visible.map(note=>note.row.id),['one']);
 assert.equal(visible[0].annotation.conclusion,'有条件 Comply');
 assert.ok(visible[0].annotation.wording.includes('采用选配 X'));
 assert.deepEqual({rows,responseRows},before);
});

test('unrecognized conclusions remain available under pending annotations',()=>{
 const notes=model.selectSourceResponseAnnotations([{id:'unknown',conclusion:'未评估'},{id:'missing'}],{conclusions:['待确认']});
 assert.deepEqual(notes.map(note=>note.row.id),['unknown','missing']);
 assert.ok(notes.every(note=>note.annotation.conclusion==='待确认'));
});
