import { promises as fs } from 'fs';
import { resolve, join } from 'path';
import { logger } from '../utils/logger.js';

const LOCAL_STORAGE_DIR = resolve('.', 'recordings');

// Ensure recordings directory exists asynchronously
fs.mkdir(LOCAL_STORAGE_DIR, { recursive: true }).catch(() => {});

/**
 * Non-Blocking Cloud & Local Object Storage Service
 * 
 * Supports asynchronous local filesystem persistence and S3/MinIO/R2 cloud storage.
 */
export class StorageService {
  constructor() {
    this.bucket = process.env.OBJECT_STORAGE_BUCKET || 'voicecart-recordings';
    this.s3Endpoint = process.env.S3_ENDPOINT || null;
    this.isCloud = !!(process.env.AWS_ACCESS_KEY_ID || process.env.S3_ENDPOINT || process.env.GCS_BUCKET);
  }

  /**
   * Generates a structured multi-tenant object key
   */
  generateObjectKey({ tenantId, restaurantId, callId, extension = 'wav' }) {
    if (!tenantId || !restaurantId) {
      throw new Error('[StorageService] Explicit tenantId and restaurantId are required to generate storage key');
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${tenantId}/${restaurantId}/${year}/${month}/call_${callId || 'call'}_${Date.now()}.${extension}`;
  }

  /**
   * Save call audio buffer asynchronously with multi-tenant directory scoping
   * @param {Buffer} audioBuffer - Audio buffer (WAV/PCM)
   * @param {Object} metadata - { callId, tenantId, restaurantId }
   */
  async saveAudio(audioBuffer, metadata = {}) {
    if (!metadata.tenantId || !metadata.restaurantId) {
      throw new Error('[StorageService] Explicit tenantId and restaurantId are required to persist audio');
    }

    const objectKey = this.generateObjectKey({
      tenantId: metadata.tenantId,
      restaurantId: metadata.restaurantId,
      callId: metadata.callId,
      extension: 'wav',
    });

    const tenantDir = join(LOCAL_STORAGE_DIR, metadata.tenantId, metadata.restaurantId);
    await fs.mkdir(tenantDir, { recursive: true });

    const localFileName = `call_${metadata.callId || Date.now()}.wav`;
    const localFilePath = join(tenantDir, localFileName);

    // Non-blocking asynchronous file write
    await fs.writeFile(localFilePath, audioBuffer);
    logger.info(`[Storage] Persisted audio file asynchronously: ${localFilePath} (${audioBuffer.length} bytes)`);

    // If Cloud S3/R2/MinIO endpoint is configured, upload via HTTP PUT
    if (this.isCloud && this.s3Endpoint) {
      try {
        const cloudUrl = `${this.s3Endpoint.replace(/\/$/, '')}/${this.bucket}/${objectKey}`;
        await fetch(cloudUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'audio/wav',
            'Content-Length': String(audioBuffer.length),
          },
          body: audioBuffer,
        });
        logger.info(`[Storage] Cloud S3 object stored successfully: ${cloudUrl}`);
      } catch (err) {
        logger.warn(`[Storage] Cloud S3 upload failed, retained on disk:`, err.message);
      }
    }

    const publicUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;
    const playbackUrl = `${publicUrl}/api/v1/calls/${metadata.callId || '1'}/audio`;

    return {
      objectKey,
      bucket: this.bucket,
      storagePath: localFilePath,
      url: playbackUrl,
      sizeBytes: audioBuffer.length,
    };
  }

  /**
   * Retrieve audio buffer asynchronously
   */
  async getAudio(storagePath) {
    try {
      return await fs.readFile(storagePath);
    } catch (err) {
      logger.error(`[Storage] Failed to read audio at ${storagePath}:`, err.message);
      return null;
    }
  }

  /**
   * Delete audio asynchronously
   */
  async deleteAudio(storagePath) {
    try {
      await fs.unlink(storagePath);
      return true;
    } catch {
      return false;
    }
  }
}

export const storageService = new StorageService();
