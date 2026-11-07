import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import React, { act } from 'react';

test('task project and type selections immediately filter the results together', async t => {
  const window = new Window({ url: 'http://localhost' });
  const originalChannel = globalThis.MessageChannel;
  globalThis.MessageChannel = undefined;
  Object.assign(globalThis, {
    window, document: window.document, sessionStorage: window.sessionStorage,
    Document: window.Document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement, ShadowRoot: window.ShadowRoot,
    getComputedStyle: window.getComputedStyle.bind(window), ResizeObserver: window.ResizeObserver,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window), IS_REACT_ACT_ENVIRONMENT: true,
  });

  const directory = fileURLToPath(new URL('../node_modules/.cache/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const output = directory + 'task-filters-ui.mjs';
  await build({
    entryPoints: [fileURLToPath(new URL('./pages/TasksPage.jsx', import.meta.url))],
    outfile: output, bundle: true, format: 'esm', platform: 'node', packages: 'external',
    jsx: 'automatic', loader: { '.css': 'empty' },
  });
  const { default: TasksPage } = await import(pathToFileURL(output));
  const { createRoot } = await import('react-dom/client');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => {
    await act(async () => root.unmount());
    await window.happyDOM.abort();
    globalThis.MessageChannel = originalChannel;
  });

  const tasks = [
    { id: 'a1', projectId: 'a', kind: 'confirm', title: '甲项目确认' },
    { id: 'a2', projectId: 'a', kind: 'draft', title: '甲项目起草' },
    { id: 'b1', projectId: 'b', kind: 'confirm', title: '乙项目确认' },
  ];
  const appState = {
    actorId: 'assignee',
    projects: [{ id: 'a', name: '甲项目' }, { id: 'b', name: '乙项目' }],
    tasksById: Object.fromEntries(tasks.map(task => [task.id, {
      ...task, assigneeId: 'assignee', status: '待处理', objectId: task.id,
      objectVersion: 1, arrivedAt: '2026-11-01T00:00:00Z',
    }])),
  };
  const rowIds = () => [...host.querySelectorAll('tbody tr[data-row-key]')].map(row => row.dataset.rowKey);
  const nextPage = () => act(async () => host.querySelector('.ant-pagination-next button').click());
  const select = async (label, option) => {
    const selector = host.querySelector(`[aria-label="${label}"]`).closest('.ant-select').querySelector('.ant-select-selector');
    await act(async () => selector.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true })));
    const item = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')]
      .find(element => element.textContent === option);
    assert.ok(item, `找不到下拉选项 ${option}`);
    await act(async () => item.click());
  };

  await act(async () => root.render(React.createElement(TasksPage, { appState })));
  assert.deepEqual(rowIds(), ['a1', 'a2', 'b1']);
  await select('任务项目', '甲项目');
  assert.deepEqual(rowIds(), ['a1', 'a2']);
  await select('任务类型', '条款确认');
  assert.deepEqual(rowIds(), ['a1']);
  await select('任务项目', '全部项目');
  assert.deepEqual(rowIds(), ['a1', 'b1']);
  await select('任务类型', '全部类型');
  assert.deepEqual(rowIds(), ['a1', 'a2', 'b1']);

  const extraTasks = ['a', 'b'].flatMap(projectId => Array.from({ length: 10 }, (_, index) => {
    const id = `${projectId}-extra-${index + 1}`;
    return [id, { ...appState.tasksById[`${projectId}1`], id, objectId: id }];
  }));
  const largerState = { ...appState, tasksById: { ...appState.tasksById, ...Object.fromEntries(extraTasks) } };
  await act(async () => root.render(React.createElement(TasksPage, { appState: largerState })));
  await nextPage();
  assert.equal(rowIds()[0], 'a-extra-8');

  await select('任务项目', '乙项目');
  assert.equal(rowIds()[0], 'b1', 'a new filter starts at the first page of all matching results');
  assert.equal(rowIds().length, 10);
  await nextPage();
  assert.deepEqual(rowIds(), ['b-extra-10'], 'the next filtered page includes matches from later original pages');
});
