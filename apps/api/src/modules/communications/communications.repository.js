import { getDb } from '../../database/db.js';

const THREAD_FIELDS = 'id,subject,last_sequence,last_message_at,created_at';
const PARTICIPANT_FIELDS = 'thread_id,user_id,participant_kind,status,last_read_sequence,joined_at';
const MESSAGE_FIELDS = 'id,thread_id,sender_user_id,sequence,body,created_at';
const ATTACHMENT_FIELDS = 'id,message_id,display_filename,media_type,size_bytes,created_at';
const NOTIFICATION_FIELDS = 'id,thread_id,message_id,kind,state,created_at,read_at,dismissed_at';

function client() {
  const { client: db, usingMemory } = getDb();
  if (usingMemory) throw new Error('Communications requires a Supabase database.');
  return db;
}

function result(response) {
  if (response.error) throw response.error;
  return response.data;
}

function applyCursor(query, timestampColumn, cursor) {
  if (!cursor) return query;
  return query.or(`${timestampColumn}.lt.${cursor.timestamp},and(${timestampColumn}.eq.${cursor.timestamp},id.lt.${cursor.id})`);
}

export async function getActiveEmployeeActor(userId) {
  return result(await client().from('users').select('id,role,status,portal_owner_user_id')
    .eq('id', userId).eq('role', 'employee').eq('status', 'active').maybeSingle());
}

export async function getActiveClientActor(userId) {
  return result(await client().from('users').select('id,role,status')
    .eq('id', userId).eq('role', 'client').eq('status', 'active').maybeSingle());
}

export async function listActiveClientMemberships(userId) {
  return result(await client().from('client_portal_memberships').select('id,crm_client_id,user_id')
    .eq('user_id', userId).eq('status', 'active').limit(2)) || [];
}

export async function getClientOwner(clientId) {
  return result(await client().from('crm_clients').select('owner_user_id').eq('id', clientId).maybeSingle());
}

export async function syncActorParticipants(actorUserId, ownerUserId) {
  return result(await client().rpc('communication_sync_actor_participants', {
    p_actor_user_id: actorUserId, p_owner_user_id: ownerUserId,
  }));
}

export async function listThreads(ownerUserId, actorUserId, options) {
  const memberships = result(await client().from('communication_participants').select(PARTICIPANT_FIELDS)
    .eq('owner_user_id', ownerUserId).eq('user_id', actorUserId).eq('status', 'active')) || [];
  let threadIds = memberships.map((membership) => membership.thread_id);
  if (!threadIds.length) return { rows: [], memberships: new Map(), hasNextPage: false };

  if (options.view === 'sent') {
    const sent = result(await client().from('communication_messages').select('thread_id')
      .eq('owner_user_id', ownerUserId).eq('sender_user_id', actorUserId).in('thread_id', threadIds)) || [];
    const sentIds = new Set(sent.map((message) => message.thread_id));
    threadIds = threadIds.filter((threadId) => sentIds.has(threadId));
    if (!threadIds.length) return { rows: [], memberships: new Map(), hasNextPage: false };
  }

  let query = client().from('communication_threads').select(THREAD_FIELDS)
    .eq('owner_user_id', ownerUserId).in('id', threadIds);
  query = applyCursor(query, 'last_message_at', options.cursor);
  const rows = result(await query.order('last_message_at', { ascending: false }).order('id', { ascending: false }).limit(options.limit + 1)) || [];
  const page = rows.slice(0, options.limit);
  const membershipByThread = new Map(memberships.map((membership) => [membership.thread_id, membership]));
  return { rows: page, memberships: membershipByThread, hasNextPage: rows.length > options.limit };
}

export async function getThread(ownerUserId, threadId) {
  return result(await client().from('communication_threads').select(THREAD_FIELDS)
    .eq('owner_user_id', ownerUserId).eq('id', threadId).maybeSingle());
}

export async function getActiveParticipant(ownerUserId, threadId, actorUserId) {
  return result(await client().from('communication_participants').select(PARTICIPANT_FIELDS)
    .eq('owner_user_id', ownerUserId).eq('thread_id', threadId).eq('user_id', actorUserId)
    .eq('status', 'active').maybeSingle());
}

export async function listThreadParticipants(ownerUserId, threadIds) {
  if (!threadIds.length) return [];
  return result(await client().from('communication_participants').select(PARTICIPANT_FIELDS)
    .eq('owner_user_id', ownerUserId).in('thread_id', threadIds).order('joined_at', { ascending: true })) || [];
}

export async function listSafeUsers(userIds) {
  if (!userIds.length) return [];
  return result(await client().from('users').select('id,full_name').in('id', userIds)) || [];
}

