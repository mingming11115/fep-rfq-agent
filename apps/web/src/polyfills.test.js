import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { installPolyfills } from './polyfills.js';
import { sha256 } from './sha256.js';

const makeTarget = () => ({ getRandomValues: bytes => webcrypto.getRandomValues(bytes) });

test('randomUUID 缺失时补齐为合规 v4，已有原生实现时不覆盖', () => {
  const target = makeTarget();
  assert.deepEqual(installPolyfills(target), ['crypto.randomUUID', 'crypto.subtle.digest']);
  assert.equal(typeof target.randomUUID, 'function');

  const ids = new Set();
  for (let index = 0; index < 200; index += 1) {
    const id = target.randomUUID();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 200);

  const native = makeTarget();
  native.randomUUID = () => 'native-id';
  installPolyfills(native);
  assert.equal(native.randomUUID(), 'native-id');
});

test('缺少 getRandomValues 时仍产出合法 UUID', () => {
  const target = {};
  installPolyfills(target);
  assert.match(target.randomUUID(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('SHA-256 与原生结果逐字节一致，覆盖填充边界', () => {
  const cases = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65), '中文条款测试'];
  for (const text of cases) {
    const bytes = new TextEncoder().encode(text);
    assert.equal(Buffer.from(sha256(bytes)).toString('hex'), createHash('sha256').update(text).digest('hex'));
  }
  for (let index = 0; index < 50; index += 1) {
    const bytes = randomBytes(Math.floor(Math.random() * 3000));
    assert.equal(Buffer.from(sha256(bytes)).toString('hex'), createHash('sha256').update(bytes).digest('hex'));
  }
});

test('subtle.digest 兜底返回 ArrayBuffer，且与原生指纹同值', async () => {
  const target = makeTarget();
  installPolyfills(target);
  const bytes = randomBytes(2048);

  const digest = await target.subtle.digest('SHA-256', bytes.buffer);
  assert.ok(digest instanceof ArrayBuffer);
  assert.equal(digest.byteLength, 32);
  assert.equal(Buffer.from(digest).toString('hex'), createHash('sha256').update(bytes).digest('hex'));

  const named = await target.subtle.digest({ name: 'SHA-256' }, new Uint8Array([1, 2, 3]));
  assert.equal(Buffer.from(named).toString('hex'), createHash('sha256').update(Buffer.from([1, 2, 3])).digest('hex'));

  await assert.rejects(() => target.subtle.digest('SHA-1', bytes.buffer));
});

test('已有原生 subtle 时保留，不重复安装', () => {
  const target = makeTarget();
  target.subtle = webcrypto.subtle;
  assert.deepEqual(installPolyfills(target), ['crypto.randomUUID']);
  assert.equal(target.subtle, webcrypto.subtle);
});
