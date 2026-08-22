/**
 * Per-Session Turn Queue
 *
 * Serializes voice turns instead of dropping them when isProcessing is true.
 * Users commonly say corrections ("Actually make that two... no, wait...")
 * that would be silently dropped by the old `if (isProcessing) return` pattern.
 */
export class TurnQueue {
  constructor() {
    this.queue = [];
    this.running = false;
  }

  push(fn) {
    this.queue.push(fn);
    this.drain();
  }

  async drain() {
    if (this.running) return;
    this.running = true;

    try {
      while (this.queue.length > 0) {
        const fn = this.queue.shift();
        await fn();
      }
    } finally {
      this.running = false;
    }
  }

  get pending() {
    return this.queue.length;
  }

  get isProcessing() {
    return this.running;
  }
}
