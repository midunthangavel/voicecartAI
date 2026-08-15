import { existsSync, mkdirSync, statSync } from 'fs';
import { resolve as pathResolve } from 'path';
import { dbGet, dbRun } from '../db.js';
import { logger } from '../utils/logger.js';

/**
 * Automated Disaster Recovery & Snapshot Backup Service
 */

export async function createDatabaseBackup() {
  const backupsDir = pathResolve('./backups');
  if (!existsSync(backupsDir)) {
    mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `voicecart_backup_${timestamp}.db`;
  const backupPath = pathResolve(backupsDir, backupFileName);

  logger.info(`[Backup] Initiating point-in-time snapshot backup to ${backupPath}...`);

  try {
    // 1. Flush SQLite WAL journal
    await dbRun('PRAGMA wal_checkpoint(TRUNCATE);');

    // 2. Perform SQLite online backup using VACUUM INTO
    await dbRun(`VACUUM INTO '${backupPath.replace(/\\/g, '/')}';`);

    // 3. Verify integrity
    const integrityCheck = await dbGet('PRAGMA integrity_check;');
    const isIntegrityOk = integrityCheck && (Object.values(integrityCheck)[0] === 'ok');

    const stats = statSync(backupPath);

    logger.info(`[Backup] Snapshot backup completed successfully (${stats.size} bytes). Integrity: ${isIntegrityOk ? 'OK' : 'FAIL'}`);

    return {
      success: true,
      backupPath,
      backupFileName,
      sizeBytes: stats.size,
      integrity: isIntegrityOk ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    logger.error('[Backup] Backup failed:', err);
    throw new Error(`Backup failed: ${err.message}`);
  }
}
