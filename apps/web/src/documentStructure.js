// A document owns its outline. Original numbers are labels, never identities.
export const sectionPath = (row) => Array.isArray(row.sectionPath) ? row.sectionPath : [];
export const sectionLabel = (row) => sectionPath(row).join(' / ') || '未识别章节';
export function documentSections(rows, fileId) {
  const sections = new Map();
  for (const row of rows.filter(row => row.sourceFileId === fileId)) {
    const path = sectionPath(row);
    const prefixes = path.length ? path.map((_, i) => path.slice(0, i + 1)) : [[]];
    for (const prefix of prefixes) {
      const key = JSON.stringify(prefix);
      if (!sections.has(key)) { sections.set(key, { key, path: prefix, rowIds: [] }); }
      sections.get(key).rowIds.push(row.id);
    }
  }
  return [...sections.values()];
}
