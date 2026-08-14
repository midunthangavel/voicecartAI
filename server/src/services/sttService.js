/**
 * STT Service — Multi-Provider Speech-to-Text
 * 
 * Providers:
 *   - groq: Groq Whisper Large v3 Turbo (free, batch transcription, excellent Tamil)
 *   - google: Google Cloud Speech-to-Text v2 streaming (existing)
 *   - mock: Mock STT for development without any API credentials
 * 
 * Selected via: AI_STT_PROVIDER env variable
 */

import { dbAll } from '../db.js';

// ── Phrase Hints (common Indian food terms for STT accuracy) ──
const DEFAULT_HINTS = [
  'biryani', 'biriyani', 'butter naan', 'garlic naan', 'paneer', 'chicken',
  'mutton', 'kothu parotta', 'parotta', 'dosa', 'idli', 'sambar',
  'rasam', 'thums up', 'masala chai', 'gulab jamun', 'chicken 65',
  'regular', 'family pack', 'spicy', 'mild', 'medium',
  'one', 'two', 'three', 'four', 'five',
  'oru', 'rendu', 'moonu', 'naalu', 'anju',
  'venum', 'kudunga', 'order', 'cancel', 'confirm', 'yes', 'no',
  'cash on delivery', 'UPI', 'online payment',
];

/**
 * Load additional STT hints from catalog database
 */
async function loadCatalogHints() {
  try {
    const rows = await dbAll('SELECT stt_hints FROM catalog WHERE available = 1');
    const hints = new Set(DEFAULT_HINTS);
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.stt_hints);
        if (Array.isArray(parsed)) parsed.forEach(h => hints.add(h));
      } catch { /* skip bad JSON */ }
    }
    return Array.from(hints);
  } catch {
    return DEFAULT_HINTS;
  }
}

/**
 * Transcribe audio using Groq Whisper Large v3 Turbo (batch API).
 * @param {Buffer} audioBuffer - PCM16 audio buffer (16kHz or 8kHz)
 * @param {string} language - Language hint ('ta' for Tamil, 'en' for English)
 * @returns {Promise<{transcript: string, language: string, confidence: number}>}
 */
export async function groqWhisperStt(audioBuffer, language = 'ta') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  // Convert PCM16 buffer to WAV format for the API
  const wavBuffer = createWavFromPcm(audioBuffer, 8000);

  // Build multipart form data manually
  const boundary = '----VoiceCartBoundary' + Date.now();
  const parts = [];

  // File part
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`
  );
  parts.push(wavBuffer);
  parts.push('\r\n');

  // Model part
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `whisper-large-v3-turbo\r\n`
  );

  // Language hint part
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n` +
    `${language}\r\n`
  );

  // Response format part
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
    `verbose_json\r\n`
  );

  parts.push(`--${boundary}--\r\n`);

  // Combine all parts into a single buffer
  const bodyParts = parts.map(p => typeof p === 'string' ? Buffer.from(p) : p);
  const body = Buffer.concat(bodyParts);

  const startTime = Date.now();

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Groq Whisper error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const latency = Date.now() - startTime;

  console.log(`[STT] Groq Whisper transcribed in ${latency}ms: "${data.text}"`);

  return {
    transcript: data.text || '',
    language: data.language || language,
    confidence: 0.95, // Whisper large v3 is generally high confidence
    latency_ms: latency,
    provider: 'Groq Whisper',
  };
}

/**
 * Create a minimal WAV header for PCM16 audio
 */
