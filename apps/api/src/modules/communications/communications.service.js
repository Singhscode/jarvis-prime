import { createHash } from 'node:crypto';
import { AppError } from '../../middleware/error-handler.js';
import * as workspace from '../owner-workspace/owner-workspace.service.js';
import * as repository from './communications.repository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9._:-]{16,128}$/;

function invalid(message = 'Communication request is invalid.') { throw new AppError(message, 400, 'VALIDATION_ERROR'); }
function denied() { throw new AppError('Communication access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS'); }
function notFound(resource = 'Thread') { throw new AppError(`${resource} not found.`, 404, `COMMUNICATION_${resource.toUpperCase()}_NOT_FOUND`); }
function unavailable() { throw new AppError('Communication Hub is temporarily unavailable.', 503, 'COMMUNICATION_UNAVAILABLE', false); }
function requireObject(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); return value; }
function exact(value, fields) { requireObject(value); if (Object.keys(value).some((key) => !fields.has(key))) invalid(); }
function uuid(value, field = 'id') { if (typeof value !== 'string' || !UUID.test(value)) invalid(`Field '${field}' is invalid.`); return value; }
function text(value, field, min, max) {
  if (typeof value !== 'string') invalid(`Field '${field}' is invalid.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) invalid(`Field '${field}' is invalid.`);
  return normalized;
}
function idempotencyKey(value) { if (typeof value !== 'string' || !KEY.test(value)) invalid('Idempotency-Key is invalid.'); return value; }
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function cursor(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 512) invalid('Query cursor is invalid.');
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    exact(parsed, new Set(['timestamp', 'id']));
    if (typeof parsed.timestamp !== 'string' || Number.isNaN(Date.parse(parsed.timestamp)) || !UUID.test(parsed.id)) throw new Error('bad');
    return parsed;
  } catch { invalid('Query cursor is invalid.'); }
}
function page(query, { defaultLimit, maxLimit, cursorName = 'cursor' } = {}) {
  const raw = query?.limit; const limit = raw === undefined ? defaultLimit : Number.parseInt(raw, 10);
  if (raw !== undefined && (typeof raw !== 'string' || !Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit || String(limit) !== raw)) invalid('Query limit is invalid.');
  return { limit, cursor: cursor(query?.[cursorName]) };
}
function nextCursor(row, hasNextPage, field) {
  return hasNextPage ? Buffer.from(JSON.stringify({ timestamp: row[field], id: row.id })).toString('base64url') : null;
}
function operationError(error, resource = 'Thread') {
  if (error instanceof AppError) throw error;
  if (error?.code === 'P0001') {
    const message = error.message || '';
    if (message.includes('IDEMPOTENCY_CONFLICT')) throw new AppError('Idempotency key was reused with a different request.', 409, 'COMMUNICATION_IDEMPOTENCY_CONFLICT');
    if (message.includes('OWNER_REQUIRED')) denied();
    if (message.includes('ACCESS_DENIED')) denied();
    if (message.includes('NOT_FOUND') || message.includes('PARTICIPANT')) notFound(resource);
    if (message.includes('VALIDATION') || message.includes('DUPLICATE')) invalid();
  }
  if (error?.code === '23505') throw new AppError('Communication request conflicts with an existing record.', 409, 'COMMUNICATION_CONFLICT');
  if (error?.code === '23503' || error?.code === '23514') invalid();
  unavailable();
}

async function actorScope(userId) {
  try {
    await workspace.assertOwnerWorkspaceAccess(userId);
    await repository.syncActorParticipants(userId, userId);
    return { actorUserId: userId, ownerUserId: userId, kind: 'owner' };
  } catch (error) {
    if (error?.code !== 'INSUFFICIENT_PERMISSIONS') throw error;
  }
  try {
    const employee = await repository.getActiveEmployeeActor(userId);
    if (employee?.portal_owner_user_id) {
      await repository.syncActorParticipants(userId, employee.portal_owner_user_id);
      return { actorUserId: userId, ownerUserId: employee.portal_owner_user_id, kind: 'employee' };
    }
    const client = await repository.getActiveClientActor(userId);
    if (!client) denied();
    const memberships = await repository.listActiveClientMemberships(userId);
    if (memberships.length !== 1) denied();
    const owner = await repository.getClientOwner(memberships[0].crm_client_id);
    if (!owner?.owner_user_id) denied();
    await repository.syncActorParticipants(userId, owner.owner_user_id);
    return { actorUserId: userId, ownerUserId: owner.owner_user_id, kind: 'client' };
  } catch (error) {
    if (error instanceof AppError) throw error;
    unavailable();
  }
}

function userMap(users) { return new Map(users.map((user) => [user.id, user])); }
function participantViews(participants, users) {
  const byUser = userMap(users);
  return participants.map((participant) => ({
    userId: participant.user_id, kind: participant.participant_kind,
    displayName: byUser.get(participant.user_id)?.full_name?.trim() || 'Participant',
  }));
}
function attachmentViews(attachments) {
  return attachments.map((attachment) => ({ id: attachment.id, filename: attachment.display_filename, mediaType: attachment.media_type, sizeBytes: attachment.size_bytes, createdAt: attachment.created_at }));
}
function messageViews(messages, attachments, users) {
  const attachmentsByMessage = new Map();
  for (const attachment of attachments) attachmentsByMessage.set(attachment.message_id, [...(attachmentsByMessage.get(attachment.message_id) || []), attachment]);
  const byUser = userMap(users);
  return messages.map((message) => ({
    id: message.id, sequence: message.sequence, body: message.body, createdAt: message.created_at,
    sender: { kind: byUser.get(message.sender_user_id)?.kind || 'participant', displayName: byUser.get(message.sender_user_id)?.full_name?.trim() || 'Participant' },
    attachments: attachmentViews(attachmentsByMessage.get(message.id) || []),
  }));
}

async function threadDetail(scope, threadId, options = {}) {
  const participant = await repository.getActiveParticipant(scope.ownerUserId, threadId, scope.actorUserId);
  if (!participant) notFound('Thread');
  const thread = await repository.getThread(scope.ownerUserId, threadId);
  if (!thread) notFound('Thread');
  const messagesPage = await repository.listMessages(scope.ownerUserId, threadId, options);
  const participants = await repository.listThreadParticipants(scope.ownerUserId, [threadId]);
  const users = await repository.listSafeUsers([...new Set(participants.map((entry) => entry.user_id))]);
  const userEntries = users.map((user) => ({ ...user, kind: participants.find((participantRow) => participantRow.user_id === user.id)?.participant_kind }));
  const attachments = await repository.listAttachments(scope.ownerUserId, threadId, messagesPage.rows.map((message) => message.id));
  return {
    thread: {
      id: thread.id, subject: thread.subject, latestSequence: thread.last_sequence, latestMessageAt: thread.last_message_at,
      unreadCount: Math.max(0, Number(thread.last_sequence) - Number(participant.last_read_sequence)),
      participants: participantViews(participants, users),
    },
    messages: messageViews([...messagesPage.rows].reverse(), attachments, userEntries),
    pageInfo: {
      nextBeforeSequence: messagesPage.hasNextPage ? messagesPage.rows.at(-1).sequence : null,
      hasNextPage: messagesPage.hasNextPage,
    },
  };
}

export async function listThreads(userId, query) {
  exact(query || {}, new Set(['view', 'limit', 'cursor']));
  const view = query?.view === undefined ? 'inbox' : query.view;
  if (!['inbox', 'sent'].includes(view)) invalid('Query view is invalid.');
  const options = page(query, { defaultLimit: 20, maxLimit: 50 }); options.view = view;
  const scope = await actorScope(userId);
  try {
    const listed = await repository.listThreads(scope.ownerUserId, scope.actorUserId, options);
    const threadIds = listed.rows.map((thread) => thread.id);
    const [participants, latestMessages] = await Promise.all([
      repository.listThreadParticipants(scope.ownerUserId, threadIds), repository.listLatestMessages(scope.ownerUserId, threadIds),
    ]);
    const users = await repository.listSafeUsers([...new Set(participants.map((participant) => participant.user_id))]);
    const participantsByThread = new Map(); const latestByThread = new Map(latestMessages.map((message) => [message.thread_id, message]));
    for (const participant of participants) participantsByThread.set(participant.thread_id, [...(participantsByThread.get(participant.thread_id) || []), participant]);
    const items = listed.rows.map((thread) => {
      const membership = listed.memberships.get(thread.id); const latest = latestByThread.get(thread.id);
      return {
        id: thread.id, subject: thread.subject, latestSequence: thread.last_sequence, latestMessageAt: thread.last_message_at,
        unreadCount: Math.max(0, Number(thread.last_sequence) - Number(membership?.last_read_sequence || 0)),
        preview: latest ? latest.body.slice(0, 160) : '', participants: participantViews(participantsByThread.get(thread.id) || [], users),
      };
    });
    return { items, pageInfo: { nextCursor: nextCursor(listed.rows.at(-1), listed.hasNextPage, 'last_message_at'), hasNextPage: listed.hasNextPage } };
  } catch (error) { operationError(error); }
}

export async function getThread(userId, rawThreadId, query) {
  exact(query || {}, new Set(['beforeSequence', 'limit']));
  const threadId = uuid(rawThreadId, 'threadId');
  const rawBefore = query?.beforeSequence;
  let beforeSequence = null;
  if (rawBefore !== undefined) {
    const value = Number.parseInt(rawBefore, 10);
    if (typeof rawBefore !== 'string' || !Number.isSafeInteger(value) || value < 2 || String(value) !== rawBefore) invalid('Query beforeSequence is invalid.');
    beforeSequence = value;
  }
  const options = { ...page(query, { defaultLimit: 50, maxLimit: 100, cursorName: '__unused' }), beforeSequence };
  const scope = await actorScope(userId);
  try { return await threadDetail(scope, threadId, options); } catch (error) { operationError(error); }
}

function threadCreateValues(values, actorUserId) {
  exact(values, new Set(['subject', 'body', 'participants']));
  const subject = text(values.subject, 'subject', 1, 200); const body = text(values.body, 'body', 1, 10000);
  if (!Array.isArray(values.participants) || values.participants.length < 1 || values.participants.length > 25) invalid('Participants are invalid.');
  const seen = new Set();
  const participants = values.participants.map((entry) => {
    exact(entry, new Set(['kind', 'userId', 'membershipId']));
    if (entry.kind === 'employee' && Object.hasOwn(entry, 'userId') && !Object.hasOwn(entry, 'membershipId')) {
      const userId = uuid(entry.userId, 'participants.userId'); if (seen.has(userId)) invalid('Participants are invalid.'); seen.add(userId);
      return { kind: 'employee', user_id: userId };
    }
    if (entry.kind === 'client' && Object.hasOwn(entry, 'membershipId') && !Object.hasOwn(entry, 'userId')) {
      const membershipId = uuid(entry.membershipId, 'participants.membershipId'); if (seen.has(`client:${membershipId}`)) invalid('Participants are invalid.'); seen.add(`client:${membershipId}`);
      return { kind: 'client', membership_id: membershipId };
    }
    invalid('Participants are invalid.');
  });
  return { subject, body, participants: [{ kind: 'owner', user_id: actorUserId }, ...participants] };
}

export async function createThread(userId, values, headerKey) {
  const scope = await actorScope(userId);
  if (scope.kind !== 'owner') denied();
  const input = threadCreateValues(values, scope.actorUserId); const idempotencyKeyValue = idempotencyKey(headerKey);
  const stableParticipants = [...input.participants].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const requestHash = hash({ subject: input.subject, body: input.body, participants: stableParticipants });
  try {
    const result = await repository.createThread(scope.actorUserId, scope.ownerUserId, { ...input, idempotencyKey: idempotencyKeyValue, requestHash });
    return { ...(await threadDetail(scope, result.thread_id, { limit: 100, beforeSequence: null })), created: Boolean(result.created) };
  } catch (error) { operationError(error); }
}

function messageValues(values, files) {
  exact(values, new Set(['body']));
  const body = text(values.body, 'body', 1, 10000);
  if (!Array.isArray(files) || files.length > 5) invalid('Attachments are invalid.');
  const attachments = files.map((file) => {
    if (!file || !Buffer.isBuffer(file.buffer) || typeof file.filename !== 'string' || typeof file.mediaType !== 'string'
      || !Number.isSafeInteger(file.sizeBytes) || typeof file.sha256 !== 'string') invalid('Attachments are invalid.');
    return { filename: file.filename, mediaType: file.mediaType, sizeBytes: file.sizeBytes, sha256: file.sha256 };
  });
  return { body, attachments };
}

export async function sendMessage(userId, rawThreadId, values, files, headerKey) {
  const threadId = uuid(rawThreadId, 'threadId'); const scope = await actorScope(userId);
  const input = messageValues(values, files); const idempotencyKeyValue = idempotencyKey(headerKey);
  const requestHash = hash({ body: input.body, attachments: input.attachments });
  const operationHash = hash({ actorUserId: scope.actorUserId, idempotencyKey: idempotencyKeyValue });
  const createdPaths = []; let sendAttempted = false;
  try {
    const existing = await repository.findMessageByIdempotency(scope.ownerUserId, threadId, scope.actorUserId, idempotencyKeyValue);
    if (existing) {
      if (existing.request_sha256 !== requestHash) throw new AppError('Idempotency key was reused with a different request.', 409, 'COMMUNICATION_IDEMPOTENCY_CONFLICT');
      return { ...(await threadDetail(scope, threadId, { limit: 100, beforeSequence: null })), created: false };
    }
    const attachmentMetadata = [];
    for (const [index, file] of files.entries()) {
      const storagePath = `${scope.ownerUserId}/${threadId}/operation-${operationHash}/${String(index + 1).padStart(2, '0')}-${file.sha256}`;
      const uploaded = await repository.uploadAttachment(storagePath, file);
      if (uploaded.created) createdPaths.push(storagePath);
      attachmentMetadata.push({ storage_path: storagePath, display_filename: file.filename, media_type: file.mediaType, size_bytes: file.sizeBytes, sha256: file.sha256 });
    }

    let result;
    try {
      sendAttempted = true;
      result = await repository.sendMessage(scope.actorUserId, scope.ownerUserId, threadId, {
        body: input.body, idempotencyKey: idempotencyKeyValue, requestHash, attachments: attachmentMetadata,
      });
    } catch (sendError) {
      let committed;
      try {
        committed = await repository.findMessageByIdempotency(scope.ownerUserId, threadId, scope.actorUserId, idempotencyKeyValue);
      } catch {
        operationError(sendError);
      }
      if (!committed) {
        await repository.removeAttachments(createdPaths).catch(() => {});
        createdPaths.length = 0;
        operationError(sendError);
      }
      let committedPaths = null;
      try { committedPaths = new Set(await repository.listAttachmentPaths(scope.ownerUserId, threadId, committed.id)); } catch { /* An ambiguous response must not delete possibly committed objects. */ }
      if (committedPaths) await repository.removeAttachments(createdPaths.filter((path) => !committedPaths.has(path))).catch(() => {});
      if (committed.request_sha256 !== requestHash) {
        throw new AppError('Idempotency key was reused with a different request.', 409, 'COMMUNICATION_IDEMPOTENCY_CONFLICT');
      }
      result = { message_id: committed.id, sequence: committed.sequence, created: false };
    }

    try {
      const committedPaths = new Set(await repository.listAttachmentPaths(scope.ownerUserId, threadId, result.message_id));
      await repository.removeAttachments(createdPaths.filter((path) => !committedPaths.has(path))).catch(() => {});
    } catch { /* Post-commit projection failure must never remove possibly referenced objects. */ }
    return { ...(await threadDetail(scope, threadId, { limit: 100, beforeSequence: null })), created: Boolean(result.created) };
  } catch (error) {
    if (!sendAttempted) await repository.removeAttachments(createdPaths).catch(() => {});
    operationError(error);
  }
}

export async function markRead(userId, rawThreadId, values) {
  const threadId = uuid(rawThreadId, 'threadId'); exact(values, new Set(['sequence']));
  if (!Number.isSafeInteger(values.sequence) || values.sequence < 1) invalid('Field sequence is invalid.');
  const scope = await actorScope(userId);
  try { return await repository.markRead(scope.actorUserId, scope.ownerUserId, threadId, values.sequence); } catch (error) { operationError(error); }
}

export async function getAttachmentDownload(userId, rawThreadId, rawAttachmentId) {
  const threadId = uuid(rawThreadId, 'threadId'); const attachmentId = uuid(rawAttachmentId, 'attachmentId'); const scope = await actorScope(userId);
  try {
    if (!(await repository.getActiveParticipant(scope.ownerUserId, threadId, scope.actorUserId))) notFound('Attachment');
    const attachment = await repository.getAttachment(scope.ownerUserId, threadId, attachmentId);
    if (!attachment) notFound('Attachment');
    const signed = await repository.createAttachmentDownload(attachment.storage_path, attachment.display_filename);
    if (!signed) unavailable();
    return { url: signed.signedUrl, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  } catch (error) { operationError(error, 'Attachment'); }
}

export async function listNotifications(userId, query) {
  exact(query || {}, new Set(['state', 'limit', 'cursor']));
  const state = query?.state;
  if (state !== undefined && !['unread', 'read', 'dismissed'].includes(state)) invalid('Query state is invalid.');
  const options = page(query, { defaultLimit: 20, maxLimit: 50 }); options.state = state;
  const scope = await actorScope(userId);
  try {
    const listed = await repository.listNotifications(scope.ownerUserId, scope.actorUserId, options);
    return {
      items: listed.rows.map((notification) => ({
        id: notification.id, kind: notification.kind, state: notification.state, threadId: notification.thread_id,
        messageId: notification.message_id, title: 'New message', createdAt: notification.created_at,
        readAt: notification.read_at, dismissedAt: notification.dismissed_at,
      })),
      pageInfo: { nextCursor: nextCursor(listed.rows.at(-1), listed.hasNextPage, 'created_at'), hasNextPage: listed.hasNextPage },
    };
  } catch (error) { operationError(error, 'Notification'); }
}

export async function setNotificationState(userId, rawNotificationId, values) {
  const notificationId = uuid(rawNotificationId, 'notificationId'); exact(values, new Set(['state']));
  if (!['read', 'dismissed'].includes(values.state)) invalid('Field state is invalid.');
  const scope = await actorScope(userId);
  try {
    const notification = await repository.setNotificationState(scope.actorUserId, scope.ownerUserId, notificationId, values.state);
    return { id: notification.id, state: notification.state, readAt: notification.read_at, dismissedAt: notification.dismissed_at };
  } catch (error) { operationError(error, 'Notification'); }
}

export async function getPreferences(userId) {
  const scope = await actorScope(userId);
  try {
    const preferences = await repository.getPreferences(scope.ownerUserId, scope.actorUserId);
    return { inAppEnabled: preferences?.in_app_enabled ?? true, emailEnabled: preferences?.email_enabled ?? false };
  } catch (error) { operationError(error, 'Preference'); }
}

export async function updatePreferences(userId, values) {
  exact(values, new Set(['inAppEnabled', 'emailEnabled']));
  if (typeof values.inAppEnabled !== 'boolean' || typeof values.emailEnabled !== 'boolean') invalid();
  const scope = await actorScope(userId);
  try {
    const preferences = await repository.upsertPreferences(scope.actorUserId, scope.ownerUserId, values);
    return { inAppEnabled: preferences.in_app_enabled, emailEnabled: preferences.email_enabled };
  } catch (error) { operationError(error, 'Preference'); }
}
