export const OTHER_CONCLUSION = '其他';

export function answerRemark(row) {
  return row?.remark ?? row?.reason ?? '';
}

export function conclusionText(row) {
  return String(row?.conclusionText ?? '').trim();
}

export function conclusionDisplay(row) {
  const conclusion = String(row?.conclusion ?? '').trim();
  if (conclusion !== OTHER_CONCLUSION) { return conclusion; }
  const text = conclusionText(row);
  return text ? `${OTHER_CONCLUSION}：${text}` : OTHER_CONCLUSION;
}

export function normalizeResponseRemark(row) {
  if (!Object.hasOwn(row, 'reason')) { return row; }
  const { reason, ...response } = row;
  response.remark = response.remark ?? reason;
  return response;
}
