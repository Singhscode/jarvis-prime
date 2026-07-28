import pg from 'pg';
import { hashPassword, isValidEmailFormat, normalizeEmail } from './crypto.js';
import { validatePasswordStrength } from './auth-service.js';
import * as authRepository from './repository.js';
import * as ownerRepository from '../owner-workspace/owner-workspace.repository.js';

const { Client } = pg;
const BOOTSTRAP_EVENT = 'owner.bootstrap_completed';

export class OwnerBootstrapError extends Error {
  constructor(code, message = code, options = {}) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class OwnerAlreadyExistsError extends OwnerBootstrapError {
  constructor() { super('ALREADY_BOOTSTRAPPED'); }
}

export class EmailAlreadyExistsError extends OwnerBootstrapError {
  constructor() { super('EMAIL_ALREADY_EXISTS'); }
}

export class ProjectMismatchError extends OwnerBootstrapError {
  constructor() { super('TARGET_MISMATCH'); }
}

export class ValidationError extends OwnerBootstrapError {
  constructor(code) { super(code); }
}

export class OwnerAssertionError extends OwnerBootstrapError {
  constructor() { super('OWNER_ASSERTION_FAILED'); }
}

function safePgErrorCode(error) {
  return typeof error?.code === 'string' && /^[0-9A-Z_]{2,64}$/.test(error.code)
    ? error.code
    : null;
}

function safeErrorIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value)
    ? value
    : null;
}

function safeErrno(error) {
  if (Number.isSafeInteger(error?.errno)) return error.errno;
  return typeof error?.errno === 'string' && /^[0-9A-Z_]{2,64}$/.test(error.errno)
    ? error.errno
    : null;
}

function safeSyscall(error) {
  return typeof error?.syscall === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(error.syscall)
    ? error.syscall
    : null;
}

function postgresSqlState(error) {
  const code = safePgErrorCode(error);
  return code && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

const CONNECT_ERROR_CODES = Object.freeze({
  '28P01': '28P01',
  ERR_TLS_CERT_ALTNAME_INVALID: 'TLS_HOSTNAME',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'SELF_SIGNED_CERT',
  SELF_SIGNED_CERT_IN_CHAIN: 'SELF_SIGNED_CERT',
  CERT_HAS_EXPIRED: 'CERT_HAS_EXPIRED',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  UNABLE_TO_GET_ISSUER_CERT: 'TLS_CERTIFICATE_CHAIN',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'TLS_CERTIFICATE_CHAIN',
  ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED: 'TLS_CERTIFICATE_CHAIN',
  ECONNREFUSED: 'ECONNREFUSED',
  ENOTFOUND: 'ENOTFOUND',
  EAI_AGAIN: 'ENOTFOUND',
  ETIMEDOUT: 'ETIMEDOUT',
  ERR_SOCKET_CONNECTION_TIMEOUT: 'ETIMEDOUT',
  ECONNRESET: 'ECONNRESET',
});

function stableConnectErrorCode(error) {
  const code = safePgErrorCode(error);
  const errno = safeErrno(error);
  const sourceCode = code || (typeof errno === 'string' ? errno : null);
  return CONNECT_ERROR_CODES[sourceCode] || 'UNKNOWN_CONNECT_ERROR';
}

export class CommitOutcomeUnknownError extends OwnerBootstrapError {
  constructor({ stage, error, commitError, rollbackStatus = 'not_started' }) {
    super('COMMIT_OUTCOME_UNKNOWN');
    this.operation = stage;
    this.stage = stage;
    this.sqlState = postgresSqlState(error) || postgresSqlState(commitError);
    this.commitSqlState = postgresSqlState(commitError);
    this.rollbackStatus = rollbackStatus;
  }
}

export class TransactionError extends OwnerBootstrapError {
  constructor(code, operation, error, rollbackStatus = 'not_started') {
    super(code);
    this.operation = operation;
    this.stage = operation;
    this.sqlState = postgresSqlState(error);
    this.rollbackStatus = rollbackStatus;
  }
}

async function connectInitialClient(client) {
  try {
    await client.connect();
  } catch (error) {
    const wrapped = new TransactionError(stableConnectErrorCode(error), 'connect', error);
    wrapped.pgErrorCode = safePgErrorCode(error);
    wrapped.errorClass = safeErrorIdentifier(error?.constructor?.name);
    wrapped.errorName = safeErrorIdentifier(error?.name);
    wrapped.errno = safeErrno(error);
    wrapped.syscall = safeSyscall(error);
    throw wrapped;
  }
}

async function cleanupAttempt(action) {
  try {
    await Promise.resolve().then(action);
    return true;
  } catch {
    return false;
  }
}

async function transactionOperation(code, operation, action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof OwnerBootstrapError) throw error;
    throw new TransactionError(code, operation, error);
  }
}

function validateInput({ fullName, email, password }) {
  if (typeof fullName !== 'string' || !fullName.trim()) {
    throw new ValidationError('VALIDATION_FULL_NAME');
  }
  if (typeof email !== 'string' || !isValidEmailFormat(email)) {
    throw new ValidationError('VALIDATION_EMAIL');
  }
  if (typeof password !== 'string') {
    throw new ValidationError('VALIDATION_PASSWORD_TYPE');
  }
  const strength = validatePasswordStrength(password);
  if (!strength.valid) throw new ValidationError(strength.code);
}

