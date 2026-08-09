/**
 * Audio Utility Module: G.711 mu-law <-> PCM16 Audio Codec Converters
 * Telephony providers like Twilio send and expect 8kHz 8-bit mu-law audio streams.
 * Speech engines (Google STT/Gemini) work best with 16kHz or 8kHz 16-bit linear PCM.
 */

// Precomputed Mu-law decoding table
const MULAW_TO_PCM16 = new Int16Array(256);

(function initMulawTable() {
  for (let i = 0; i < 256; i++) {
    let mulaw = ~i;
    let sign = (mulaw & 0x80) ? -1 : 1;
    let exponent = (mulaw & 0x70) >> 4;
    let mantissa = mulaw & 0x0F;
    let sample = (mantissa << (exponent + 3)) + (0x84 << exponent) - 0x84;
    MULAW_TO_PCM16[i] = sign * sample;
  }
})();

/**
 * Converts 8kHz Mu-law Buffer to 16-bit Linear PCM Buffer
 * @param {Buffer} mulawBuffer 
 * @returns {Buffer} PCM16 Buffer
 */
export function mulawToPcm16(mulawBuffer) {
  const pcm16Buffer = Buffer.alloc(mulawBuffer.length * 2);
  for (let i = 0; i < mulawBuffer.length; i++) {
    const pcmVal = MULAW_TO_PCM16[mulawBuffer[i]];
    pcm16Buffer.writeInt16LE(pcmVal, i * 2);
  }
  return pcm16Buffer;
}

/**
 * Converts 16-bit Linear PCM sample to 8-bit Mu-law byte
 * @param {number} pcmSample 
 * @returns {number} mulawByte
 */
export function pcm16SampleToMulaw(pcmSample) {
  const BIAS = 0x84;
  const CLIP = 32635;

  let sign = (pcmSample < 0) ? 0x80 : 0x00;
  if (pcmSample < 0) pcmSample = -pcmSample;
  if (pcmSample > CLIP) pcmSample = CLIP;

  pcmSample += BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (pcmSample & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }

  let mantissa = (pcmSample >> (exponent + 3)) & 0x0F;
  let mulawByte = ~(sign | (exponent << 4) | mantissa);
  return mulawByte & 0xFF;
}

/**
 * Converts 16-bit Linear PCM Buffer to 8kHz Mu-law Buffer
 * @param {Buffer} pcmBuffer 
 * @returns {Buffer} Mulaw Buffer
 */
export function pcm16ToMulaw(pcmBuffer) {
  const mulawBuffer = Buffer.alloc(Math.floor(pcmBuffer.length / 2));
  for (let i = 0; i < mulawBuffer.length; i++) {
    const pcmVal = pcmBuffer.readInt16LE(i * 2);
    mulawBuffer[i] = pcm16SampleToMulaw(pcmVal);
  }
  return mulawBuffer;
}

/**
 * Resamples 16kHz PCM16 buffer down to 8kHz PCM16 buffer by simple decimation
 */
export function resample16kTo8k(pcm16kBuffer) {
  const pcm8kBuffer = Buffer.alloc(Math.floor(pcm16kBuffer.length / 2));
  for (let i = 0; i < pcm8kBuffer.length / 2; i++) {
    const sample = pcm16kBuffer.readInt16LE(i * 4); // Take every 2nd sample
    pcm8kBuffer.writeInt16LE(sample, i * 2);
  }
  return pcm8kBuffer;
}
