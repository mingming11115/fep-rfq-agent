import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import { createDemoState } from './data.js';

for (const cachedSecondaryRole of [false, true]) {
test(cachedSecondaryRole ? 'App刷新保留同账号已选择的第二角色和BU' : '新账号刷新可进入项目页，旧演示BU加载失败不阻断真实成员目录', async t => {
  const window = new Window({ url: 'http://localhost/#/projects', settings: {
    disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableIframePageLoading: true,
  } });
  // rc-overflow does not close Node MessageChannel ports; use its browser RAF fallback.
  const originalChannel = globalThis.MessageChannel;
  globalThis.MessageChannel = undefined;
  Object.assign(globalThis, {
    window, document: window.document, localStorage: window.localStorage,
    sessionStorage: window.sessionStorage, location: window.location, history: window.history,
    Document: window.Document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement, ShadowRoot: window.ShadowRoot, DOMParser: window.DOMParser, CSS: window.CSS,
    getComputedStyle: window.getComputedStyle.bind(window), ResizeObserver: window.ResizeObserver,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window), IS_REACT_ACT_ENVIRONMENT: true,
  });
  const user = { id: 'new-user', displayName: '新建用户', systemAdmin: false,
    roles: [{ buId: 'BU-FEP', role: 'SR' }], bus: [{ id: 'BU-FEP', name: '真实事业部' }] };
  const saved = { ...createDemoState(), demoCleanupVersion: 4, actorId: 'new-user', actorRole: 'SR', activeBuId: 'BU-DEMO' };
  if (cachedSecondaryRole) {
    user.roles.unshift({ buId: 'BU-OTHER', role: 'TECH' });
    user.bus.push({ id: 'BU-OTHER', name: '其他事业部' });
    Object.assign(saved, { activeBuId: 'BU-FEP', personnelSchemaVersion: 1, buReviewSettingsByBuId: {},
      accountsById: { 'new-user': { id: 'new-user', name: '新建用户', enabled: true, systemAdmin: false, managedBuIds: [] } },
      businessUnits: [{ id: 'BU-DEMO', name: '旧演示BU' }, ...user.bus],
      buPersonnelByBuId: { 'BU-FEP': [{ userId: 'new-user', roles: ['SR'], enabled: true, canConfirm: false, canFinalReview: false, resourceQualifications: [] }] },
    });
  }
  localStorage.setItem('fep-rfq-auth', JSON.stringify({ token: 'test-token', user }));
  localStorage.setItem('fep-rfq-app-v1', JSON.stringify(saved));
  const requests = [], originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    requests.push(url);
    const realBu = url === '/api/rfq/business-units/BU-FEP/members';
    return { ok: realBu, status: realBu ? 200 : 403, json: async () => realBu ? { code: 0, data: [
      { userId: 'new-user', displayName: '新建用户', roles: ['SR'], enabled: true, canConfirm: false, canFinalReview: false, resourceQualifications: [] },
      { userId: 'real-colleague', displayName: '真实技术人员', roles: ['TECH'], enabled: true, canConfirm: true, canFinalReview: false, resourceQualifications: [] },
    ] } : { code: 403, msg: '无权读取演示BU' } };
  };
  const directory = fileURLToPath(new URL('../node_modules/.cache/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const output = path.join(directory, 'session-personnel-ui.mjs');
  await build({
    stdin: { contents: "import React from 'react';import {App as AntApp} from 'antd';import App from './App.jsx';export default function TestApp(){return <AntApp><App/></AntApp>}", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
    outfile: output, bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
    loader: { '.css': 'empty' }, define: { 'import.meta.env': '{"BASE_URL":"/"}' },
    plugins: [{ name: 'raw-template', setup(builder) {
      builder.onResolve({ filter: /\.html\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' }));
      builder.onLoad({ filter: /.*/, namespace: 'raw' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
    } }],
  });
  const { default: App } = await import(pathToFileURL(output));
  const { createRoot } = await import('react-dom/client');
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await window.happyDOM.abort();
    globalThis.MessageChannel = originalChannel;
  });
  await act(async () => { root.render(React.createElement(App)); await new Promise(resolve => setTimeout(resolve, 50)); });
  assert.doesNotMatch(host.textContent, /当前身份无权访问此页面/);
  assert.match(host.textContent, /新建用户/);
  const create = [...host.querySelectorAll('button')].find(button => button.textContent === '新建 RFQ');
  assert.ok(create);
  assert.equal(create.disabled, false);
  const state = JSON.parse(localStorage.getItem('fep-rfq-app-v1'));
  assert.equal(state.actorRole, 'SR');
  assert.equal(state.activeBuId, 'BU-FEP');
  assert.equal(state.accountsById['real-colleague'].name, '真实技术人员');
  assert.ok(state.buPersonnelByBuId['BU-FEP'].find(member => member.userId === 'real-colleague').canConfirm);
  assert.ok(requests.includes('/api/rfq/business-units/BU-DEMO/members'));
  assert.ok(requests.includes('/api/rfq/business-units/BU-FEP/members'));
});
}