function isExactBootstrapMarker(marker, ownerId, auditId) {
  return Boolean(marker
    && marker.id === auditId
    && marker.user_id === ownerId
    && marker.resource_id === ownerId
    && marker.event_type === BOOTSTRAP_EVENT
    && marker.action === 'create'
    && marker.resource_type === 'user'
    && marker.success === true
    && marker.details?.source === 'owner:bootstrap'
    && marker.details?.version === 1);
}

export class OwnerBootstrapService {
  constructor({
    connectionConfig,
    clientFactory = (options) => new Client(options),
    users = authRepository,
    owners = ownerRepository,
  }) {
    if (!connectionConfig || typeof connectionConfig !== 'object') {
      throw new ValidationError('VALIDATION_CONNECTION_CONFIG');
    }
    this.connectionConfig = connectionConfig;
    this.clientFactory = clientFactory;
    this.users = users;
    this.owners = owners;
  }

  async reconcileCommit(ownerId, auditId, commitError) {
    let database;
    let transactionStarted = false;
    let rollbackStatus = 'not_started';
    let stage = 'reconciliation_client_create';
    let reconciliationError = null;

    try {
      database = this.clientFactory(this.connectionConfig);
      stage = 'reconciliation_connect';
      await database.connect();
      stage = 'reconciliation_begin';
      await database.query('begin isolation level repeatable read');
      transactionStarted = true;
      stage = 'reconciliation_marker_lookup';
      const marker = await this.users.findOwnerBootstrapAuditForUpdate(database);
      stage = 'reconciliation_authorization';
      const authorized = await this.owners
        .isAuthorizedOwnerWorkspaceUserInTransaction(database, ownerId);
      stage = 'reconciliation_owner_lookup';
      const finalOwners = await this.owners
        .findAuthorizedOwnerWorkspaceUsersForUpdate(database, 2);
      stage = 'reconciliation_assertion';
      const committed = isExactBootstrapMarker(marker, ownerId, auditId)
        && authorized && finalOwners.length === 1 && finalOwners[0].id === ownerId;
      if (!committed) throw new Error('reconciliation assertion failed');

      stage = 'reconciliation_rollback';
      try {
        await database.query('rollback');
        rollbackStatus = 'completed';
      } catch (error) {
        rollbackStatus = 'failed';
        throw error;
      } finally {
        transactionStarted = false;
      }
      return { ownerId, auditId };
    } catch (error) {
      reconciliationError = error;
    } finally {
      if (transactionStarted) {
        rollbackStatus = await cleanupAttempt(() => database.query('rollback'))
          ? 'completed'
          : 'failed';
        transactionStarted = false;
      }
      if (database) await cleanupAttempt(() => database.end());
    }

    throw new CommitOutcomeUnknownError({
      stage,
      error: reconciliationError,
      commitError,
      rollbackStatus,
    });
  }

