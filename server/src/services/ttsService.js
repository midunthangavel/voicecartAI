/**
 * TTS Service — Multi-Provider Text-to-Speech
 * 
 * Providers:
 *   - sarvam: Sarvam AI Bulbul v1 (best Tamil & Indian English accent)
 *   - google: Google Cloud Text-to-Speech (WaveNet voices)
 *   - mock: Mock tone generator for local development without credentials
 * 
 * Selected via: AI_TTS_PROVIDER env variable
 */

import { pcm16ToMulaw } from '../utils/audioUtils.js';

// In-memory audio cache for repeated static prompts (Step 23)
const ttsAudioCache = new Map();
const MAX_CACHE_ENTRIES = 150;

function getCacheKey(text, language, provider) {
  return `${provider}:${language}:${text.trim().toLowerCase()}`;
}

/**
 * Synthesize text to mulaw audio buffer for telephony playback with caching.
 * @param {string} text - Text to synthesize
 * @param {string} language - Language code ('ta-IN' or 'en-IN')
 * @returns {Promise<Buffer>} mulaw audio buffer (8kHz)
 */
export async function synthesizeSpeech(text, language = 'en-IN') {
  const provider = process.env.AI_TTS_PROVIDER || 'mock';
  const cacheKey = getCacheKey(text, language, provider);

  // Check cache hit
  if (ttsAudioCache.has(cacheKey)) {
    return ttsAudioCache.get(cacheKey);
  }

  let audioBuffer;

  // 1. Try Sarvam AI if configured
  if (provider === 'sarvam' && process.env.SARVAM_API_KEY) {
    try {
      audioBuffer = await sarvamTts(text, language);
    } catch (err) {
      console.warn('[TTS] Sarvam TTS failed, falling back to next provider:', err.message);
    }
  }

  // 2. Try Google Cloud TTS if configured
  if (!audioBuffer && (provider === 'google' || (provider === 'sarvam' && !process.env.SARVAM_API_KEY))) {
    try {
      audioBuffer = await googleCloudTts(text, language);
    } catch (err) {
      console.warn('[TTS] Google Cloud TTS unavailable, falling back to mock:', err.message);
    }
  }

  // 3. Fallback to Mock TTS
  if (!audioBuffer) {
    audioBuffer = mockTts(text, language);
  }

  // Store in cache (evicting oldest if exceeds limit)
  if (ttsAudioCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = ttsAudioCache.keys().next().value;
    ttsAudioCache.delete(oldestKey);
  }
  ttsAudioCache.set(cacheKey, audioBuffer);

  return audioBuffer;
}

/**
 * Sarvam AI Bulbul TTS synthesis
 */
export async function sarvamTts(text, language = 'ta-IN') {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('SARVAM_API_KEY not configured');

  const langCode = language.startsWith('ta') ? 'ta-IN' : 'en-IN';
  const startTime = Date.now();

  const response = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: langCode,
      speaker: 'meera',
      pitch: 0,
      pace: 1.05,
      loudness: 1.5,
      speech_sample_rate: 8000,
      enable_preprocessing: true,
      model: 'bulbul:v1',
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Sarvam API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const audioBase64 = data.audios?.[0];
  if (!audioBase64) throw new Error('Sarvam returned empty audio');

  const wavBuffer = Buffer.from(audioBase64, 'base64');
  // Strip 44-byte WAV header to get raw PCM16 samples, then convert to mulaw
  const pcmBuffer = wavBuffer.length > 44 ? wavBuffer.subarray(44) : wavBuffer;
  const mulawBuffer = pcm16ToMulaw(pcmBuffer);

  const latency = Date.now() - startTime;
  console.log(`[TTS] Sarvam Bulbul synthesized ${text.length} chars in ${latency}ms`);

  return mulawBuffer;
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
 * In mock mode, we generate a short tone pattern so the caller hears something.
 */
function mockTts(text, language) {
  const wordCount = Math.max(1, text.split(/\s+/).length);
  const durationPerWord = 0.18;
  const totalDuration = Math.max(0.5, Math.min(wordCount * durationPerWord, 10));
  const sampleRate = 8000;
  const totalSamples = Math.floor(sampleRate * totalDuration);

  const pcmBuffer = Buffer.alloc(totalSamples * 2);
  const baseFreq = language === 'ta-IN' ? 280 : 260;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const wordIndex = Math.floor((i / totalSamples) * wordCount);

    const freq = baseFreq + Math.sin(t * 3.0) * 40 + (wordIndex % 3) * 20;
    const wordProgress = ((i / totalSamples) * wordCount) % 1;
    const envelope = Math.sin(wordProgress * Math.PI) * 0.6 + 0.2;
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
  return mulawBuffer.length / 8000;
}
