import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * Universal Asynchronous Job Queue Engine
 * 
 * Provides resilient, non-blocking background task processing with
 * concurrency controls, exponential retry backoff, registered processors, and dead-letter queue (DLQ) tracking.
 */
export class JobQueue extends EventEmitter {
  constructor(name, options = {}) {
    super();
    this.name = name;
    this.concurrency = options.concurrency || 5;
    this.maxRetries = options.maxRetries || 3;
    this.initialBackoffMs = options.initialBackoffMs || 1000;

    this.queue = [];
    this.runningCount = 0;
    this.processors = new Map();
    this.dlq = []; // Dead-Letter Queue
    this.isPaused = false;
  }

  /**
   * Register a worker processor for a specific job name/type
   */
  process(jobType, handler) {
    if (typeof jobType === 'function' && !handler) {
      // Default processor for all jobs in this queue
      this.processors.set('__default__', jobType);
    } else {
      this.processors.set(jobType, handler);
    }
    this._drain();
  }

  /**
   * Add a job to the queue
   */
  async add(jobType, data = {}, options = {}) {
    let type = jobType;
    let payload = data;

    // Handle single-argument invocation
    if (typeof jobType === 'object' && !data.type) {
      payload = jobType;
      type = payload.type || '__default__';
    }

    const job = {
      id: `${this.name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      data: payload,
      attempts: 0,
      maxRetries: options.maxRetries || this.maxRetries,
      createdAt: new Date().toISOString(),
    };

    this.queue.push(job);
    this.emit('added', job);
    setImmediate(() => this._drain());
    return job;
  }

  /**
   * Enqueue alias for compatibility
   */
  async enqueue(data = {}, options = {}) {
    const type = data.type || '__default__';
    return this.add(type, data, options);
  }

  /**
   * Internal queue drain worker loop
   */
  async _drain() {
    if (this.isPaused || this.runningCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.runningCount++;
    job.attempts++;

    const processor = this.processors.get(job.type) || this.processors.get('__default__');

    if (!processor) {
      logger.warn(`[JobQueue:${this.name}] No processor registered for job type "${job.type}". Re-queuing with backoff.`);
      // Put back in queue if processor isn't ready yet
      setTimeout(() => {
        this.queue.push(job);
        this.runningCount--;
        this._drain();
      }, 1000);
      return;
    }

    try {
      await processor(job.data, job);
      this.emit('completed', job);
    } catch (err) {
      logger.error(`[JobQueue:${this.name}] Job #${job.id} failed (attempt ${job.attempts}/${job.maxRetries}):`, err.message);

      if (job.attempts < job.maxRetries) {
        const backoffMs = this.initialBackoffMs * Math.pow(2, job.attempts - 1);
        setTimeout(() => {
          this.queue.push(job);
          this._drain();
        }, backoffMs);
      } else {
        job.failedReason = err.message;
        job.failedAt = new Date().toISOString();
        this.dlq.push(job);
        this.emit('failed', job, err);
        logger.error(`[JobQueue:${this.name}] Job #${job.id} moved to Dead-Letter Queue (DLQ).`);
      }
    } finally {
      this.runningCount--;
      setImmediate(() => this._drain());
    }
  }

  getStats() {
    return {
      name: this.name,
      queued: this.queue.length,
      running: this.runningCount,
      dlq: this.dlq.length,
      isPaused: this.isPaused,
    };
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
    this._drain();
  }

  clear() {
    this.queue = [];
    this.dlq = [];
  }
}
