/**
 * TTS Service — Google Cloud Text-to-Speech Streaming Wrapper
 * 
 * For production: Uses @google-cloud/text-to-speech for WaveNet voices
 * For development: Falls back to generating a simple sine-wave tone
 *                  (placeholder for actual speech synthesis).
 */

import { pcm16ToMulaw } from '../utils/audioUtils.js';

/**
 * Synthesize text to mulaw audio buffer for telephony playback.
 * @param {string} text - Text to synthesize
 * @param {string} language - Language code ('ta-IN' or 'en-IN')
 * @returns {Promise<Buffer>} mulaw audio buffer
 */
export async function synthesizeSpeech(text, language = 'en-IN') {
  try {
    return await googleCloudTts(text, language);
  } catch (err) {
    console.log('[TTS] Google Cloud TTS unavailable, using mock TTS:', err.message);
    return mockTts(text, language);
  }
}

/**
 * Google Cloud TTS synthesis
 */
async function googleCloudTts(text, language) {
  const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
  const client = new TextToSpeechClient();

  const voiceMap = {
    'ta-IN': { languageCode: 'ta-IN', name: 'ta-IN-Standard-A', ssmlGender: 'FEMALE' },
    'en-IN': { languageCode: 'en-IN', name: 'en-IN-Wavenet-C', ssmlGender: 'FEMALE' },
  };

  const voice = voiceMap[language] || voiceMap['en-IN'];

  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice,
    audioConfig: {
      audioEncoding: 'MULAW',
      sampleRateHertz: 8000,
      speakingRate: 1.05,
      pitch: 0.5,
    },
  });

  return Buffer.from(response.audioContent);
}

/**
 * Mock TTS: Generates a simple audio buffer from text.
 * In mock mode, we generate a short tone pattern so the caller hears *something*.
 * The real value is the response text logged to the dashboard.
 */
function mockTts(text, language) {
  // Generate ~100ms of audio per word at 8kHz mulaw
  const wordCount = text.split(/\s+/).length;
  const durationPerWord = 0.18; // seconds per word (faster = more natural)
  const totalDuration = Math.max(0.5, Math.min(wordCount * durationPerWord, 10));
  const sampleRate = 8000;
  const totalSamples = Math.floor(sampleRate * totalDuration);

  // Create PCM16 buffer with a gentle tone that varies by word boundaries
  const pcmBuffer = Buffer.alloc(totalSamples * 2);
  const baseFreq = language === 'ta-IN' ? 280 : 260; // Slightly different for each language

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const wordIndex = Math.floor((i / totalSamples) * wordCount);

    // Frequency modulation to simulate speech rhythm
    const freq = baseFreq + Math.sin(t * 3.0) * 40 + (wordIndex % 3) * 20;

    // Amplitude envelope (fade in/out at word boundaries)
    const wordProgress = ((i / totalSamples) * wordCount) % 1;
    const envelope = Math.sin(wordProgress * Math.PI) * 0.6 + 0.2;

    // Add slight noise for naturalness
    const noise = (Math.random() - 0.5) * 400;

    const sample = Math.floor(Math.sin(2 * Math.PI * freq * t) * 4000 * envelope + noise);
    const clamped = Math.max(-32768, Math.min(32767, sample));
    pcmBuffer.writeInt16LE(clamped, i * 2);
  }

  return pcm16ToMulaw(pcmBuffer);
}

/**
 * Get audio duration in seconds from a mulaw buffer
 */
export function getAudioDuration(mulawBuffer) {
  // Mulaw is 8kHz, 1 byte per sample
  return mulawBuffer.length / 8000;
}
