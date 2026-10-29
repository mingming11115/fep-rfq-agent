import { filterPeople } from './personPicker.js';
export function mentionMatches(search, option) {
  return (String(option.label || '') + ' ' + option.value).toLocaleLowerCase().includes(search.toLocaleLowerCase());
}
export function formDate(value) {
  const date = typeof value === 'string' ? value : value?.format?.('YYYY-MM-DD');
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : '';
}
export function resizePanelShare(current, key, { span, minStart, minEnd, vertical = false }) {
  const low = Math.min(50, Math.ceil(minStart / span * 100));
  const high = Math.max(low, Math.floor(100 - minEnd / span * 100));
  let next = current;
  if (key === (vertical ? 'ArrowUp' : 'ArrowLeft')) next -= 5;
  if (key === (vertical ? 'ArrowDown' : 'ArrowRight')) next += 5;
  if (key === 'Home') next = low;
  if (key === 'End') next = high;
  if (key === 'Enter') next = 55;
  return Math.min(high, Math.max(low, next));
}

export function personnelOptions(people = [], value = [], resolveName = id => id) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const options = [...new Map(filterPeople(people).map(person => [person.id, {
    value: person.id, label: person.name || person.id,
    searchText: [person.name, person.id, ...(person.roles || [])].join(' '), disabled: false,
  }])).values()];
  for (const id of selected) if (!options.some(option => option.value === id)) {
    options.push({ value: id, label: resolveName(id) + '（需重新选择）', searchText: id, disabled: true });
  }
  return options;
}
export function uploadMetadata(files = []) {
  return files.map(item => {
    const file = item.originFileObj || item;
    return { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified };
  });
}
export function mentionIds(text = '', people = []) {
  return [...new Set(filterPeople(people).filter(person => {
    const id = person.id.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
    return new RegExp('(^|[^A-Za-z0-9_.@＠-])[@＠]' + id + '(?=$|[^A-Za-z0-9_.-])', 'u').test(text);
  }).map(person => person.id))];
}
const tones = Object.fromEntries([
  ['success', ['Comply', '已确认', '已关闭', '已批准', '已发布', '已处理', '已导出', '完成', '已完成', '有效', '生效', '通过', '审批完成', '成功', '已解析']],
  ['danger', ['失败', '解析失败', '不满足', '撤销', '已撤销', '过期', '已过期', '退回', '已退回', '失效', '已失效', '逾期', '拒绝', '已拒绝']],
  ['warning', ['有条件 Comply', '待处理', '待确认', '待上传', '待审批', '待评审', '待发布', '待复核', '评审中', '解析中', '处理中', '审批中', '排队中', '需重新确认', '同名文件 · 新版本']],
].flatMap(([tone, values]) => values.map(value => [value, tone])));
export function statusTone(status, override) { return override || tones[status] || 'neutral'; }
