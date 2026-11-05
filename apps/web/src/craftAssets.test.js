import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareCraftEditor} from '../scripts/prepare-craft-editors.mjs';

test('deployment regenerates verified editor assets without using stale public editor copies',async()=>{
  const {preparePublicAssets}=await import('../scripts/prepare-craft-editors.mjs');
  const directory=await mkdtemp(path.join(tmpdir(),'rfq-clean-deployment-'));
  try{
    const publicSource=path.join(directory,'public'),target=path.join(directory,'generated');
    const source=path.join(directory,'editor'),patch=path.join(directory,'editor.patch');
    await mkdir(path.join(publicSource,'craft-editors'),{recursive:true});
    await mkdir(path.join(publicSource,'craft-demo'),{recursive:true});
    await writeFile(path.join(publicSource,'craft-editors','stale.wasm'),'broken');
    await writeFile(path.join(publicSource,'craft-demo','demo.docx'),'bundled demo');
    await mkdir(source);await writeFile(patch,'patch');await writeFile(path.join(source,'editor.wasm'),'verified wasm');
    const hash=text=>createHash('sha256').update(text).digest('hex');
    await writeFile(path.join(source,'build.json'),JSON.stringify({version:'test',patchSha256:hash('patch'),files:{'editor.wasm':hash('verified wasm')}}));
    await preparePublicAssets({publicSource,target,editors:[{editor:'wordcraft',source,patch}]});
    assert.equal(await readFile(path.join(target,'craft-editors/wordcraft-classic/editor.wasm'),'utf8'),'verified wasm');
    assert.equal(await readFile(path.join(target,'craft-demo/demo.docx'),'utf8'),'bundled demo');
    await assert.rejects(readFile(path.join(target,'craft-editors/stale.wasm')),/ENOENT/);
    const config=(await import('../vite.config.js')).default;
    assert.equal(config.publicDir,'.generated-public');
    assert.ok(config.server.watch.ignored.includes('**/.generated-public/**'));
    const runtimePath=path.join(target,'craft-editors/wordcraft-classic/editor.wasm');
    await utimes(runtimePath,new Date('2020-01-01'),new Date('2020-01-01'));
    const before=await stat(runtimePath);
    await preparePublicAssets({publicSource,target,editors:[{editor:'wordcraft',source,patch}]});
    assert.equal((await stat(runtimePath)).mtimeMs,before.mtimeMs,'unchanged runtimes must not be replaced while the dev server serves them');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('prepared editor can load its generated nested JavaScript imports',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'rfq-craft-assets-'));
  try{
    const source=path.join(directory,'source'),target=path.join(directory,'public'),patch=path.join(directory,'editor.patch');
    await mkdir(path.join(source,'snippets/runtime'),{recursive:true});
    await writeFile(path.join(directory,'package.json'),'{"type":"module"}');
    await writeFile(patch,'verified patch');
    const files={'index.html':'<html></html>','wordcraft-classic.js':"export {ready} from './snippets/runtime/inline.js';",'wordcraft-classic_bg.wasm':'wasm test input','snippets/runtime/inline.js':'export const ready = true;'};
    const hash=value=>createHash('sha256').update(value).digest('hex');
    for(const [name,content] of Object.entries(files))await writeFile(path.join(source,name),content);
    await writeFile(path.join(source,'build.json'),JSON.stringify({version:'test',patchSha256:hash('verified patch'),files:Object.fromEntries(Object.entries(files).map(([name,content])=>[name,hash(content)]))}));
    await prepareCraftEditor({editor:'wordcraft',source,target,patch});
    const runtime=await import(pathToFileURL(path.join(target,'wordcraft-classic.js')));
    assert.equal(runtime.ready,true);
    await writeFile(path.join(source,'wordcraft-classic.js'),'tampered runtime');
    await assert.rejects(()=>prepareCraftEditor({editor:'wordcraft',source,target,patch}),/编译文件校验失败/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('Windows CRLF checkout accepts the same editor patch while changed content still requires a rebuild',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'rfq-craft-windows-'));
  try{
    const source=path.join(directory,'source'),target=path.join(directory,'public'),patch=path.join(directory,'editor.patch');
    await mkdir(source,{recursive:true});
    const original='--- a/document.rs\n+++ b/document.rs\n@@ -1 +1 @@\n-before\n+after\n';
    const runtime='compiled editor bytes\r\n';
    const hash=value=>createHash('sha256').update(value).digest('hex');
    await writeFile(path.join(source,'editor.wasm'),runtime);
    await writeFile(path.join(source,'build.json'),JSON.stringify({version:'test',patchSha256:hash(original),files:{'editor.wasm':hash(runtime)}}));
    await writeFile(patch,original.replace(/\n/g,'\r\n'));
    await prepareCraftEditor({editor:'wordcraft',source,target,patch});
    assert.equal(await readFile(path.join(target,'editor.wasm'),'utf8'),runtime,'runtime verification and copying remain byte exact');
    await writeFile(patch,original.replace('after','different change').replace(/\n/g,'\r\n'));
    await assert.rejects(()=>prepareCraftEditor({editor:'wordcraft',source,target,patch}),/补丁已更新/);
    await writeFile(patch,original);
    await writeFile(path.join(source,'editor.wasm'),runtime.replace(/\r\n/g,'\n'));
    await assert.rejects(()=>prepareCraftEditor({editor:'wordcraft',source,target,patch}),/编译文件校验失败/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
