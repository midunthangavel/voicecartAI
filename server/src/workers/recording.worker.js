import { recordingQueue } from '../queue/queueManager.js';
import { saveCallRecording } from '../db.js';
import { storageService } from '../infra/storageService.js';

/**
 * Recording Background Worker
 * Handles saving accumulated PCM audio buffers to storage and recording dispute metadata.
 */

recordingQueue.process('PERSIST_CALL_AUDIO', async (data) => {
  const { callId, callSid, audioChunksBase64, tenantId = 't_annapoorna', restaurantId = 'r_coimbatore_01' } = data;

  if (!audioChunksBase64 || audioChunksBase64.length === 0) {
    return { skipped: true, reason: 'No audio chunks captured' };
  }

  console.log(`[Worker:Recording] Encoding call recording for Call ID ${callId}...`);

  const buffers = audioChunksBase64.map(b => Buffer.from(b, 'base64'));
  const fullAudio = Buffer.concat(buffers);

  // 8kHz, 16-bit linear PCM (2 bytes per sample)
  const durationSeconds = Math.round(fullAudio.length / (8000 * 2));

  const storageResult = await storageService.saveAudio(fullAudio, {
    callId,
    tenantId,
    restaurantId,
  });

  await saveCallRecording({
    call_id: callId,
    call_sid: callSid || `call_${callId}`,
    audio_path: storageResult.storagePath,
    duration_seconds: durationSeconds,
    dispute_status: 'none',
  });

  console.log(`[Worker:Recording] Saved recording to ${storageResult.storagePath} (${durationSeconds}s)`);
  return { success: true, callId, filePath: storageResult.storagePath, durationSeconds };
});

console.log('[Workers] Recording Worker initialized and listening for jobs.');
