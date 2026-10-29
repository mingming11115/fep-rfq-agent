import test from 'node:test';
import assert from 'node:assert/strict';
import { personnelOptions, uploadMetadata, mentionIds, statusTone } from './antdAdapters.js';

test('personnel options keep stable IDs and unavailable historical selections disabled', () => {
  const options = personnelOptions([{ userId: 'u1', name: '同名' }, { id: 'u2', name: '同名' }], ['u1', 'gone'], id => `旧人员 ${id}`);
  assert.deepEqual(options.map(p => p.value), ['u1', 'u2', 'gone']);
  assert.equal(options[0].disabled, false);
  assert.equal(options[2].disabled, true);
  assert.match(options[2].label, /需重新选择/);
  assert.ok(options[2].label.includes('旧人员 gone'));
});

test('manual upload unwraps Ant files without retaining File objects or losing removal', () => {
  const file = { name: '客户.docx', size: 123, type: 'application/test', lastModified: 42 };
  assert.deepEqual(uploadMetadata([{ uid: 'a', originFileObj: file }]), [file]);
  assert.deepEqual(uploadMetadata([{ uid: 'a', ...file }]), [file]);
  assert.deepEqual(uploadMetadata([]), []);
  assert.equal('originFileObj' in uploadMetadata([{ originFileObj: file }])[0], false);
});

test('mentions use only valid IDs in final text, deduplicate and exclude email/prefix matches', () => {
  const people = [{ id: 'u1', name: '张三' }, { userId: 'u2', name: '李四' }];
  assert.deepEqual(mentionIds('请 @u1 核对，＠u2 请确认 @u1 。', people), ['u1', 'u2']);
  assert.deepEqual(mentionIds('已删除提及', people), []);
  assert.deepEqual(mentionIds('email@u1 @u10 @unknown', people), []);
});

test('status colors are explicit and do not turn unknown approval wording into success', () => {
  assert.equal(statusTone('已确认'), 'success');
  assert.equal(statusTone('Comply'), 'success');
  assert.equal(statusTone('有条件 Comply'), 'warning');
  assert.equal(statusTone('审批中'), 'warning');
  assert.equal(statusTone('不满足'), 'danger');
  assert.equal(statusTone('审批未通过'), 'neutral');
  assert.equal(statusTone('任意状态', 'danger'), 'danger');
});
