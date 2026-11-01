import { makeSourceAnchor } from './documentAnchors.js';

const text = value => typeof value === 'string' ? value : '';
const keyOf = value => text(value?.nativeKey || value?.nativeRef?.key);
const fingerprint = value => JSON.stringify(value);
const same = (a, b) => fingerprint(a) === fingerprint(b);
const owns = (id, actor) => Boolean(actor?.id && id === actor.id);
const sourceMatches = (a, b) => Boolean(a && b && a.projectId === b.projectId && a.fileId === b.fileId && String(a.sourceVersion) === String(b.sourceVersion));

const commentMetadata = new Set(['id', 'createdBy', 'createdAt', 'nativeRef', 'nativeAuthor', 'nativeDeleted', 'replies']);
const replyMetadata = new Set(['id', 'by', 'at', 'nativeRef', 'nativeAuthor']);
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Patch only fields changed by this user action. Nested maps (for example linked
// issues) merge by field, so an unrelated concurrent addition remains intact.
function businessDelta(current, baseline, next, protectedFields = new Set()) {
  let updated = current;
  for (const field of new Set([...Object.keys(baseline), ...Object.keys(next)])) {
    if (protectedFields.has(field) || same(baseline[field], next[field])) continue;
    if (!Object.hasOwn(next, field)) {
      if (Object.hasOwn(updated, field)) {
        if (updated === current) updated = { ...current };
        delete updated[field];
      }
      continue;
    }
    const value = plainObject(next[field]) && (baseline[field] == null || plainObject(baseline[field]))
      ? businessDelta(plainObject(current[field]) ? current[field] : {}, baseline[field] || {}, next[field])
      : next[field];
    if (same(current[field], value)) continue;
    if (updated === current) updated = { ...current };
    updated[field] = value;
  }
  return updated;
}

function matchingReply(reply, candidates, position, allowPosition = true) {
  let index = candidates.findIndex(candidate => candidate.reply === reply);
  if (index < 0 && keyOf(reply)) index = candidates.findIndex(candidate => keyOf(candidate.reply) === keyOf(reply));
  if (index < 0 && reply.id) index = candidates.findIndex(candidate => candidate.reply.id === reply.id);
  if (index < 0 && reply.at) index = candidates.findIndex(candidate => candidate.reply.by === reply.by && candidate.reply.at === reply.at);
  if (index < 0 && allowPosition) index = candidates.findIndex(candidate => candidate.reply.by === reply.by && candidate.reply.at === reply.at && candidate.reply.text === reply.text);
  if (index < 0 && allowPosition) index = candidates.findIndex(candidate => candidate.index === position && candidate.reply.by === reply.by);
  return index;
}

function collaborationReplies(current, baseline, next) {
  const updated = [...current];
  const remainingNext = next.map((reply, index) => ({ reply, index }));
  const remainingCurrent = current.map((reply, index) => ({ reply, index }));
  for (let position = 0; position < baseline.length; position++) {
    const before = baseline[position];
    const nextIndex = matchingReply(before, remainingNext, position);
    if (nextIndex < 0) continue; // This UI has no reply deletion action.
    const [{ reply: after }] = remainingNext.splice(nextIndex, 1);
    const currentIndex = matchingReply(before, remainingCurrent, position);
    if (currentIndex < 0) continue; // A stale edit cannot restore a deleted reply.
    const [{ reply: latest, index }] = remainingCurrent.splice(currentIndex, 1);
    updated[index] = businessDelta(latest, before, after, replyMetadata);
  }
  for (const { reply } of remainingNext) {
    // Stable IDs or the original local author/time identify a retried append.
    if (matchingReply(reply, updated.map((item, index) => ({ reply: item, index })), -1, false) < 0) updated.push(reply);
  }
  return updated.length === current.length && updated.every((reply, index) => reply === current[index]) ? current : updated;
}

/** Apply a visible right-side action to the latest full project comment array. */
export function applyCollaborationEdit(current = [], baseline = [], next = []) {
  const before = new Map(baseline.map(comment => [comment.id, comment]));
  const after = new Map(next.map(comment => [comment.id, comment]));
  const known = new Set(current.map(comment => comment.id));
  const additions = [];
  for (const comment of next) {
    if (before.has(comment.id) || known.has(comment.id)) continue;
    additions.push(comment);
    known.add(comment.id);
  }
  return [...additions, ...current.map(comment => {
    const original = before.get(comment.id), action = after.get(comment.id);
    // Omitting a visible record does not request deletion. Tombstones and
    // concurrent native records remain in their current state.
    if (!original || !action || comment.nativeDeleted) return comment;
    let updated = businessDelta(comment, original, action, commentMetadata);
    if (!same(original.replies, action.replies)) {
      const replies = collaborationReplies(comment.replies || [], original.replies || [], action.replies || []);
      if (replies !== comment.replies) updated = { ...updated, replies };
    }
    return updated;
  })];
}

function scopedRows(rows = [], source) {
  if (!source?.projectId || !source.fileId || source.sourceVersion == null) return [];
  return rows.filter(row => sourceMatches(makeSourceAnchor(row), source));
}

function uniqueRow(rows, id) {
  const matches = rows.filter(row => row.id === id);
  return matches.length === 1 ? matches[0] : undefined;
}

function anchorRow(comment, rows, source) {
  return sourceMatches(comment.anchor, source) ? uniqueRow(rows, comment.anchor.requirementId) : undefined;
}

// The caller guards the iframe's session token. Optional host metadata provides
// another boundary; the native document token is not the backend document ID.
function validSnapshot(snapshot, source, documentId) {
  if (!documentId || !text(snapshot?.document) || !Array.isArray(snapshot?.notes)) return false;
  if (snapshot.documentId != null && snapshot.documentId !== documentId) return false;
  return ['projectId', 'fileId', 'sourceVersion'].every(field => snapshot.source?.[field] == null || String(snapshot.source[field]) === String(source?.[field]));
}

function authorId(name, people = [], actor) {
  const directory = [...people, ...(actor?.id ? [actor] : [])];
  const matches = [...new Set(directory.filter(person => person.name === name).map(person => person.id))];
  return matches.length === 1 ? matches[0] : `external:${encodeURIComponent(text(name) || 'unknown')}`;
}

function authorName(id, people = [], actor) {
  return people.find(person => person.id === id)?.name || (actor?.id === id ? actor.name : '') || text(id);
}

function displayAuthor(record, people, actor, reply = false) {
  return record.nativeAuthor ?? record.nativeRef?.base?.author ?? authorName(reply ? record.by : record.createdBy, people, actor);
}

function businessProjection(comment, { people = [], actor } = {}) {
  return {
    text: text(comment.text),
    author: displayAuthor(comment, people, actor),
    resolved: comment.status === '已解决',
    quote: text(comment.quote ?? comment.anchor?.locator?.quote),
    clauseId: text(comment.anchor?.requirementId),
    replies: (comment.replies || []).map(reply => ({ key: keyOf(reply), text: text(reply.text), author: displayAuthor(reply, people, actor, true) })),
  };
}

/** Capture this before saving bytes; pass the capture to markCraftSaved. */
export function craftCommentFingerprint(comment, options = {}) {
  return fingerprint(comment.nativeDeleted ? { deleted: true, key: comment.nativeRef?.key } : businessProjection(comment, options));
}

function nativeProjection(note, row) {
  return {
    text: text(note.text), author: text(note.author), resolved: Boolean(note.resolved),
    quote: text(note.quote) || text(row.sourceOriginal ?? row.original), clauseId: row.id,
    replies: (note.replies || []).filter(reply => keyOf(reply)).map(reply => ({ key: keyOf(reply), text: text(reply.text), author: text(reply.author) })),
  };
}

function noteIndex(notes) {
  const byKey = new Map(), duplicates = new Set();
  for (const note of notes) {
    const key = keyOf(note);
    if (byKey.has(key)) duplicates.add(key);
    byKey.set(key, note);
  }
  return { byKey, duplicates };
}

function bindingRef(ref, projection, context, state = 'synced') {
  const value = fingerprint(projection);
  const { conflict: previousConflict, ...prior } = ref || {};
  return {
    ...prior, documentId: context.documentId, engine: context.engine ?? ref?.engine,
    revision: context.revision, base: projection, fingerprint: value,
    state: state === 'synced' && ref?.savedFingerprint === value ? 'saved' : state,
    ...(context.snapshot?.document ? { documentToken: context.snapshot.document } : {}),
  };
}

function replyRef(reply, nativeReply, context) {
  return { ...reply.nativeRef, documentId: context.documentId, engine: context.engine, key: keyOf(nativeReply) };
}

// Replies with identical content are paired by occurrence. This handles the
// native echo arriving before its upsert acknowledgment without losing mentions.
function reconcileReplyKeys(comment, projection, context) {
  const available = [...projection.replies];
  const replies = (comment.replies || []).map(reply => {
    let index = available.findIndex(native => keyOf(reply) && native.key === keyOf(reply));
    if (index < 0 && !keyOf(reply)) index = available.findIndex(native => native.text === text(reply.text) && native.author === displayAuthor(reply, context.people, context.actor, true));
    if (index < 0) return reply;
    const [native] = available.splice(index, 1);
    return { ...reply, nativeAuthor: reply.nativeAuthor ?? native.author, nativeRef: replyRef(reply, { nativeKey: native.key }, context) };
  });
  return { ...comment, replies };
}

function receiveNative(comment, note, projection, context) {
  const replies = projection.replies.map(native => {
    const prior = comment.replies?.find(reply => keyOf(reply) === native.key);
    const raw = note.replies?.find(reply => keyOf(reply) === native.key);
    return {
      ...(prior || {}), text: native.text, by: prior?.by ?? authorId(native.author, context.people, context.actor),
      at: prior?.at ?? raw?.date ?? '', nativeAuthor: native.author,
      mentionedUserIds: prior?.mentionedUserIds ?? [],
      nativeRef: replyRef(prior || {}, { nativeKey: native.key }, context),
    };
  });
  return {
    ...comment, text: projection.text, quote: projection.quote, nativeAuthor: projection.author,
    anchor: { ...comment.anchor, locator: { ...comment.anchor.locator, quote: projection.quote } },
    status: projection.resolved ? '已解决' : '未解决', replies,
    nativeRef: bindingRef({ ...comment.nativeRef, key: keyOf(note) }, projection, context),
  };
}

function importNative(note, row, projection, context) {
  const identity = [context.source.projectId, context.source.fileId, String(context.source.sourceVersion), context.documentId, keyOf(note)];
  const comment = {
    id: `CRAFT-${encodeURIComponent(fingerprint(identity))}`, anchor: makeSourceAnchor(row),
    createdBy: authorId(note.author, context.people, context.actor), createdAt: note.date ?? '',
    mentionedUserIds: [], linkedIssues: {}, replies: [],
  };
  return receiveNative(comment, note, projection, context);
}

function canWrite(row, comment, callback) {
  return typeof callback === 'function' && callback(row, comment) === true;
}

function savedProjection(ref) {
  try {
    const saved = JSON.parse(ref.savedFingerprint);
    return saved && !saved.deleted && typeof saved.text === 'string' && Array.isArray(saved.replies) ? saved : undefined;
  } catch { return undefined; }
}

/** Pure native -> collaboration merge. Unassociated notes remain only in the file. */
export function mergeNativeComments({ comments = [], snapshot, source, documentId, revision, engine, rows = [], actor, people = [], associations = {}, canEditRow }) {
  const unlinked = [], conflicts = [];
  if (!validSnapshot(snapshot, source, documentId)) return { comments, unlinked, conflicts, changed: false };
  const currentRows = scopedRows(rows, source);
  const context = { source, documentId, revision, engine, snapshot, actor, people, canEditRow };
  const { byKey, duplicates } = noteIndex(snapshot.notes);
  let next = [...comments];
  for (const note of snapshot.notes) {
    const key = keyOf(note);
    const bound = next.map((comment, index) => ({ comment, index })).filter(({ comment }) => comment.nativeRef?.documentId === documentId && comment.nativeRef.key === key && sourceMatches(comment.anchor, source));
    if (!bound.length && !text(note.text).trim() && !(note.replies || []).some(reply => text(reply.text).trim())) continue;
    if (!key || duplicates.has(key)) {
      unlinked.push({ ...note, reason: key ? 'duplicate-native-key' : 'missing-native-key' });
      continue;
    }
    if (bound.length > 1) {
      conflicts.push({ nativeKey: key, reason: 'duplicate-binding', commentIds: bound.map(({ comment }) => comment.id) });
      continue;
    }
    let existing = bound[0];
    const explicit = Object.hasOwn(associations, key);
    const association = associations[key];
    const associatedId = typeof association === 'string' ? association : association?.requirementId;
    const row = existing ? anchorRow(existing.comment, currentRows, source) : uniqueRow(currentRows, explicit ? associatedId : note.clauseId);
    if (!row || (!existing && !explicit && !text(note.quote).trim())) {
      unlinked.push({ ...note, reason: existing ? 'stale-anchor' : 'unassociated' });
      continue;
    }
    const native = nativeProjection(note, row);
    if (!existing) {
      const pending = next.map((comment, index) => ({ comment, index })).filter(({ comment }) => {
        if (comment.nativeDeleted || comment.nativeRef?.key || (comment.nativeRef?.documentId && comment.nativeRef.documentId !== documentId) || !owns(comment.createdBy, actor) || anchorRow(comment, currentRows, source)?.id !== row.id) return false;
        return same(businessProjection(reconcileReplyKeys(comment, native, context), context), native);
      });
      if (pending.length === 1) existing = pending[0];
    }
    if (!existing) {
      next.push(importNative(note, row, native, context));
      continue;
    }
    const current = existing.comment;
    if (current.nativeDeleted) {
      // A reappearing key in the session that observed its deletion is native
      // Undo. The same key in a different session can still be an older file.
      if (current.nativeRef.documentToken === snapshot.document) {
        const { nativeDeleted, ...restored } = current;
        const { deletedSaved, ...ref } = current.nativeRef;
        next[existing.index] = receiveNative({ ...restored, nativeRef: ref }, note, native, context);
      }
      continue;
    }
    const reconciled = reconcileReplyKeys(current, native, context);
    const local = businessProjection(reconciled, context), base = current.nativeRef?.base;
    const ref = current.nativeRef;
    const reopened = ref?.documentToken && ref.documentToken !== snapshot.document;
    // A native acknowledgment advances the live baseline before file bytes are
    // saved. Reopening the persisted file must not turn that acknowledgment into
    // permission to replace newer business text or discard its replies.
    if (reopened && base && ref.savedFingerprint !== fingerprint(base) && !same(local, native)) {
      const saved = savedProjection(ref);
      const unchangedRevision = ref.revision != null && revision != null && String(ref.revision) === String(revision);
      if (unchangedRevision || (saved && same(native, saved))) {
        next[existing.index] = { ...reconciled, nativeRef: bindingRef(ref, native, context, 'pending') };
      } else {
        const conflict = { commentId: current.id, nativeKey: key, reason: 'concurrent-edit', base: saved || base, local, native };
        conflicts.push(conflict);
        next[existing.index] = { ...reconciled, nativeRef: { ...ref, state: 'conflict', conflict } };
      }
      continue;
    }
    if ((!base && !['pending', 'dirty'].includes(current.nativeRef?.state)) || same(local, base) || same(local, native)) {
      next[existing.index] = receiveNative(reconciled, note, native, context);
    } else if (!base || same(native, base)) {
      next[existing.index] = { ...reconciled, nativeRef: { ...current.nativeRef, state: 'pending', revision, documentToken: snapshot.document } };
    } else {
      const conflict = { commentId: current.id, nativeKey: key, reason: 'concurrent-edit', base, local, native };
      conflicts.push(conflict);
      next[existing.index] = { ...reconciled, nativeRef: { ...current.nativeRef, state: 'conflict', conflict } };
    }
  }
  if (snapshot.complete !== false) {
    next = next.map(comment => {
      const ref = comment.nativeRef;
      if (ref?.documentId !== documentId || !ref.key || !anchorRow(comment, currentRows, source) || byKey.has(ref.key)) return comment;
      if (comment.nativeDeleted) return ref.documentToken === snapshot.document ? comment : { ...comment, nativeRef: { ...ref, documentToken: snapshot.document } };
      const local = businessProjection(comment, context);
      const pending = !ref.base || !same(local, ref.base) || ref.state === 'pending' || ref.state === 'conflict';
      const observed = Boolean(snapshot.document && ref.documentToken === snapshot.document);
      const changedRevision = ref.revision != null && revision != null && String(ref.revision) !== String(revision);
      const unsavedBase = ref.base && ref.savedFingerprint !== fingerprint(ref.base);
      if (ref.documentToken && !observed && changedRevision && (pending || unsavedBase)) {
        const conflict = { commentId: comment.id, nativeKey: ref.key, reason: 'concurrent-delete', base: savedProjection(ref) || ref.base, local, native: null };
        conflicts.push(conflict);
        return { ...comment, nativeRef: { ...ref, state: 'conflict', conflict } };
      }
      if (!pending && (observed || ref.savedFingerprint === fingerprint(ref.base))) {
        return { ...comment, nativeDeleted: true, nativeRef: { ...ref, state: 'deleted', deletedSaved: false, documentToken: snapshot.document } };
      }
      return { ...comment, nativeRef: { ...ref, state: 'pending' } };
    });
  }
  const changed = !same(next, comments);
  return { comments: changed ? next : comments, unlinked, conflicts, changed };
}

function permittedProjection(comment, native, context) {
  const local = businessProjection(comment, context);
  if (!native) return { ...local, replies: local.replies.filter((reply, index) => owns(comment.replies[index].by, context.actor)) };
  const rootOwn = owns(comment.createdBy, context.actor);
  const replies = [];
  for (let i = 0; i < local.replies.length; i++) {
    const reply = local.replies[i], business = comment.replies[i];
    const existing = native.replies.find(item => item.key === reply.key && reply.key);
    if (existing) replies.push(owns(business.by, context.actor) ? { ...reply, author: existing.author } : existing);
    else if (owns(business.by, context.actor)) replies.push(reply);
  }
  for (const reply of native.replies) if (!replies.some(item => item.key === reply.key)) replies.push(reply);
  return { ...local, text: rootOwn ? local.text : native.text, author: native.author, quote: native.quote, clauseId: native.clauseId, replies };
}

/** Pure collaboration -> native command plan; numeric IDs come from this snapshot. */
export function planCraftWrites({ comments = [], snapshot, source, documentId, revision, rows = [], actor, people = [], canEditRow }) {
  if (!validSnapshot(snapshot, source, documentId)) return [];
  const currentRows = scopedRows(rows, source), { byKey, duplicates } = noteIndex(snapshot.notes);
  const context = { actor, people, revision };
  const operations = [];
  for (const comment of comments) {
    const row = anchorRow(comment, currentRows, source), ref = comment.nativeRef;
    if (!row || !canWrite(row, comment, canEditRow) || (ref?.documentId && ref.documentId !== documentId) || ref?.state === 'conflict' || duplicates.has(ref?.key)) continue;
    const note = ref?.key ? byKey.get(ref.key) : undefined;
    if (!note && snapshot.complete === false) continue;
    if (comment.nativeDeleted) {
      if (note && owns(comment.createdBy, actor)) operations.push({ commentId: comment.id, action: 'delete', params: { id: note.id }, nativeKey: ref.key });
      continue;
    }
    if (!note && !ref?.base && !owns(comment.createdBy, actor)) continue;
    const native = note ? nativeProjection(note, row) : undefined;
    const local = businessProjection(comment, context);
    if (native && ref?.base && !same(local, ref.base) && !same(native, ref.base) && !same(local, native)) continue;
    const projection = permittedProjection(comment, native || ref?.base, context);
    if (native && same(projection, native)) continue;
    if (!projection.text.trim() && !projection.replies.some(reply => reply.text.trim())) continue;
    const params = {
      ...(note ? { id: note.id } : {}), text: projection.text, author: projection.author,
      resolved: projection.resolved, quote: projection.quote, clauseId: row.id,
      ...(Number.isFinite(Number(comment.anchor.locator?.page)) && Number(comment.anchor.locator.page) > 0 ? { page: Number(comment.anchor.locator.page) - 1 } : {}),
      replies: projection.replies.map(reply => {
        const match = note?.replies?.find(nativeReply => keyOf(nativeReply) === reply.key && reply.key);
        return { ...(match ? { id: match.id } : {}), text: reply.text, author: reply.author };
      }),
    };
    const available = (comment.replies || []).map((reply, index) => ({ reply, index }));
    const replySources = projection.replies.map(reply => {
      const index = available.findIndex(item => reply.key ? keyOf(item.reply) === reply.key : !keyOf(item.reply) && text(item.reply.text) === reply.text && displayAuthor(item.reply, people, actor, true) === reply.author);
      if (index < 0) return null;
      const [match] = available.splice(index, 1);
      return { id: match.reply.id, by: match.reply.by, at: match.reply.at, index: match.index };
    });
    operations.push({ commentId: comment.id, action: 'upsert', params, ...(ref?.key ? { nativeKey: ref.key } : {}), projection: { ...projection, replySources } });
  }
  return operations;
}

/** Bind the command result using the projection captured when it was sent. */
export function applyCraftBinding(comments, commentId, result, { documentId, engine, revision, people = [], actor } = {}) {
  if (!documentId || !keyOf(result)) return comments;
  const target = comments.find(comment => comment.id === commentId);
  if (!target || (target.nativeRef?.documentId && target.nativeRef.documentId !== documentId)) return comments;
  const echoes = comments.filter(comment => comment.id !== commentId && comment.nativeRef?.documentId === documentId && comment.nativeRef.key === keyOf(result) && sourceMatches(comment.anchor, target.anchor));
  return comments.filter(comment => !echoes.includes(comment)).map(comment => {
    if (comment.id !== commentId || (comment.nativeRef?.documentId && comment.nativeRef.documentId !== documentId)) return comment;
    const { replySources = [], ...sent } = result.projection || businessProjection(comment, { people, actor });
    const bindings = sent.replies.map((reply, index) => ({ ...reply, source: replySources[index], returned: result.replies?.[index] }));
    const available = [...bindings];
    const replies = (comment.replies || []).map(reply => {
      let index = available.findIndex(item => keyOf(reply) ? item.key === keyOf(reply) : !item.key && item.text === text(reply.text) && item.author === displayAuthor(reply, people, actor, true));
      if (index < 0 && !keyOf(reply)) index = available.findIndex(item => !item.key && item.source && (item.source.id ? item.source.id === reply.id : item.source.at && item.source.by === reply.by && item.source.at === reply.at));
      if (index < 0) return reply;
      const [binding] = available.splice(index, 1);
      if (!keyOf(binding.returned)) return reply;
      return { ...reply, nativeAuthor: reply.nativeAuthor ?? binding.author, nativeRef: { ...reply.nativeRef, documentId, engine, key: keyOf(binding.returned) } };
    });
    const base = { ...sent, replies: bindings.map(binding => ({ key: keyOf(binding.returned) || binding.key, text: binding.text, author: binding.author })) };
    const replyKeys = new Set(replies.map(keyOf).filter(Boolean));
    const extras = echoes.flatMap(echo => echo.replies || []).filter(reply => {
      const key = keyOf(reply);
      if (!key || replyKeys.has(key)) return false;
      replyKeys.add(key);
      return true;
    });
    const updated = { ...comment, nativeAuthor: comment.nativeAuthor ?? sent.author, replies: [...replies, ...extras],
      ...(echoes.length ? {
        mentionedUserIds: [...new Set([...(comment.mentionedUserIds || []), ...echoes.flatMap(echo => echo.mentionedUserIds || [])])],
        linkedIssues: Object.assign({}, ...echoes.map(echo => echo.linkedIssues), comment.linkedIssues),
      } : {}),
    };
    const documentToken = comment.nativeRef?.documentToken || echoes.find(echo => echo.nativeRef?.documentToken)?.nativeRef.documentToken;
    const ref = bindingRef({ ...comment.nativeRef, key: keyOf(result), ...(documentToken ? { documentToken } : {}) }, base, { documentId, engine, revision });
    if (!same(businessProjection(updated, { people, actor }), base)) ref.state = 'pending';
    return { ...updated, nativeRef: ref };
  });
}

/** Only bytes represented by a captured fingerprint may become "saved". */
export function markCraftSaved(comments, { documentId, revision, keys, fingerprints } = {}) {
  return comments.map(comment => {
    const ref = comment.nativeRef;
    if (ref?.documentId !== documentId || (keys && !keys.includes(ref.key) && !keys.includes(comment.id))) return comment;
    let captured;
    if (fingerprints instanceof Map) captured = fingerprints.get(comment.id) ?? fingerprints.get(ref.key);
    else if (fingerprints) captured = fingerprints[comment.id] ?? fingerprints[ref.key];
    if (fingerprints && captured == null) return comment;
    const current = craftCommentFingerprint(comment);
    const savedFingerprint = captured ?? (comment.nativeDeleted ? current : ref.fingerprint ?? current);
    const allSaved = current === savedFingerprint && (comment.nativeDeleted || ref.fingerprint === current);
    return {
      ...comment, nativeRef: { ...ref, revision, savedFingerprint,
        state: comment.nativeDeleted ? 'deleted' : allSaved ? 'saved' : 'dirty',
        ...(comment.nativeDeleted ? { deletedSaved: allSaved } : {}),
      },
    };
  });
}
