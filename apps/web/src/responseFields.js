export function mergeAnswerConditions(draft = '', conditions = '') {
  const text = String(draft ?? '');
  const condition = String(conditions ?? '').trim();
  if (!condition) { return text; }
  const line = `适用条件：${condition}`;
  return text.includes(line) ? text : [text, line].filter(Boolean).join('\n');
}

export function singleLineReply(value) {
  return String(value ?? '').replace(/[ \t]*[\r\n]+[ \t]*/g, ' ');
}

export function answerRemark(row) {
  return row?.remark ?? row?.reason ?? '';
}

export function normalizeResponseRemark(row) {
  if (!Object.hasOwn(row, 'reason')) { return row; }
  const { reason, ...response } = row;
  response.remark = response.remark ?? reason;
  return response;
}
