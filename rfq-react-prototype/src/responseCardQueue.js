const isOpen = review => !['已关闭', '已取消'].includes(review.status);
const linkedTo = (row, reviews) => reviews.filter(review => review.requirementId === row.id);

function cardStatus(row, reviews) {
  if (row.status === '已确认') return 'confirmed';
  return row.pendingReviewProposal || linkedTo(row, reviews).some(isOpen) ? 'waiting' : 'pending';
}

export function responseCardStats(requirements = [], reviews = []) {
  const stats = { all: requirements.length, pending: 0, confirmed: 0, waiting: 0 };
  for (const row of requirements) stats[cardStatus(row, reviews)]++;
  return stats;
}

export function selectResponseCards(requirements = [], reviews = [], filters = {}) {
  const query = String(filters.query || '').trim().toLocaleLowerCase();
  return requirements.filter(row => {
    const linked = linkedTo(row, reviews);
    const text = [row.clause, row.title, row.original, row.owner, ...linked.flatMap(r => [r.id, r.title, r.owner, r.description])].join(' ').toLocaleLowerCase();
    if (query && !text.includes(query)) return false;
    if (filters.status && filters.status !== 'all' && cardStatus(row, reviews) !== filters.status) return false;
    if (filters.type === 'ordinary' && linked.length) return false;
    if (filters.type === 'review' && !linked.some(r => r.kind !== 'clarification')) return false;
    if (filters.type === 'clarification' && !linked.some(r => r.kind === 'clarification')) return false;
    if (filters.source && filters.source !== 'all' && !linked.some(r => String(r.source || '').includes(filters.source))) return false;
    return true;
  });
}

export function nextResponseCard(rows = [], currentId, deferredIds = []) {
  const index = rows.findIndex(row => row.id === currentId);
  const ordered = index < 0 ? rows : [...rows.slice(index + 1), ...rows.slice(0, index)];
  return ordered.find(row => row.id !== currentId && row.status !== '已确认' && !deferredIds.includes(row.id)) || null;
}

export async function transitionConfirmedCard({ confirm, animate, advance }) {
  if (await confirm() === false) return false;
  await animate();
  await advance();
  return true;
}

export function guardCardNavigation({ dirty, onBlock, previous }, next) {
  if (!dirty) return !previous || previous(next);
  onBlock(() => { if (!previous || previous(next)) next(); });
  return false;
}
