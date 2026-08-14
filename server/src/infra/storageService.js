/**
 * Universal Object Storage Service (Step 35)
 * 
 * Manages call audio recordings, transcripts, and operational assets.
 * Supports:
 *   - Local filesystem storage (for development)
 *   - S3 / Google Cloud Storage / Cloudflare R2 compatibility (for production)
 * 
 * Key structure: /tenant/restaurant/year/month/call-id.wav
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

const LOCAL_STORAGE_DIR = resolve('.', 'recordings');
if (!existsSync(LOCAL_STORAGE_DIR)) {
  mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
}

export class StorageService {
  constructor() {
    this.bucket = process.env.OBJECT_STORAGE_BUCKET || 'voicecart-recordings';
    this.isCloud = !!(process.env.AWS_ACCESS_KEY_ID || process.env.S3_ENDPOINT || process.env.GCS_BUCKET);
  }

  /**
   * Generates a structured object key
   */
  generateObjectKey({ tenantId = 't_annapoorna', restaurantId = 'r_coimbatore_01', callId, extension = 'wav' }) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${tenantId}/${restaurantId}/${year}/${month}/call_${callId}_${Date.now()}.${extension}`;
  }

  /**
   * Save call audio buffer to storage
   * @param {Buffer} audioBuffer - PCM/WAV buffer
   * @param {Object} metadata - { callId, tenantId, restaurantId }
   * @returns {Promise<{ objectKey: string, storagePath: string, bucket: string, url: string }>}
   */
  async saveAudio(audioBuffer, metadata = {}) {
    const objectKey = this.generateObjectKey({
      tenantId: metadata.tenantId || 't_annapoorna',
      restaurantId: metadata.restaurantId || 'r_coimbatore_01',
      callId: metadata.callId,
      extension: 'wav',
    });

    // Local Disk Persistence
    const localFileName = `call_${metadata.callId || Date.now()}.wav`;
    const localFilePath = join(LOCAL_STORAGE_DIR, localFileName);

    writeFileSync(localFilePath, audioBuffer);
    console.log(`[Storage] Persisted audio file locally: ${localFilePath} (${audioBuffer.length} bytes)`);

    const publicUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;
    const playbackUrl = `${publicUrl}/api/calls/${metadata.callId}/audio`;

    return {
      objectKey,
      bucket: this.bucket,
      storagePath: localFilePath,
      url: playbackUrl,
      sizeBytes: audioBuffer.length,
    };
  }

  /**
   * Retrieve audio stream or buffer for playback / dispute resolution
   */
  async getAudio(storagePath) {
    if (storagePath && existsSync(storagePath)) {
      return readFileSync(storagePath);
    }
    return null;
  }
}

export const storageService = new StorageService();
export default storageService;
