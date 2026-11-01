import {readFile,readdir,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const project=fileURLToPath(new URL('../',import.meta.url)),repo=path.dirname(project);
const demo=path.join(repo,'demos/craft-review');
export async function prepareCraftEditor({editor,source,target,patch}){
  let manifest;
  try{manifest=JSON.parse(await readFile(path.join(source,'build.json'),'utf8'));}
  catch{throw new Error(`${editor} 编辑器尚未准备，请先运行 npm run craft:build（需要 Rust 1.95 与 wasm-bindgen 0.2.129）。`);}
  const digest=data=>createHash('sha256').update(data).digest('hex');
  if(manifest.patchSha256!==digest(await readFile(patch)))throw new Error(`${editor} 编辑器补丁已更新，请运行 npm run craft:build。`);
  for(const [name,hash] of Object.entries(manifest.files))if(digest(await readFile(path.join(source,name)))!==hash)throw new Error(`${editor} 编译文件校验失败，请重新构建。`);
  await mkdir(target,{recursive:true});
  for(const item of await readdir(source,{withFileTypes:true}))await cp(path.join(source,item.name),path.join(target,item.name),{recursive:item.isDirectory()});
  console.log(`Prepared ${editor} ${manifest.version}: /craft-editors/${editor}-classic/index.html`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  for(const editor of ['wordcraft','pdfcraft']){
    if(process.argv.includes('--build')){
      const built=spawnSync('python3',[path.join(demo,`build_${editor}.py`)],{cwd:repo,stdio:'inherit'});
      if(built.status!==0)process.exit(built.status||1);
    }
    await prepareCraftEditor({editor,source:path.join(demo,'site',editor+'-classic'),target:path.join(project,'public/craft-editors',editor+'-classic'),patch:path.join(demo,editor+'-classic-comments.patch')});
  }
}
