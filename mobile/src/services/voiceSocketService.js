// Resilient WebSocket Client for VoiceCart AI Web Audio Stream

export class VoiceSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.url = null;
  }

  connect(url) {
    this.url = url;
    this.disconnect();

    return new Promise((resolve, reject) => {
      try {
        console.log(`[WS] Connecting to: ${url}`);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('[WS] Connected to VoiceCart Server');
          this.reconnectAttempts = 0;
          this.emit('open');
          // Send handshake start event
          this.send({ type: 'start' });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.emit('message', data);

            if (data.type) {
              this.emit(data.type, data);
            }
          } catch (err) {
            console.error('[WS] Parse message error:', err);
          }
        };

        this.ws.onerror = (err) => {
          console.warn('[WS] Socket error:', err);
          this.emit('error', err);
        };

        this.ws.onclose = (event) => {
          console.log(`[WS] Closed (code: ${event.code})`);
          this.emit('close', event);
          this.ws = null;
        };
      } catch (err) {
        console.error('[WS] Fatal connect error:', err);
        reject(err);
      }
    });
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    console.warn('[WS] Cannot send message, socket not open');
    return false;
  }

  sendAudio(base64Data, format = 'm4a', language = 'en') {
    return this.send({
      type: 'audio',
      data: base64Data,
      format,
      language,
    });
  }

  sendText(text) {
    return this.send({
      type: 'text',
      text: text.trim(),
    });
  }

  sendDTMF(digit) {
    return this.send({
      type: 'dtmf',
      digit: String(digit),
    });
  }

  disconnect() {
    if (this.ws) {
      try {
        this.send({ type: 'end' });
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[WS] Listener error for ${event}:`, err);
        }
      });
    }
  }
}

export const socketService = new VoiceSocketService();
