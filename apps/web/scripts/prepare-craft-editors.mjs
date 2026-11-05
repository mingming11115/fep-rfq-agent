import {readFile,readdir,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const project=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(project,'../..');
const demo=path.join(repo,'packages/craft-editors');
export async function prepareCraftEditor({editor,source,target,patch}){
  let manifest;
  try{manifest=JSON.parse(await readFile(path.join(source,'build.json'),'utf8'));}
  catch{throw new Error(`${editor} 编辑器尚未准备，请先运行 npm run craft:build（需要 Rust 1.95 与 wasm-bindgen 0.2.129）。`);}
  const digest=data=>createHash('sha256').update(data).digest('hex');
  const patchBytes=await readFile(patch);
  // Git on Windows can change only the diff's line endings. Compiled assets remain byte exact.
  if(![digest(patchBytes),digest(patchBytes.toString('utf8').replace(/\r\n/g,'\n'))].includes(manifest.patchSha256))throw new Error(`${editor} 编辑器补丁已更新，请运行 npm run craft:build。`);
  for(const [name,hash] of Object.entries(manifest.files))if(digest(await readFile(path.join(source,name)))!==hash)throw new Error(`${editor} 编译文件校验失败，请重新构建。`);
  await mkdir(target,{recursive:true});
  for(const item of await readdir(source,{withFileTypes:true}))await cp(path.join(source,item.name),path.join(target,item.name),{recursive:item.isDirectory()});
  console.log(`Prepared ${editor} ${manifest.version}: /craft-editors/${editor}-classic/index.html`);
}

export async function preparePublicAssets({publicSource,target,editors}){
  await mkdir(target,{recursive:true});
  // Legacy public/craft-editors may be stale or unreadable after an interrupted copy.
  // Publish the pinned, verified runtimes instead of carrying those copies into a build.
  for(const item of await readdir(publicSource,{withFileTypes:true})){
    if(item.name==='craft-editors')continue;
    await cp(path.join(publicSource,item.name),path.join(target,item.name),{recursive:item.isDirectory()});
  }
  for(const entry of editors)await prepareCraftEditor({...entry,target:path.join(target,'craft-editors',entry.editor+'-classic')});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  for(const editor of ['wordcraft','pdfcraft']){
    if(process.argv.includes('--build')){
      const built=spawnSync('python3',[path.join(demo,`build_${editor}.py`)],{cwd:repo,stdio:'inherit'});
      if(built.status!==0)process.exit(built.status||1);
    }
  }
  await preparePublicAssets({publicSource:path.join(project,'public'),target:path.join(project,'.generated-public'),
    editors:['wordcraft','pdfcraft'].map(editor=>({editor,source:path.join(demo,'site',editor+'-classic'),patch:path.join(demo,editor+'-classic-comments.patch')}))});
}