  async bootstrap({ fullName, email, password }) {
    let failedStage = 'CONNECT';
    try {
      validateInput({ fullName, email, password });
    } catch (error) {
      error.failedStage = 'VALIDATION';
      throw error;
    }
    const normalizedEmail = normalizeEmail(email);
    let passwordHash;
    try {
      passwordHash = await hashPassword(password);
    } catch {
      const error = new OwnerBootstrapError('PASSWORD_HASH_FAILED');
      error.failedStage = 'VALIDATION';
      throw error;
    }

    let database;
    try {
      database = this.clientFactory(this.connectionConfig);
    } catch (error) {
      const wrapped = new TransactionError(
        'TRANSACTION_CLIENT_CREATE_FAILED',
        'client_create',
        error
      );
      wrapped.failedStage = failedStage;
      throw wrapped;
    }

    let transactionStarted = false;
    let databaseEnded = false;
    const closeDatabase = async () => {
      if (databaseEnded) return;
      databaseEnded = true;
      await cleanupAttempt(() => database.end());
    };

    try {
      failedStage = 'CONNECT';
      await connectInitialClient(database);
      failedStage = 'BEGIN';
      await transactionOperation(
        'TRANSACTION_BEGIN_FAILED',
        'begin',
        () => database.query('begin')
      );
      transactionStarted = true;
      failedStage = 'SET_LOCK_TIMEOUT';
      await transactionOperation(
        'TRANSACTION_LOCK_TIMEOUT_CONFIG_FAILED',
        'lock_timeout_config',
        () => database.query("set local lock_timeout = '5s'")
      );
      failedStage = 'SET_STATEMENT_TIMEOUT';
      await transactionOperation(
        'TRANSACTION_STATEMENT_TIMEOUT_CONFIG_FAILED',
        'statement_timeout_config',
        () => database.query("set local statement_timeout = '60s'")
      );
      failedStage = 'ADVISORY_LOCK';
      await transactionOperation(
        'TRANSACTION_ADVISORY_LOCK_FAILED',
        'advisory_lock',
        () => database.query(
          'select pg_advisory_xact_lock(hashtextextended($1, 0))',
          ['jarvis-prime.initial-owner-bootstrap']
        )
      );
      failedStage = 'LOCK_USERS';
      await transactionOperation(
        'TRANSACTION_TABLE_LOCK_FAILED',
        'table_lock',
        () => database.query(`lock table public.users, public.audit_logs
          in share row exclusive mode`)
      );
      failedStage = 'LOCK_CLIENT_PORTAL_MEMBERSHIPS';
      await transactionOperation(
        'TRANSACTION_TABLE_LOCK_FAILED',
        'table_lock',
        () => database.query(`lock table public.client_portal_memberships
          in share row exclusive mode`)
      );

      failedStage = 'CHECK_EXISTING_OWNER';
      const existingMarker = await transactionOperation(
        'TRANSACTION_MARKER_LOOKUP_FAILED',
        'marker_lookup',
        () => this.users.findOwnerBootstrapAuditForUpdate(database)
      );
      if (existingMarker) throw new OwnerAlreadyExistsError();

      failedStage = 'CHECK_EXISTING_OWNER';
      const existingOwners = await transactionOperation(
        'TRANSACTION_OWNER_LOOKUP_FAILED',
        'owner_lookup',
        () => this.owners.findAuthorizedOwnerWorkspaceUsersForUpdate(database, 2)
      );
      if (existingOwners.length > 0) throw new OwnerAlreadyExistsError();

      failedStage = 'CHECK_EMAIL';
      const existingUser = await transactionOperation(
        'TRANSACTION_EMAIL_LOOKUP_FAILED',
        'email_lookup',
        () => this.users.findUserByNormalizedEmailForUpdate(database, normalizedEmail)
      );
      if (existingUser) throw new EmailAlreadyExistsError();

      let owner;
      failedStage = 'INSERT_OWNER';
      try {
        owner = await this.users.createInitialOwner(database, {
          email: normalizedEmail,
          full_name: fullName.trim(),
          password_hash: passwordHash,
        });
      } catch (error) {
        if (postgresSqlState(error) === '23505') throw new EmailAlreadyExistsError();
        throw new TransactionError(
          'TRANSACTION_USER_INSERT_FAILED',
          'user_insert',
          error
        );
      }

      failedStage = 'INSERT_AUDIT';
      const audit = await transactionOperation(
        'TRANSACTION_AUDIT_INSERT_FAILED',
        'audit_insert',
        () => this.users.createAuditLog({
          user_id: owner.id,
          event_type: BOOTSTRAP_EVENT,
          action: 'create',
          resource_type: 'user',
          resource_id: owner.id,
          success: true,
          details: { source: 'owner:bootstrap', version: 1 },
        }, database)
      );

      failedStage = 'VERIFY_OWNER';
      const authorized = await transactionOperation(
        'TRANSACTION_FINAL_AUTHORIZATION_FAILED',
        'final_authorization',
        () => this.owners.isAuthorizedOwnerWorkspaceUserInTransaction(database, owner.id)
      );
      failedStage = 'VERIFY_OWNER';
      const finalOwners = await transactionOperation(
        'TRANSACTION_FINAL_OWNER_LOOKUP_FAILED',
        'final_owner_lookup',
        () => this.owners.findAuthorizedOwnerWorkspaceUsersForUpdate(database, 2)
      );
      failedStage = 'VERIFY_OWNER';
      const finalMarker = await transactionOperation(
        'TRANSACTION_FINAL_MARKER_LOOKUP_FAILED',
        'final_marker_lookup',
        () => this.users.findOwnerBootstrapAuditForUpdate(database)
      );
      if (!authorized || finalOwners.length !== 1 || finalOwners[0].id !== owner.id
        || !isExactBootstrapMarker(finalMarker, owner.id, audit.id)) {
        throw new OwnerAssertionError();
      }

      failedStage = 'COMMIT';
      try {
        await database.query('commit');
        transactionStarted = false;
      } catch (error) {
        transactionStarted = false;
        await closeDatabase();
        failedStage = 'POST_COMMIT_RECONCILIATION';
        return await this.reconcileCommit(owner.id, audit.id, error);
      }
      return { ownerId: owner.id, auditId: audit.id };
    } catch (error) {
      let rollbackStatus = 'not_started';
      if (transactionStarted) {
        rollbackStatus = await cleanupAttempt(() => database.query('rollback'))
          ? 'completed'
          : 'failed';
        transactionStarted = false;
      }
      if (error instanceof TransactionError) {
        error.rollbackStatus = rollbackStatus;
        error.failedStage ||= failedStage;
        throw error;
      }
      if (error instanceof OwnerBootstrapError) {
        error.failedStage ||= failedStage;
        throw error;
      }
      const wrapped = new TransactionError(
        'TRANSACTION_FINALIZATION_FAILED',
        'finalization',
        error,
        rollbackStatus
      );
      wrapped.failedStage = failedStage;
      throw wrapped;
    } finally {
      await closeDatabase();
    }
  }
}
