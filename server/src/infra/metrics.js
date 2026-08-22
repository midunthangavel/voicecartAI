import { logger } from '../utils/logger.js';

/**
 * Structured Metrics Service — Prometheus-Compatible Counters and Histograms
 *
 * Collects application-level metrics for:
 *   - HTTP request counts and latencies
 *   - Active voice sessions
 *   - Queue depths (pending, processing, DLQ)
 *   - Provider errors (STT, LLM, TTS, Payment)
 *   - Business events (orders confirmed, dispatched)
 *
 * Exposes a /metrics endpoint in Prometheus text format.
 */

class MetricsRegistry {
  constructor() {
    this.counters = new Map();
    this.histograms = new Map();
    this.gauges = new Map();
  }

  // ── Counter (monotonically increasing) ──
  incCounter(name, labels = {}, amount = 1) {
    const key = this._key(name, labels);
    const current = this.counters.get(key) || { name, labels, value: 0 };
    current.value += amount;
    this.counters.set(key, current);
  }

  // ── Gauge (can go up or down) ──
  setGauge(name, value, labels = {}) {
    const key = this._key(name, labels);
    this.gauges.set(key, { name, labels, value });
  }

  incGauge(name, labels = {}, amount = 1) {
    const key = this._key(name, labels);
    const current = this.gauges.get(key) || { name, labels, value: 0 };
    current.value += amount;
    this.gauges.set(key, current);
  }

  decGauge(name, labels = {}, amount = 1) {
    const key = this._key(name, labels);
    const current = this.gauges.get(key) || { name, labels, value: 0 };
    current.value = Math.max(0, current.value - amount);
    this.gauges.set(key, current);
  }

  // ── Histogram (latency tracking with buckets) ──
  observeHistogram(name, value, labels = {}) {
    const key = this._key(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        name,
        labels,
        count: 0,
        sum: 0,
        buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000].map(le => ({ le, count: 0 })),
      });
    }
    const hist = this.histograms.get(key);
    hist.count++;
    hist.sum += value;
    for (const bucket of hist.buckets) {
      if (value <= bucket.le) bucket.count++;
    }
  }

  // ── Prometheus Text Format Export ──
  toPrometheusText() {
    const lines = [];

    // Counters
    const counterNames = new Set([...this.counters.values()].map(c => c.name));
    for (const name of counterNames) {
      lines.push(`# TYPE ${name} counter`);
      for (const [, c] of this.counters) {
        if (c.name === name) {
          lines.push(`${name}${this._formatLabels(c.labels)} ${c.value}`);
        }
      }
    }

    // Gauges
    const gaugeNames = new Set([...this.gauges.values()].map(g => g.name));
    for (const name of gaugeNames) {
      lines.push(`# TYPE ${name} gauge`);
      for (const [, g] of this.gauges) {
        if (g.name === name) {
          lines.push(`${name}${this._formatLabels(g.labels)} ${g.value}`);
        }
      }
    }

    // Histograms
    const histNames = new Set([...this.histograms.values()].map(h => h.name));
    for (const name of histNames) {
      lines.push(`# TYPE ${name} histogram`);
      for (const [, h] of this.histograms) {
        if (h.name === name) {
          for (const bucket of h.buckets) {
            lines.push(`${name}_bucket${this._formatLabels({ ...h.labels, le: bucket.le })} ${bucket.count}`);
          }
          lines.push(`${name}_bucket${this._formatLabels({ ...h.labels, le: '+Inf' })} ${h.count}`);
          lines.push(`${name}_sum${this._formatLabels(h.labels)} ${h.sum}`);
          lines.push(`${name}_count${this._formatLabels(h.labels)} ${h.count}`);
        }
      }
    }

    return lines.join('\n') + '\n';
  }

  _key(name, labels) {
    const labelStr = Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',');
    return `${name}{${labelStr}}`;
  }

  _formatLabels(labels) {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    const parts = entries.map(([k, v]) => `${k}="${v}"`);
    return `{${parts.join(',')}}`;
  }
}

// ── Singleton Instance ──
export const metrics = new MetricsRegistry();

// ── Convenience Functions ──

/** Track an HTTP request */
export function trackRequest(method, path, statusCode, durationMs) {
  metrics.incCounter('voicecart_http_requests_total', { method, path: normalizePath(path), status: statusCode });
  metrics.observeHistogram('voicecart_http_request_duration_ms', durationMs, { method, path: normalizePath(path) });
}

/** Track active voice sessions */
export function trackSessionStart() {
  metrics.incGauge('voicecart_active_sessions');
  metrics.incCounter('voicecart_sessions_total');
}

export function trackSessionEnd() {
  metrics.decGauge('voicecart_active_sessions');
}

/** Track provider latency (STT, LLM, TTS) */
export function trackProviderLatency(provider, operation, durationMs, success = true) {
  metrics.observeHistogram('voicecart_provider_duration_ms', durationMs, { provider, operation });
  if (!success) {
    metrics.incCounter('voicecart_provider_errors_total', { provider, operation });
  }
}

/** Track queue depth snapshot */
export function trackQueueDepth(queueName, pending, processing, dlq) {
  metrics.setGauge('voicecart_queue_pending', pending, { queue: queueName });
  metrics.setGauge('voicecart_queue_processing', processing, { queue: queueName });
  metrics.setGauge('voicecart_queue_dlq', dlq, { queue: queueName });
}

/** Track business events */
export function trackBusinessEvent(eventType) {
  metrics.incCounter('voicecart_business_events_total', { event: eventType });
}

/**
 * Express middleware to track request metrics
 */
export function metricsMiddleware() {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      trackRequest(req.method, req.route?.path || req.path, res.statusCode, duration);
    });
    next();
  };
}

/**
 * Express route handler for /metrics endpoint
 */
export function metricsHandler(req, res) {
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metrics.toPrometheusText());
}

// Normalize paths to avoid cardinality explosion
function normalizePath(path) {
  return path
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
    .replace(/\?.*$/, '');
}
