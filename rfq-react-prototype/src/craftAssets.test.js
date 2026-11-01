import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareCraftEditor} from '../scripts/prepare-craft-editors.mjs';

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
