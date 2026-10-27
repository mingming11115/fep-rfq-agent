import { makeSourceAnchor } from './documentAnchors.js';

export function sourcePartText(row, part = 'body') {
  if (part === 'heading') return `${row.clause || '无编号'}　${row.title || ''}`;
  if (part === 'body') return row.sourceOriginal ?? row.original ?? '';
  return null;
}

export function makeCommentDraft(row, selectedDraft) {
  const range = selectedDraft && commentTextRange(row, selectedDraft, selectedDraft.anchor?.locator?.textPart || 'body');
  if (range) return {
    quote: selectedDraft.quote || selectedDraft.anchor.locator.quote,
    anchor: { ...selectedDraft.anchor, locator: { ...selectedDraft.anchor.locator, quote: selectedDraft.quote || selectedDraft.anchor.locator.quote, textRange: range } },
  };
  return { quote: row.sourceOriginal ?? row.original ?? '', anchor: makeSourceAnchor(row) };
}

export function commentTextRange(row, comment, part = 'body') {
  const anchor = comment.anchor;
  if (!anchor || anchor.projectId !== row.projectId || anchor.fileId !== (row.sourceFileId || row.source || 'manual') || anchor.requirementId !== row.id || String(anchor.sourceVersion) !== String(row.sourceVersion || '1')) return null;
  if ((anchor.locator?.textPart || 'body') !== part) return null;
  const text = sourcePartText(row, part);
  if (text === null) return null;
  const quote = comment.quote || anchor.locator?.quote;
  if (!quote) return null;
  const range = anchor.locator?.textRange;
  if (range) return Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= text.length && text.slice(range.start, range.end) === quote ? { start: range.start, end: range.end } : null;
  const start = text.indexOf(quote);
  return start >= 0 && text.indexOf(quote, start + 1) === -1 ? { start, end: start + quote.length } : null;
}

export function annotatedSegments(row, comments, activeId, part = 'body') {
  const text = sourcePartText(row, part);
  if (!text) return [];
  const ranges = comments.map(comment => ({ comment, range: commentTextRange(row, comment, part) })).filter(entry => entry.range);
  const stops = [...new Set([0, text.length, ...ranges.flatMap(entry => [entry.range.start, entry.range.end])])].sort((a, b) => a - b);
  return stops.slice(0, -1).map((start, i) => {
    const end = stops[i + 1];
    const commentIds = ranges.filter(entry => entry.range.start <= start && entry.range.end >= end).map(entry => entry.comment.id);
    return { start, end, text: text.slice(start, end), commentIds, activeId: commentIds.includes(activeId) ? activeId : commentIds[0] };
  });
}
