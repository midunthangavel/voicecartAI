/**
 * STT Service — Google Cloud Speech-to-Text v2 Streaming Wrapper
 * 
 * For production: Uses @google-cloud/speech streaming recognition
 * with ta-IN / en-IN code-switching and food-term phrase hints.
 * 
 * For development (no GCP credentials): Falls back to a mock STT
 * that simulates transcription from audio energy detection.
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
 * Create a Google Cloud STT streaming session
 * Returns an object with { write(audioChunk), onTranscript(cb), end() }
 */
export async function createSttStream(language = 'en-IN') {
  const hints = await loadCatalogHints();

  // ── Try to use real Google Cloud STT ──
  try {
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
    };
  } catch (err) {
    console.log('[STT] Google Cloud STT unavailable, using mock STT:', err.message);
    return createMockSttStream();
  }
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
