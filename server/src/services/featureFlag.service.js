import { dbGet, dbRun, dbAll } from '../db.js';

/**
 * Dynamic Runtime Feature Flag Engine
 * 
 * Enables safe gradual rollouts, canary features, and tenant-level feature toggles.
 */

export async function isFeatureEnabled(flagKey, tenantId = 'global') {
  // 1. Check tenant-specific override
  if (tenantId && tenantId !== 'global') {
    const tenantFlag = await dbGet(
      'SELECT enabled FROM feature_flags WHERE tenant_id = ? AND flag_key = ?',
      [tenantId, flagKey]
    );
    if (tenantFlag) return Boolean(tenantFlag.enabled);
  }

  // 2. Check global setting
  const globalFlag = await dbGet(
    'SELECT enabled FROM feature_flags WHERE tenant_id = "global" AND flag_key = ?',
    [flagKey]
  );
  if (globalFlag) return Boolean(globalFlag.enabled);

  // Default to enabled for unconfigured keys
  return true;
}

export async function setFeatureFlag(flagKey, enabled, tenantId = 'global', description = '') {
  return dbRun(
    `INSERT INTO feature_flags (tenant_id, flag_key, enabled, description)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(tenant_id, flag_key) DO UPDATE SET enabled = excluded.enabled, description = excluded.description`,
    [tenantId, flagKey, enabled ? 1 : 0, description]
  );
}

export async function getAllFeatureFlags(tenantId = 'global') {
  return dbAll(
    'SELECT * FROM feature_flags WHERE tenant_id IN ("global", ?) ORDER BY flag_key ASC',
    [tenantId]
  );
}
