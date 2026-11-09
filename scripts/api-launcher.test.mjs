import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
test('API launcher runs a Maven executable whose path contains spaces from the API directory',async()=>{
 const prefix=path.join(os.tmpdir(),'rfq launcher '),temporary=await mkdtemp(prefix);
 const result=path.join(temporary,'result.json'),recorder=path.join(temporary,'record.mjs');
 await writeFile(recorder,"import fs from 'node:fs';fs.writeFileSync(process.env.RFQ_LAUNCH_RESULT,JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));");
 const windows=process.platform==='win32',executable=path.join(temporary,windows?'mvn.cmd':'mvn');
 await writeFile(executable,windows?`@echo off\r\n"${process.execPath}" "${recorder}" %*\r\n`:`#!/bin/sh\nexec "${process.execPath}" "${recorder}" "$@"\n`,{mode:0o755});
 const root=fileURLToPath(new URL('../',import.meta.url));
 try{
  const child=spawnSync(process.execPath,[path.join(root,'scripts/api.mjs'),'test'],{cwd:root,env:{...process.env,MVN_CMD:executable,RFQ_LAUNCH_RESULT:result},encoding:'utf8'});
  assert.equal(child.status,0,child.stderr||child.stdout);
  const recorded=JSON.parse(await readFile(result,'utf8'));assert.equal(recorded.cwd,path.join(root,'apps/api'));assert.deepEqual(recorded.args,['test']);
 }finally{if(!path.resolve(temporary).startsWith(path.resolve(prefix))) { throw Error('Unexpected temporary path'); } await rm(temporary,{recursive:true,force:true});}
});