export async function listLatestMessages(ownerUserId, threadIds) {
  const rows = await Promise.all(threadIds.map(async (threadId) => result(await client().from('communication_messages').select(MESSAGE_FIELDS)
    .eq('owner_user_id', ownerUserId).eq('thread_id', threadId)
    .order('sequence', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle())));
  return rows.filter(Boolean);
}

export async function listMessages(ownerUserId, threadId, options) {
  let query = client().from('communication_messages').select(MESSAGE_FIELDS)
    .eq('owner_user_id', ownerUserId).eq('thread_id', threadId);
  if (options.beforeSequence !== null) query = query.lt('sequence', options.beforeSequence);
  const rows = result(await query.order('sequence', { ascending: false }).order('id', { ascending: false }).limit(options.limit + 1)) || [];
  return { rows: rows.slice(0, options.limit), hasNextPage: rows.length > options.limit };
}

export async function listAttachments(ownerUserId, threadId, messageIds) {
  if (!messageIds.length) return [];
  return result(await client().from('communication_attachments').select(ATTACHMENT_FIELDS)
    .eq('owner_user_id', ownerUserId).eq('thread_id', threadId).in('message_id', messageIds)
    .order('created_at', { ascending: true })) || [];
}

export async function getAttachment(ownerUserId, threadId, attachmentId) {
  return result(await client().from('communication_attachments')
    .select('id,message_id,storage_path,display_filename,media_type,size_bytes')
    .eq('owner_user_id', ownerUserId).eq('thread_id', threadId).eq('id', attachmentId).maybeSingle());
}

export async function createAttachmentDownload(storagePath, filename) {
  const signed = result(await client().storage.from('communication-private').createSignedUrl(storagePath, 60, { download: filename }));
  return signed?.signedUrl ? signed : null;
}

export async function findMessageByIdempotency(ownerUserId, threadId, senderUserId, idempotencyKey) {
  return result(await client().from('communication_messages').select('id,sequence,request_sha256')
    .eq('owner_user_id', ownerUserId).eq('thread_id', threadId).eq('sender_user_id', senderUserId)
    .eq('idempotency_key', idempotencyKey).maybeSingle());
}

export async function uploadAttachment(storagePath, file) {
  const response = await client().storage.from('communication-private').upload(storagePath, file.buffer, {
    contentType: file.mediaType, upsert: false,
  });
  if (!response.error) return { created: true, path: storagePath };
  if (/already exists|duplicate/i.test(response.error.message || '')) return { created: false, path: storagePath };
  throw response.error;
}

export async function removeAttachments(paths) {
  if (!paths.length) return;
  const { error } = await client().storage.from('communication-private').remove(paths);
  if (error) throw error;
}

export async function listAttachmentPaths(ownerUserId, threadId, messageId) {
  const rows = result(await client().from('communication_attachments').select('storage_path')
    .eq('owner_user_id', ownerUserId).eq('thread_id', threadId).eq('message_id', messageId)) || [];
  return rows.map((row) => row.storage_path);
}

export async function createThread(actorUserId, ownerUserId, values) {
  return result(await client().rpc('communication_create_thread', {
    p_actor_user_id: actorUserId,
    p_owner_user_id: ownerUserId,
    p_subject: values.subject,
    p_participants: values.participants,
    p_initial_body: values.body,
    p_idempotency_key: values.idempotencyKey,
    p_request_sha256: values.requestHash,
  }));
}

export async function sendMessage(actorUserId, ownerUserId, threadId, values) {
  return result(await client().rpc('communication_send_message', {
    p_actor_user_id: actorUserId,
    p_owner_user_id: ownerUserId,
    p_thread_id: threadId,
    p_body: values.body,
    p_idempotency_key: values.idempotencyKey,
    p_request_sha256: values.requestHash,
    p_attachment_metadata: values.attachments,
  }));
}

export async function markRead(actorUserId, ownerUserId, threadId, sequence) {
  return result(await client().rpc('communication_mark_read', {
    p_actor_user_id: actorUserId, p_owner_user_id: ownerUserId, p_thread_id: threadId, p_sequence: sequence,
  }));
}

export async function listNotifications(ownerUserId, actorUserId, options) {
  let query = client().from('communication_notifications').select(NOTIFICATION_FIELDS)
    .eq('owner_user_id', ownerUserId).eq('recipient_user_id', actorUserId);
  if (options.state) query = query.eq('state', options.state);
  query = applyCursor(query, 'created_at', options.cursor);
  const rows = result(await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(options.limit + 1)) || [];
  return { rows: rows.slice(0, options.limit), hasNextPage: rows.length > options.limit };
}

export async function setNotificationState(actorUserId, ownerUserId, notificationId, state) {
  return result(await client().rpc('communication_set_notification_state', {
    p_actor_user_id: actorUserId, p_owner_user_id: ownerUserId, p_notification_id: notificationId, p_state: state,
  }));
}

export async function getPreferences(ownerUserId, actorUserId) {
  return result(await client().from('communication_preferences').select('in_app_enabled,email_enabled')
    .eq('owner_user_id', ownerUserId).eq('user_id', actorUserId).maybeSingle());
}

export async function upsertPreferences(actorUserId, ownerUserId, values) {
  return result(await client().rpc('communication_upsert_preferences', {
    p_actor_user_id: actorUserId, p_owner_user_id: ownerUserId,
    p_in_app_enabled: values.inAppEnabled, p_email_enabled: values.emailEnabled,
  }));
}

export async function recordDeliveryEvent(values) {
  return result(await client().rpc('communication_record_delivery_event', {
    p_provider: values.provider,
    p_provider_event_id: values.providerEventId,
    p_provider_message_id: values.providerMessageId,
    p_event_type: values.eventType,
    p_payload_sha256: values.payloadSha256,
    p_occurred_at: values.occurredAt,
    p_safe_metadata: {},
  }));
}
