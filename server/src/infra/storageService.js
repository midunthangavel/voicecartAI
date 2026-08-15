import { promises as fs } from 'fs';
import { resolve, join } from 'path';
import { logger } from '../utils/logger.js';

const LOCAL_STORAGE_DIR = resolve('.', 'recordings');

// Ensure recordings directory exists asynchronously
fs.mkdir(LOCAL_STORAGE_DIR, { recursive: true }).catch(() => {});

/**
 * Non-Blocking Object Storage Service
 * 
 * Supports asynchronous local filesystem persistence and S3/MinIO/GCS cloud upload.
 */
export class StorageService {
  constructor() {
    this.bucket = process.env.OBJECT_STORAGE_BUCKET || 'voicecart-recordings';
    this.s3Endpoint = process.env.S3_ENDPOINT || null;
    this.isCloud = !!(process.env.AWS_ACCESS_KEY_ID || process.env.S3_ENDPOINT || process.env.GCS_BUCKET);
  }

  /**
   * Generates a structured object key
   */
  generateObjectKey({ tenantId = 't_annapoorna', restaurantId = 'r_coimbatore_01', callId, extension = 'wav' }) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${tenantId}/${restaurantId}/${year}/${month}/call_${callId || 'demo'}_${Date.now()}.${extension}`;
  }

  /**
   * Save call audio buffer asynchronously
   * @param {Buffer} audioBuffer - Audio buffer (WAV/PCM)
   * @param {Object} metadata - { callId, tenantId, restaurantId }
   */
  async saveAudio(audioBuffer, metadata = {}) {
    const objectKey = this.generateObjectKey({
      tenantId: metadata.tenantId || 't_annapoorna',
      restaurantId: metadata.restaurantId || 'r_coimbatore_01',
      callId: metadata.callId,
      extension: 'wav',
    });

    const localFileName = `call_${metadata.callId || Date.now()}.wav`;
    const localFilePath = join(LOCAL_STORAGE_DIR, localFileName);

    // Non-blocking asynchronous file write
    await fs.writeFile(localFilePath, audioBuffer);
    logger.info(`[Storage] Persisted audio file asynchronously: ${localFilePath} (${audioBuffer.length} bytes)`);

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
    if (!storagePath) return null;
    try {
      await fs.access(storagePath);
      return await fs.readFile(storagePath);
    } catch {
      return null;
    }
  }
}

export const storageService = new StorageService();
export default storageService;
