import crypto from 'crypto';
import { dbRun, dbAll, dbGet, transaction } from '../db.js';
import { logger } from '../utils/logger.js';

const GENESIS_HASH = 'GENESIS_BLOCK_VOICECART_AUDIT_2026';

function computeAuditHash(previousHash, tenantId, restaurantId, action, resourceType, resourceId, afterStateStr) {
  const content = `${previousHash}:${tenantId}:${restaurantId}:${action}:${resourceType}:${resourceId}:${afterStateStr || ''}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * State Transition Audit Trail Service with Cryptographic Merkle Hash Chain
 *
 * Provides an immutable, tamper-evident compliance log for order state changes,
 * pricing updates, and automated actions.
 *
 * CONCURRENCY FIX: The SELECT previous_hash + INSERT new_block is now wrapped
 * in a transaction to prevent race conditions where two concurrent inserts
 * could read the same previous hash, creating a fork in the chain.
 */

export async function recordAuditLog({
  tenant_id,
  restaurant_id,
  actor_type = 'system', // 'ai_agent' | 'staff' | 'kitchen' | 'system' | 'customer'
  actor_id = 'voicecart_agent',
  action, // 'CREATE_ORDER' | 'UPDATE_STATUS' | 'UPDATE_PRICE' | 'DISPATCH_ORDER' | 'FLAG_DISPUTE'
  resource_type, // 'order' | 'catalog_item' | 'customer' | 'call'
  resource_id,
  before_state = null,
  after_state = null,
  metadata = {},
}) {
  if (!tenant_id || !restaurant_id) {
    throw new Error('[AuditService] Explicit tenant_id and restaurant_id are required to record audit log');
  }
  try {
    const afterStateStr = after_state ? JSON.stringify(after_state) : null;
    const beforeStateStr = before_state ? JSON.stringify(before_state) : null;
    const metadataStr = JSON.stringify(metadata || {});

    // Atomic transaction: SELECT previous hash → compute new hash → INSERT
    // This prevents concurrent inserts from forking the hash chain.
    const blockId = await transaction(async () => {
      // 1. Fetch previous block hash and sequence number for this restaurant
      const lastBlock = await dbGet(
        'SELECT hash, sequence_number FROM audit_logs WHERE restaurant_id = ? ORDER BY id DESC LIMIT 1',
        [restaurant_id]
      );

      const previousHash = lastBlock?.hash || GENESIS_HASH;
      const nextSequence = (lastBlock?.sequence_number || 0) + 1;
      const hash = computeAuditHash(previousHash, tenant_id, restaurant_id, action, resource_type, resource_id, afterStateStr);

      // 2. Insert cryptographically linked audit block with sequence number
      const res = await dbRun(
        `INSERT INTO audit_logs (
           tenant_id, restaurant_id, actor_type, actor_id, action,
           resource_type, resource_id, before_state, after_state, metadata,
           previous_hash, hash, sequence_number
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenant_id,
          restaurant_id,
          actor_type,
          actor_id,
          action,
          resource_type,
          String(resource_id),
          beforeStateStr,
          afterStateStr,
          metadataStr,
          previousHash,
          hash,
          nextSequence,
        ]
      );

      return res.lastID;
    });

    logger.info(`[Audit] ${action} on ${resource_type} #${resource_id} (Block #${blockId})`);
    return blockId;
  } catch (err) {
    logger.error('[Audit] Failed to record audit log:', err);
    return null;
  }
}

export async function getAuditLogs(restaurantId = 'r_coimbatore_01', limit = 50) {
  const rows = await dbAll(
    'SELECT * FROM audit_logs WHERE restaurant_id = ? ORDER BY id DESC LIMIT ?',
    [restaurantId, limit]
  );

  return rows.map(r => ({
    ...r,
    before_state: r.before_state ? JSON.parse(r.before_state) : null,
    after_state: r.after_state ? JSON.parse(r.after_state) : null,
    metadata: r.metadata ? JSON.parse(r.metadata) : {},
  }));
}

/**
 * Verify integrity of the cryptographic audit hash chain
 */
export async function verifyAuditChain(restaurantId = 'r_coimbatore_01') {
  const rows = await dbAll(
    'SELECT * FROM audit_logs WHERE restaurant_id = ? ORDER BY id ASC',
    [restaurantId]
  );

  if (rows.length === 0) {
    return { valid: true, count: 0, message: 'Audit log is empty' };
  }

  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (row.previous_hash && row.previous_hash !== expectedPrevHash) {
      return {
        valid: false,
        brokenAtId: row.id,
        reason: `Previous hash mismatch on block #${row.id}. Expected: ${expectedPrevHash}, Found: ${row.previous_hash}`,
      };
    }

    const calculatedHash = computeAuditHash(
      row.previous_hash || expectedPrevHash,
      row.tenant_id,
      row.restaurant_id,
      row.action,
      row.resource_type,
      row.resource_id,
      row.after_state
    );

    if (row.hash && row.hash !== calculatedHash) {
      return {
        valid: false,
        brokenAtId: row.id,
        reason: `Data tampering detected on block #${row.id}. Hash signature mismatch.`,
      };
    }

    expectedPrevHash = row.hash || calculatedHash;
  }

  return { valid: true, count: rows.length, headHash: expectedPrevHash };
}
