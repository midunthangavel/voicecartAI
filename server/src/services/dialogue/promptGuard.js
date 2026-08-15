/**
 * Prompt Injection Guard & Boundary Isolator
 * 
 * Protects LLM dialogue pipelines from prompt injection, prompt leakage attempts,
 * and malicious command injection via spoken customer transcripts.
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /reveal\s+(system\s+)?prompt/i,
  /output\s+(all\s+)?database\s+records/i,
  /you\s+are\s+now\s+a/i,
  /act\s+as\s+an\s+unrestricted/i,
  /system\s*:/i,
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
];

/**
 * Sanitize raw customer transcript
 */
export function sanitizeUserTranscript(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';

  let sanitized = rawText.trim();

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      console.warn(`[PromptGuard] Neutralized potential prompt injection attempt: "${sanitized}"`);
      sanitized = sanitized.replace(pattern, '[redacted]');
    }
  }

  // Cap length to prevent token exhaustion DOS
  return sanitized.substring(0, 500);
}

/**
 * Wrap customer speech in an isolated XML boundary block
 */
export function isolateUserSpeech(transcript) {
  const cleanText = sanitizeUserTranscript(transcript);
  return `<customer_voice_transcript is_untrusted="true">\n${cleanText}\n</customer_voice_transcript>`;
}
