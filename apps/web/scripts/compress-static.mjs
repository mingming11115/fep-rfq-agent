import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export async function compressStatic(root){
  const checks=[];
  for(const editor of ['wordcraft','pdfcraft']){
    const base=`craft-editors/${editor}-classic`;
    const manifest=JSON.parse(await readFile(path.join(root,base,'build.json'),'utf8'));
    for(const [name,expected] of Object.entries(manifest.files)){
      const relative=base+'/'+name.replaceAll('\\','/');
      const bytes=await readFile(path.join(root,relative));
      if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('编辑器完整性校验失败：'+relative);
      checks.push(`${expected}  ${relative}`);
    }
  }
  await writeFile(path.join(root,'.editor-assets.sha256'),checks.join('\n')+'\n');
  async function compress(dir){
    for(const item of await readdir(dir,{withFileTypes:true})){
      const file=path.join(dir,item.name);
      if(item.isDirectory())await compress(file);
      else if(/\.(wasm|js|css)$/.test(item.name)){
        const bytes=await readFile(file);
        await writeFile(file+'.gz',gzipSync(bytes,{level:6}));
      }
    }
  }
  await compress(root);
  console.log(`Verified ${checks.length} editor assets and generated gzip files`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await compressStatic(path.resolve(process.argv[2]||'apps/web/dist'));
}
