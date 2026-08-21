import { getAllFeatureFlags, setFeatureFlag } from '../services/featureFlag.service.js';
import { createDatabaseBackup } from '../services/backup.service.js';
import { getSloMetrics } from '../services/sloTracker.js';
import { getTenantDailyAiSpend } from '../services/aiCostTracker.js';
import { verifyAuditChain } from '../services/audit.service.js';
import { fetchPendingOutboxEvents } from '../services/outbox.service.js';

/**
 * Controller for Enterprise Architecture & Governance
 * Strictly scoped by authenticated user tenant and restaurant.
 */

export async function getFeatureFlags(req, res, next) {
  try {
    const { tenantId } = req.tenant;
    const flags = await getAllFeatureFlags(tenantId);
    res.json(flags);
  } catch (err) {
    next(err);
  }
}

export async function updateFeatureFlag(req, res, next) {
  try {
    const { tenantId } = req.tenant;
    const { flagKey, enabled, description } = req.body;
    await setFeatureFlag(flagKey, enabled, tenantId, description);
    res.json({ success: true, flagKey, enabled });
  } catch (err) {
    next(err);
  }
}

export async function triggerBackup(req, res, next) {
  try {
    const result = await createDatabaseBackup();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getSloReport(req, res, next) {
  try {
    const { tenantId } = req.tenant;
    const report = await getSloMetrics(tenantId);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

export async function getAiCostReport(req, res, next) {
  try {
    const { tenantId } = req.tenant;
    const spend = await getTenantDailyAiSpend(tenantId);
    res.json(spend);
  } catch (err) {
    next(err);
  }
}

export async function getAuditVerification(req, res, next) {
  try {
    const { restaurantId } = req.tenant;
    const verification = await verifyAuditChain(restaurantId);
    res.json(verification);
  } catch (err) {
    next(err);
  }
}

export async function getOutboxStatus(req, res, next) {
  try {
    const events = await fetchPendingOutboxEvents(50);
    res.json({ pendingCount: events.length, events });
  } catch (err) {
    next(err);
  }
}
