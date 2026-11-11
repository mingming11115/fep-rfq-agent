export function answerRemark(row) {
  return row?.remark ?? row?.reason ?? '';
}

export function normalizeResponseRemark(row) {
  if (!Object.hasOwn(row, 'reason')) { return row; }
  const { reason, ...response } = row;
  response.remark = response.remark ?? reason;
  return response;
}
