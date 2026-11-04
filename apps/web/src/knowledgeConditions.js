export function conditionTags(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.flatMap(item => String(item ?? '').split(/[;；\r\n]+/))
    .map(item => item.trim()).filter(Boolean))];
}

export const conditionText = values => conditionTags(values).join('；');
