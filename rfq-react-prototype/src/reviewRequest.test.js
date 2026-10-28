import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewRequest, reviewEvidenceHref } from './reviewRequest.js';

const requirement = { id: 'req-1', version: 3, matchLevel: 'none' };
const form = { title: '核实联锁要求', owner: '技术', deadline: '2026-11-03', description: '请核实联锁适用范围。', evidence: ' https://docs.example.com/report?id=42#p3 ' };

test('a review request needs no manually selected category or preliminary plan and stores its evidence link separately', () => {
  const request = buildReviewRequest({ requirement, form, requirementVersion: 4 });
  assert.equal(request.kind, 'review');
  assert.equal(request.type, '知识缺口');
  assert.equal(request.requirementId, 'req-1');
  assert.equal(request.requirementVersion, 4);
  assert.equal(request.description, '请核实联锁适用范围。');
  assert.equal(request.evidence, 'https://docs.example.com/report?id=42#p3');
  assert.equal(Object.hasOwn(request, 'plan'), false);
  assert.equal(Object.hasOwn(request, 'impact'), false);
});

test('blank optional evidence is allowed but a non-link or executable URL cannot be submitted as evidence', () => {
  assert.equal(buildReviewRequest({ requirement, form: { ...form, evidence: '' } }).evidence, '');
  for (const evidence of ['本机报告第3页', 'javascript:alert(1)', 'data:text/html,test', '/report/42']) {
    assert.throws(() => buildReviewRequest({ requirement, form: { ...form, evidence } }), /链接/);
    assert.equal(reviewEvidenceHref(evidence), '');
  }
  assert.equal(reviewEvidenceHref('https://docs.example.com/report/42'), 'https://docs.example.com/report/42');
});

test('removing the category control keeps basic review requirements and automatic routing metadata', () => {
  for (const key of ['title', 'owner', 'deadline', 'description']) {
    assert.throws(() => buildReviewRequest({ requirement, form: { ...form, [key]: ' ' } }), /补齐/);
  }
  assert.equal(buildReviewRequest({ requirement: { ...requirement, matchLevel: 'history' }, form }).type, '条件差异');
});
