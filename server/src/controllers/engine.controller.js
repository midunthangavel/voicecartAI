import { getProviderStatus } from '../services/llmProviderAdapter.js';

/**
 * Controller for AI Pipeline and Engine Configuration Status
 */
export function getEngineStatus(req, res) {
  const llmStatus = getProviderStatus();
  res.json({
    llm: {
      provider: process.env.AI_LLM_PROVIDER || 'gemini',
      ...llmStatus,
    },
    stt: {
      provider: process.env.AI_STT_PROVIDER || 'mock',
      groq_configured: !!process.env.GROQ_API_KEY,
      google_configured: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
    },
    tts: {
      provider: process.env.AI_TTS_PROVIDER || 'mock',
      sarvam_configured: !!process.env.SARVAM_API_KEY,
      google_configured: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
    },
  });
}
