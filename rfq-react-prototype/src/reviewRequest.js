export function reviewEvidenceHref(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

export function buildReviewRequest({ requirement, form, requirementVersion }) {
  if (['title', 'owner', 'deadline', 'description'].some(key => !String(form[key] || '').trim())) {
    throw new Error('请补齐事项标题、责任人、截止时间和问题说明。');
  }
  const evidence = String(form.evidence || '').trim();
  const evidenceLink = reviewEvidenceHref(evidence);
  if (evidence && !evidenceLink) throw new Error('关联证据请填写完整的 http:// 或 https:// 链接。');
  return {
    kind: 'review', requirementId: requirement.id,
    requirementVersion: requirementVersion || requirement.version || 1,
    title: form.title.trim(), owner: form.owner.trim(), deadline: form.deadline,
    type: form.type || (requirement.matchLevel === 'none' ? '知识缺口' : '条件差异'),
    source: form.source || '人工发起评审', description: form.description.trim(), evidence: evidenceLink,
  };
}
