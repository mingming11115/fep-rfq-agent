import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import os from 'node:os';
import path from 'node:path';

test('web image assets include gzip files and an integrity manifest for HTTP startup verification',async()=>{
  const {compressStatic}=await import('../scripts/compress-static.mjs');
  const dir=await mkdtemp(path.join(os.tmpdir(),'rfq-static-'));
  try{
    for(const editor of ['wordcraft','pdfcraft']){
      const base=path.join(dir,'craft-editors',editor+'-classic');await mkdir(base,{recursive:true});
      const entries={'index.html':Buffer.from('<html>editor</html>'),[editor+'-classic.js']:Buffer.from('export const ready=true;'.repeat(100)),[editor+'-classic_bg.wasm']:Buffer.concat([Buffer.from([0,97,115,109]),Buffer.alloc(2048)])};
      const files={};for(const [name,bytes] of Object.entries(entries)){await writeFile(path.join(base,name),bytes);files[name]=createHash('sha256').update(bytes).digest('hex');}
      await writeFile(path.join(base,'build.json'),JSON.stringify({files}));
    }
    await compressStatic(dir);
    const manifest=await readFile(path.join(dir,'.editor-assets.sha256'),'utf8');
    for(const editor of ['wordcraft','pdfcraft']){
      const rel=`craft-editors/${editor}-classic/${editor}-classic_bg.wasm`;
      assert.match(manifest,new RegExp(rel));
      assert.deepEqual(gunzipSync(await readFile(path.join(dir,rel+'.gz'))),await readFile(path.join(dir,rel)));
    }
    const wasm=path.join(dir,'craft-editors/pdfcraft-classic/pdfcraft-classic_bg.wasm');
    await writeFile(wasm,'corrupt');
    await assert.rejects(()=>compressStatic(dir),/校验失败|integrity/i);
  }finally{await rm(dir,{recursive:true,force:true});}
});
