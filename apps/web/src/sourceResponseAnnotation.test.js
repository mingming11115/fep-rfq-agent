import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('pending source annotations render their pending label rather than a Comply fallback',async()=>{
 const cache=fileURLToPath(new URL('../node_modules/.cache/',import.meta.url));await mkdir(cache,{recursive:true});
 await build({entryPoints:[fileURLToPath(new URL('./components/SourceResponseAnnotation.jsx',import.meta.url))],outfile:cache+'source-response-annotation.mjs',bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic'});
 const {default:Annotation}=await import(pathToFileURL(cache+'source-response-annotation.mjs'));
 const markup=renderToStaticMarkup(React.createElement(Annotation,{row:{id:'R'},annotation:{kind:'pending',label:'待确认',conclusion:'待确认',wording:''}}));
 assert.match(markup,/<p class="wc-note-body">待确认/);
 assert.doesNotMatch(markup,/Comply|推荐话术|尚待核实/);
});
