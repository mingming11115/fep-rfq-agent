import test from 'node:test';import assert from 'node:assert/strict';
import {makeSourceAnchor,resolveSourceAnchor} from './documentAnchors.js';
const rows=[{id:'R1',projectId:'P',sourceFileId:'F1',sourceVersion:'v1',clause:'1.1'},{id:'R2',projectId:'P',sourceFileId:'F2',sourceVersion:'v1',clause:'1.1'},{id:'R3',projectId:'P',sourceFileId:'F2',sourceVersion:'v1',clause:''}];
test('same clause numbers across files resolve independently',()=>assert.equal(resolveSourceAnchor(rows,makeSourceAnchor(rows[1])).row.id,'R2'));
test('unnumbered clause resolves by id',()=>assert.equal(resolveSourceAnchor(rows,makeSourceAnchor(rows[2])).row.id,'R3'));
test('old-version anchor is stale and cannot reattach to new source',()=>{assert.equal(resolveSourceAnchor([{...rows[1],sourceVersion:'v2'}],makeSourceAnchor(rows[1])).status,'stale');assert.equal(resolveSourceAnchor([rows[0]],makeSourceAnchor(rows[1])).status,'missing');});
