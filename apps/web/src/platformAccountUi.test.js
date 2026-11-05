import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import React, { act } from 'react';

async function mountDirectory(t, { rejectUpdate = false } = {}) {
  const window = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, {
    window, document: window.document, localStorage: window.localStorage,
    Document: window.Document, Element: window.Element, HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement, ShadowRoot: window.ShadowRoot,
    getComputedStyle: window.getComputedStyle.bind(window),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const directory = fileURLToPath(new URL('../node_modules/.cache/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const output = directory + 'platform-account-ui.mjs';
  await build({
    entryPoints: [fileURLToPath(new URL('./pages/PlatformAdminPage.jsx', import.meta.url))],
    outfile: output, bundle: true, format: 'esm', platform: 'node',
    packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' },
  });
  const { default: Directory } = await import(pathToFileURL(output));
  const { createRoot } = await import('react-dom/client');
  let accounts = [{
    id: 'user-tech', username: 'tech01', displayName: '原姓名', email: 'old@example.test',
    status: 'ACTIVE', systemAdmin: false, roles: [{ buId: 'BU-FEP', role: 'TECH' }],
    createdAt: '2026-11-01T00:00:00Z',
  }];
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    let data;
    if (options.method === 'POST' || options.method === 'PATCH') {
      const body = JSON.parse(options.body);
      writes.push({ url, method: options.method, body });
      if (rejectUpdate) {
        rejectUpdate = false;
        return { ok: false, status: 403, json: async () => ({ code: 403, msg: '无权修改该账号' }) };
      }
      if (url === '/api/rfq/admin/users/user-tech' && options.method === 'PATCH') {
        accounts = accounts.map(account => ({ ...account, ...body }));
        data = accounts[0];
      } else if (url === '/api/rfq/admin/users' && options.method === 'POST') {
        data = { id: 'new-user', ...body, status: 'ACTIVE', systemAdmin: false,
          roles: [{ buId: body.buId, role: body.role }] };
        accounts = [...accounts, data];
      } else throw new Error(`Unexpected write: ${options.method} ${url}`);
    } else if (url.startsWith('/api/rfq/admin/business-units?')) {
      data = { list: [{ id: 'BU-FEP', code: 'FEP', name: 'FEP事业部' }], total: 1, page: 1, size: 100 };
    } else if (url.startsWith('/api/rfq/admin/users?')) {
      data = { list: accounts, total: accounts.length, page: 1, size: 200 };
    } else throw new Error(`Unexpected request: ${url}`);
    return { ok: true, status: 200, json: async () => ({ code: 0, data }) };
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const settle = () => new Promise(resolve => setTimeout(resolve, 30));
  t.after(async () => {
    await act(async () => { root.unmount(); await settle(); });
    globalThis.fetch = originalFetch;
    await window.happyDOM.abort();
  });
  await act(async () => { root.render(React.createElement(Directory, { actorId: 'admin' })); await settle(); });
  const click = async label => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.replace(/\s/g, '') === label);
    assert.ok(button, `应有“${label}”按钮`);
    await act(async () => { button.click(); await settle(); });
  };
  const input = label => document.querySelector(`input[aria-label="${label}"]`);
  const fill = async (label, value) => {
    const element = input(label);
    assert.ok(element, `应有“${label}”输入框`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
      await settle();
    });
  };
  return { host, writes, click, input, fill };
}

test('新增账号可直接使用默认初始密码12345678保存', async t => {
  const { host, writes, click, input, fill } = await mountDirectory(t);
  await click('新增账号');
  assert.equal(input('初始密码').value, '12345678');
  await fill('账号', 'newtech');
  await fill('姓名', '新技术人员');
  await click('保存目录配置');
  assert.deepEqual(writes, [{ url: '/api/rfq/admin/users', method: 'POST', body: {
    username: 'newtech', password: '12345678', displayName: '新技术人员',
    email: null, buId: 'BU-FEP', role: 'SR',
  } }]);
  assert.match(host.textContent, /新技术人员/);
});

test('编辑回填账号资料并保存姓名和邮箱，不创建账号或修改密码角色', async t => {
  const { host, writes, click, input, fill } = await mountDirectory(t);
  await click('编辑');
  assert.equal(input('账号').value, 'tech01');
  assert.equal(input('账号').readOnly, true);
  assert.equal(input('姓名').value, '原姓名');
  assert.equal(input('邮箱').value, 'old@example.test');
  assert.equal(input('初始密码'), null);
  await fill('姓名', '  新姓名  ');
  await fill('邮箱', '  new@example.test  ');
  await click('保存目录配置');
  assert.deepEqual(writes, [{ url: '/api/rfq/admin/users/user-tech', method: 'PATCH',
    body: { displayName: '新姓名', email: 'new@example.test' } }]);
  assert.match(host.textContent, /新姓名/);
  assert.doesNotMatch(host.textContent, /原姓名/);
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test('编辑时空姓名阻止保存，清空邮箱可保存', async t => {
  const { writes, click, fill } = await mountDirectory(t);
  await click('编辑');
  await fill('姓名', '   ');
  await click('保存目录配置');
  assert.equal(writes.length, 0);
  assert.match(document.querySelector('[role="alert"]').textContent, /请填写姓名/);
  await fill('姓名', '有效姓名');
  await fill('邮箱', '   ');
  await click('保存目录配置');
  assert.deepEqual(writes[0].body, { displayName: '有效姓名', email: null });
});

test('取消编辑不提交，重新打开回填原账号资料', async t => {
  const { writes, click, input, fill } = await mountDirectory(t);
  await click('编辑');
  await fill('姓名', '未保存的姓名');
  await click('取消');
  assert.equal(writes.length, 0);
  await click('编辑');
  assert.equal(input('姓名').value, '原姓名');
});

test('保存失败保留编辑内容及错误提示，允许重试', async t => {
  const { host, writes, click, input, fill } = await mountDirectory(t, { rejectUpdate: true });
  await click('编辑');
  await fill('姓名', '重试姓名');
  await click('保存目录配置');
  assert.match(document.querySelector('[role="alert"]').textContent, /无权修改该账号/);
  assert.equal(input('姓名').value, '重试姓名');
  await click('保存目录配置');
  assert.equal(writes.length, 2);
  assert.match(host.textContent, /重试姓名/);
});