function createWavFromPcm(pcmBuffer, sampleRate = 8000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);
  header.write('RIFF', 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM subchunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Create an STT streaming session based on configured provider.
 * Returns an object with { write(audioChunk), onTranscript(cb), end() }
 */
export async function createSttStream(language = 'en-IN') {
  const provider = process.env.AI_STT_PROVIDER || 'mock';
  const hints = await loadCatalogHints();

  // ── Groq Whisper (batch mode with VAD-like chunking) ──
  if (provider === 'groq' && process.env.GROQ_API_KEY) {
    console.log('[STT] Using Groq Whisper Large v3 Turbo (batch mode)');
    return createGroqSttStream(language);
  }

  // ── Google Cloud STT (streaming) ──
  if (provider === 'google') {
    try {
      return await createGoogleSttStream(language, hints);
    } catch (err) {
      console.log('[STT] Google Cloud STT unavailable, falling back to mock:', err.message);
      return createMockSttStream();
    }
  }

  // ── Mock STT (development) ──
  console.log('[STT] Using mock STT (development mode)');
  return createMockSttStream();
}

/**
 * Groq Whisper batch STT wrapped in a streaming-compatible interface.
 * Accumulates audio, detects silence via energy, then transcribes the chunk.
 */
function createGroqSttStream(language) {
  const callbacks = [];
  let audioBuffer = Buffer.alloc(0);
  let silenceFrames = 0;
  let isSpeaking = false;
  let speechBuffer = Buffer.alloc(0);
  const langCode = language.startsWith('ta') ? 'ta' : 'en';

  const processInterval = setInterval(() => {
    if (audioBuffer.length < 640) return;

    // Calculate RMS energy for VAD
    let sumSquares = 0;
    const samples = Math.min(audioBuffer.length, 3200);
    for (let i = 0; i < samples; i += 2) {
      if (i + 1 < audioBuffer.length) {
        const sample = audioBuffer.readInt16LE(i);
        sumSquares += sample * sample;
      }
    }
    const rms = Math.sqrt(sumSquares / (samples / 2));

    // Accumulate speech audio
    if (rms > 500) {
      isSpeaking = true;
      silenceFrames = 0;
      speechBuffer = Buffer.concat([speechBuffer, audioBuffer]);

      // Send interim indicator
      for (const cb of callbacks) {
        cb({ transcript: '...', isFinal: false, confidence: 0, language });
      }
    } else if (isSpeaking) {
      speechBuffer = Buffer.concat([speechBuffer, audioBuffer]);
      silenceFrames++;

      if (silenceFrames >= 12) {
        // End of speech detected — send to Groq for transcription
        const finalAudio = speechBuffer;
        speechBuffer = Buffer.alloc(0);
        isSpeaking = false;
        silenceFrames = 0;

        // Async transcription
        groqWhisperStt(finalAudio, langCode)
          .then(result => {
            if (result.transcript && result.transcript.trim()) {
              for (const cb of callbacks) {
                cb({
                  transcript: result.transcript.trim(),
                  isFinal: true,
                  confidence: result.confidence,
                  language: result.language === 'ta' ? 'ta-IN' : 'en-IN',
                });
              }
            }
          })
          .catch(err => {
            console.error('[STT] Groq Whisper transcription error:', err.message);
          });
      }
    }

    audioBuffer = Buffer.alloc(0);
  }, 100);

  return {
    write(audioChunk) {
      audioBuffer = Buffer.concat([audioBuffer, audioChunk]);
    },
    onTranscript(cb) {
      callbacks.push(cb);
    },
    end() {
      clearInterval(processInterval);
      // Transcribe any remaining speech
      if (speechBuffer.length > 1600) {
        groqWhisperStt(speechBuffer, langCode)
          .then(result => {
            if (result.transcript && result.transcript.trim()) {
              for (const cb of callbacks) {
                cb({
                  transcript: result.transcript.trim(),
                  isFinal: true,
                  confidence: result.confidence,
                  language: result.language === 'ta' ? 'ta-IN' : 'en-IN',
                });
              }
            }
          })
          .catch(() => {});
      }
    },
    isLive: true,
    provider: 'groq',
  };
}

/**
 * Google Cloud STT streaming session (existing implementation)
 */
async function createGoogleSttStream(language, hints) {
  const { SpeechClient } = await import('@google-cloud/speech');
  const client = new SpeechClient();

  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 8000,
      languageCode: language,
      alternativeLanguageCodes: language === 'ta-IN' ? ['en-IN'] : ['ta-IN'],
      enableAutomaticPunctuation: true,
      model: 'latest_long',
      useEnhanced: true,
      speechContexts: [{ phrases: hints, boost: 15 }],
    },
    interimResults: true,
  };

  const recognizeStream = client.streamingRecognize(request);
  const callbacks = [];

  recognizeStream.on('data', (data) => {
    if (data.results && data.results[0]) {
      const result = data.results[0];
      const transcript = result.alternatives[0]?.transcript || '';
      const isFinal = result.isFinal;
      const confidence = result.alternatives[0]?.confidence || 0;
      const detectedLang = result.languageCode || language;

      for (const cb of callbacks) {
        cb({ transcript, isFinal, confidence, language: detectedLang });
      }
    }
  });

  recognizeStream.on('error', (err) => {
    console.error('[STT] Stream error:', err.message);
  });

  return {
    write(audioChunk) {
      if (!recognizeStream.destroyed) {
        recognizeStream.write(audioChunk);
      }
    },
    onTranscript(cb) {
      callbacks.push(cb);
    },
    end() {
      if (!recognizeStream.destroyed) {
        recognizeStream.end();
      }
    },
    isLive: true,
    provider: 'google',
  };
}

