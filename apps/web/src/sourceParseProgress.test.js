import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('backend parsing progress never claims response matching or generation succeeded',async()=>{
 const cache=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));
 await mkdir(cache,{recursive:true});
 await build({entryPoints:[fileURLToPath(new URL('./components/SourceParseProgress.jsx',import.meta.url))],outfile:cache+'source-parse-progress.mjs',bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
 const {default:Progress}=await import(pathToFileURL(cache+'source-parse-progress.mjs'));
 const render=status=>renderToStaticMarkup(React.createElement(Progress,{files:[{id:'F',backendDocumentId:'D',purpose:'要求来源',status}]}));
 const completed=render('完成');
 assert.doesNotMatch(completed,/应答项对比|生成应答项/);
 assert.match(completed,/后端条款读取/);
 assert.equal((completed.match(/class="done"/g)||[]).length,3);
 const partial=render('待核对');
 assert.match(partial,/待人工核对/);
 assert.doesNotMatch(partial,/应答项对比|生成应答项/);
 assert.match(render('失败'),/未完成/);
});
