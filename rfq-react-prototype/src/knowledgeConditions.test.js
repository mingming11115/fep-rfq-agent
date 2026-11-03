import test from 'node:test';
import assert from 'node:assert/strict';
import { conditionTags, conditionText } from './knowledgeConditions.js';

test('existing conditions become separate tags without splitting ranges or machine configurations',()=>{
 assert.deepEqual(conditionTags('Hesper E360R R2 / 配置 C；硅材料; 厚度 0.5–1.0 mm\nSi 工艺'),[
  'Hesper E360R R2 / 配置 C','硅材料','厚度 0.5–1.0 mm','Si 工艺',
 ]);
 assert.deepEqual(conditionTags('材料 A,B；比例 1/2'),['材料 A,B','比例 1/2']);
});

test('condition tags save as compatible text with whitespace and duplicates removed',()=>{
 assert.equal(conditionText([' 模块 S ','硅材料','模块 S','',' \n ']),'模块 S；硅材料');
 assert.equal(conditionText([]),'');
 assert.deepEqual(conditionTags(null),[]);
});