/**
 * Mock STT stream for development without GCP credentials.
 * Detects audio energy and simulates transcription events.
 */
function createMockSttStream() {
  const callbacks = [];
  let audioBuffer = Buffer.alloc(0);
  let silenceFrames = 0;
  let isSpeaking = false;
  let speechStartTime = null;

  // Mock phrases that cycle through a simulated order
  const mockPhrases = [
    'I want one chicken biryani',
    'regular size',
    'and one butter naan',
    'yes that is all',
    'yes confirm',
  ];
  let phraseIndex = 0;

  const processInterval = setInterval(() => {
    if (audioBuffer.length < 640) return; // Need at least 40ms of 8kHz audio

    // Calculate RMS energy
    let sumSquares = 0;
    const samples = Math.min(audioBuffer.length, 3200);
    for (let i = 0; i < samples; i += 2) {
      if (i + 1 < audioBuffer.length) {
        const sample = audioBuffer.readInt16LE(i);
        sumSquares += sample * sample;
      }
    }
    const rms = Math.sqrt(sumSquares / (samples / 2));
    audioBuffer = Buffer.alloc(0);

    const SPEECH_THRESHOLD = 500;
    const SILENCE_FRAMES_FOR_FINAL = 12;

    if (rms > SPEECH_THRESHOLD) {
      if (!isSpeaking) {
        isSpeaking = true;
        speechStartTime = Date.now();
      }
      silenceFrames = 0;

      // Send interim transcript
      const phrase = mockPhrases[phraseIndex % mockPhrases.length];
      const wordsToShow = Math.min(
        phrase.split(' ').length,
        Math.ceil((Date.now() - speechStartTime) / 400)
      );
      const partial = phrase.split(' ').slice(0, wordsToShow).join(' ');

      for (const cb of callbacks) {
        cb({ transcript: partial, isFinal: false, confidence: 0.7, language: 'en-IN' });
      }
    } else if (isSpeaking) {
      silenceFrames++;
      if (silenceFrames >= SILENCE_FRAMES_FOR_FINAL) {
        // Send final transcript
        const phrase = mockPhrases[phraseIndex % mockPhrases.length];
        for (const cb of callbacks) {
          cb({ transcript: phrase, isFinal: true, confidence: 0.92, language: 'en-IN' });
        }
        phraseIndex++;
        isSpeaking = false;
        silenceFrames = 0;
        speechStartTime = null;
      }
    }
  }, 100);

  return {
    write(audioChunk) {
      audioBuffer = Buffer.concat([audioBuffer, audioChunk]);
    },
    onTranscript(cb) {
      callbacks.push(cb);
    },
    end() {
      clearInterval(processInterval);
    },
    isLive: false,
  };
}
