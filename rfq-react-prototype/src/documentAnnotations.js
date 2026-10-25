export function commentTextRange(row, comment) {
  const anchor = comment.anchor;
  if (!anchor || anchor.projectId !== row.projectId || anchor.fileId !== (row.sourceFileId || row.source || 'manual') || anchor.requirementId !== row.id || String(anchor.sourceVersion) !== String(row.sourceVersion || '1')) return null;
  const text = row.sourceOriginal ?? row.original ?? '';
  const quote = comment.quote || anchor.locator?.quote;
  if (!quote) return null;
  const range = anchor.locator?.textRange;
  if (range) return Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= text.length && text.slice(range.start, range.end) === quote ? { start: range.start, end: range.end } : null;
  const start = text.indexOf(quote);
  return start >= 0 && text.indexOf(quote, start + 1) === -1 ? { start, end: start + quote.length } : null;
}

export function annotatedSegments(row, comments, activeId) {
  const text = row.sourceOriginal ?? row.original ?? '';
  if (!text) return [];
  const ranges = comments.map(comment => ({ comment, range: commentTextRange(row, comment) })).filter(entry => entry.range);
  const stops = [...new Set([0, text.length, ...ranges.flatMap(entry => [entry.range.start, entry.range.end])])].sort((a, b) => a - b);
  return stops.slice(0, -1).map((start, i) => {
    const end = stops[i + 1];
    const commentIds = ranges.filter(entry => entry.range.start <= start && entry.range.end >= end).map(entry => entry.comment.id);
    return { start, end, text: text.slice(start, end), commentIds, activeId: commentIds.includes(activeId) ? activeId : commentIds[0] };
  });
}
