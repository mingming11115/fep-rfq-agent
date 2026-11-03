import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';
import { finalizePresentation } from '/Users/l/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations/container_tools/artifact_tool_utils.mjs';

const workspaceDir='/Users/l/Documents/ChatGPT/RFQ提效agent';
const buildDir=path.join(workspaceDir,'outputs/.rfq-progress-build');
const outputDir=path.join(workspaceDir,'outputs/rfq-progress-2026-11-02');
const skillDir='/Users/l/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations';
const finalPath=path.join(outputDir,'RFQ提效Agent_功能总览与进度_2026-11-02.pptx');
const presentation=Presentation.create({slideSize:{width:1280,height:720}});
const s=presentation.slides.add();
s.background.fill='#FFFFFF';
const navy='#16324F',muted='#586A7E',green='#14766D',amber='#A56516';
function txt(name,text,x,y,w,h,size,color=navy,bold=false,alignment='left'){
 const sh=s.shapes.add({geometry:'textbox',name,position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 sh.text=text;
 sh.text.style={fontSize:size,typeface:'Noto Sans CJK SC',color,bold,alignment,verticalAlignment:'top',insets:0,wrap:'none',autoFit:'none'};
 return sh;
}
txt('title','RFQ 提效 Agent 功能总览与进度',44,29,990,60,38,navy,true);
txt('date','2026.11.02',1040,42,196,30,21,muted,false,'right');
txt('progress','当前进度：核心业务交互已完成，Word/PDF 批阅已接入',44,104,1192,49,30,navy,true);
txt('workspace-heading','原文与应答工作区',44,179,704,37,26,navy,true);
txt('workspace-caption','原文定位与批注联动，支持逐条应答和内部评审',44,219,704,31,23,muted);
const imageBytes=await fs.readFile(path.join(outputDir,'response-main.jpg'));
s.images.add({blob:imageBytes,contentType:'image/jpeg',alt:'实际系统的原文与应答工作区，展示原文定位、话术批注、逐条应答和评审状态',fit:'contain',position:{left:44,top:257,width:704,height:381.5}});
txt('feature-progress-heading','功能总览与完成状态',776,179,460,37,26,navy,true);
const values=[['功能模块','当前进度'],['项目与资料管理','交互已完成'],['原文批阅与联动','文件能力已接入'],['智能解析与应答','交互完成，AI 待接入'],['协作评审与审批','流程交互已完成'],['知识与机型能力','管理交互已完成'],['定稿与导出','CSV 可用，Word 待接入']];
const t=s.tables.add({rows:7,columns:2,left:776,top:222,width:460,height:420,columnWidths:[180,280],values});
t.styleOptions={headerRow:false,bandedRows:false};
t.borders.assign({fill:'#E2E8EF',width:1,style:'solid'});
for(let r=0;r<7;r++){
 t.rows[r].height=r===0?48:62;
 for(let c=0;c<2;c++){
  const cell=t.getCell(r,c);
  cell.fill=r===0?navy:(r%2===0?'#F4F7FA':'#FFFFFF');
  cell.text.style={fontSize:22,typeface:'Noto Sans CJK SC',bold:r===0||c===0,color:r===0?'#FFFFFF':(c===0?navy:([3,6].includes(r)?amber:green)),alignment:'left',verticalAlignment:'middle',insets:{left:10,right:8,top:8,bottom:8},wrap:'none',autoFit:'none'};
 }
}
txt('next-step-label','下一步',44,674,105,32,24,navy,true);
txt('next-step','接入 AI 解析与知识检索、企业账号和业务存储，完善 Word 定稿导出',164,675,1072,31,23,navy);
s.speakerNotes.text='汇报讲稿：RFQ 提效 Agent 目前已完成核心业务交互，并接入 Word/PDF 原文批阅和保存能力。左侧是实际的原文与应答工作区：可以定位客户原文，将话术、批注与条款关联，逐条形成应答，并把需要专业判断的内容交给责任人评审。右侧按六项功能列出当前进度。项目与资料、协作评审、知识与机型能力的管理交互已经完成；原文批阅已接入真实文件服务；智能解析与应答的交互已完成，AI 服务待接入；导出已支持 CSV，Word 定稿输出待完善。下一步重点是解析与知识检索、企业账号及业务数据存储，以及 Word 定稿导出，并结合实际客户文件验证效果。\n\n界面来源：2026-11-02 本机 RFQ 系统 http://127.0.0.1:5174/ 的原文与应答工作区。\n进度依据：docs/craft-project-review.md；rfq-service/README.md；rfq-react-prototype/README.md。';

await fs.mkdir(buildDir,{recursive:true});
await fs.mkdir(outputDir,{recursive:true});
const png=await presentation.export({slide:s,format:'png',scale:1});
await fs.writeFile(path.join(buildDir,'local-preview.png'),new Uint8Array(await png.arrayBuffer()));
const candidatePath=path.join(buildDir,'candidate.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
const result=await finalizePresentation({
 workspaceDir,candidatePath,finalPath,
 pythonExecutable:'/Users/l/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',
 integrityValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(skillDir,'container_tools/inspect_presentation_layout_geometry.py'),
 explicitTotalSlideCount:1,
 requiredNativeTableOwnerSlides:[1],
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--require-native-table-slide','1'],
 fontPolicy:{basis:'design',families:['Noto Sans CJK SC']},
 verifyArtifactToolImport:true,
 receiptPath:path.join(buildDir,'validation.json'),
});
console.log(JSON.stringify({finalPath,result}));
