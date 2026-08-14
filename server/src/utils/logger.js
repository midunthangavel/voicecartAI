/**
 * Enterprise Structured Logger for VoiceCart AI
 * 
 * Supports human-readable colorized logs in development and
 * machine-parseable JSON logs in production (Datadog, Loki, CloudWatch).
 */

const IS_PROD = process.env.NODE_ENV === 'production';

const LOG_LEVELS = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
};

const CURRENT_LEVEL = process.env.LOG_LEVEL
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
  : LOG_LEVELS.INFO;

/**
 * Masks sensitive phone numbers for PII protection (Step 36 & 97)
 * E.g., "+919876543210" -> "+91******3210"
 */
export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  if (phone.startsWith('+91')) {
    return phone.replace(/^(\+91)\d{6}(\d{4})$/, '$1******$2');
  }
  return phone.replace(/^(\+?\d{1,3})\d{4,6}(\d{4})$/, '$1******$2');
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const sanitized = { ...meta };
  if (sanitized.phone) sanitized.phone = maskPhone(sanitized.phone);
  if (sanitized.callerPhone) sanitized.callerPhone = maskPhone(sanitized.callerPhone);
  if (sanitized.caller_phone) sanitized.caller_phone = maskPhone(sanitized.caller_phone);
  return sanitized;
}

function formatLog(level, message, meta = {}, err = null) {
  const timestamp = new Date().toISOString();
  const correlationId = meta.correlationId || meta.sessionId || null;
  const cleanMeta = sanitizeMeta(meta);

  if (IS_PROD) {
    const entry = {
      timestamp,
      level,
      message,
      correlationId,
      ...cleanMeta,
    };
    if (err) {
      entry.error = {
        message: err.message,
        stack: err.stack,
        code: err.code,
      };
    }
    return JSON.stringify(entry);
  }

  // Local Development Formatter
  const levelColors = {
    INFO: '\x1b[32m[INFO]\x1b[0m',
    WARN: '\x1b[33m[WARN]\x1b[0m',
    ERROR: '\x1b[31m[ERROR]\x1b[0m',
    DEBUG: '\x1b[36m[DEBUG]\x1b[0m',
    TRACE: '\x1b[90m[TRACE]\x1b[0m',
  };

  const tag = levelColors[level] || `[${level}]`;
  const corrTag = correlationId ? ` \x1b[90m(${correlationId})\x1b[0m` : '';
  const metaStr = Object.keys(cleanMeta).length > 0 ? ` \x1b[90m${JSON.stringify(cleanMeta)}\x1b[0m` : '';
  const errStr = err ? `\n\x1b[31m${err.stack || err.message}\x1b[0m` : '';

  return `${timestamp} ${tag}${corrTag} ${message}${metaStr}${errStr}`;
}

export const logger = {
  info(message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
      console.log(formatLog('INFO', message, meta));
    }
  },

  warn(message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
      console.warn(formatLog('WARN', message, meta));
    }
  },

  error(message, err, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
      console.error(formatLog('ERROR', message, meta, err));
    }
  },

  debug(message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      console.log(formatLog('DEBUG', message, meta));
    }
  },

  voiceTurn(turnData) {
    const { sessionId, turnNumber, vadMs, sttMs, llmMs, ttsMs, totalMs, provider } = turnData;
    const latencyMeta = {
      sessionId,
      turn: turnNumber,
      latency: {
        vad: `${vadMs}ms`,
        stt: `${sttMs}ms`,
        llm: `${llmMs}ms`,
        tts: `${ttsMs}ms`,
        total: `${totalMs}ms`,
      },
      provider,
    };

    if (totalMs > 1200) {
      this.warn(`Voice turn latency budget exceeded (${totalMs}ms > 800ms)`, latencyMeta);
    } else {
      this.info(`Voice turn completed in ${totalMs}ms (STT:${sttMs}ms | LLM:${llmMs}ms | TTS:${ttsMs}ms)`, latencyMeta);
    }
  },
};

export default logger;
