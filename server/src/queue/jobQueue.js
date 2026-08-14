import { EventEmitter } from 'events';

/**
 * Universal Asynchronous Job Queue Engine
 * 
 * Provides resilient, non-blocking background task processing with
 * concurrency controls, exponential retry backoff, and dead-letter queue (DLQ) tracking.
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
    this.processors.set(jobType, handler);
    this._drain();
  }

  /**
   * Add a job to the queue
   */
  async add(jobType, data = {}, options = {}) {
    const job = {
      id: `${this.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: jobType,
      data,
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
   * Internal queue drain worker loop
   */
  async _drain() {
    if (this.isPaused || this.runningCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    const handler = this.processors.get(job.type);
    if (!handler) {
      console.warn(`[JobQueue:${this.name}] No processor registered for job type '${job.type}'. Re-queuing.`);
      this.queue.unshift(job);
      return;
    }

    this.runningCount++;
    job.attempts++;

    try {
      const startTime = Date.now();
      const result = await handler(job.data, job);
      const duration = Date.now() - startTime;

      this.runningCount--;
      this.emit('completed', { job, result, duration });
      this._drain();
    } catch (err) {
      this.runningCount--;
      console.error(`[JobQueue:${this.name}] Job ${job.id} (${job.type}) failed (Attempt ${job.attempts}/${job.maxRetries}):`, err.message);

      if (job.attempts < job.maxRetries) {
        // Exponential backoff retry
        const backoffMs = this.initialBackoffMs * Math.pow(2, job.attempts - 1);
        setTimeout(() => {
          this.queue.push(job);
          this._drain();
        }, backoffMs);
        this.emit('retry', { job, error: err.message, nextAttemptIn: backoffMs });
      } else {
        // Send to Dead-Letter Queue
        job.failedAt = new Date().toISOString();
        job.error = err.message;
        this.dlq.push(job);
        this.emit('failed', { job, error: err.message });
        console.error(`[JobQueue:${this.name}] Job ${job.id} sent to DLQ after ${job.attempts} attempts.`);
        this._drain();
      }
    }
  }

  /**
   * Get current queue statistics
   */
  getStats() {
    return {
      name: this.name,
      pending: this.queue.length,
      active: this.runningCount,
      dlqCount: this.dlq.length,
      isPaused: this.isPaused,
    };
  }

  /**
   * Pause queue processing
   */
  pause() {
    this.isPaused = true;
  }

  /**
   * Resume queue processing
   */
  resume() {
    this.isPaused = false;
    this._drain();
  }
}
