import { spawn } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { config } from '../config.js';

export class ServerSandbox {
  constructor(customPort = null) {
    this.port = customPort || config.targets.server.sandboxPort;
    this.host = config.targets.server.sandboxHost;
    this.dbPath = config.targets.server.sandboxDb;
    this.baseUrl = `http://${this.host}:${this.port}`;
    this.wsUrl = `ws://${this.host}:${this.port}`;
    this.process = null;
  }

  async start() {
    // Clean up any stale sandbox DB
    this._cleanupDb();

    console.log(`\x1b[36m[Sandbox]\x1b[0m Starting isolated VoiceCart test server on port ${this.port}...`);

    const env = {
      ...process.env,
      PORT: String(this.port),
      HOST: this.host,
      DB_PATH: this.dbPath,
      NODE_ENV: 'test',
      MOCK_SERVICES: 'true',
      JWT_SECRET: 'test-sandbox-jwt-secret-very-secure-32chars',
      RAZORPAY_KEY_SECRET: 'sandbox_rzp_mock_secret',
      TWILIO_AUTH_TOKEN: 'sandbox_twilio_mock_token',
      WHATSAPP_WEBHOOK_SECRET: 'sandbox_wa_mock_secret',
    };

    return new Promise((resolve, reject) => {
      this.process = spawn(process.execPath, ['server.js'], {
        cwd: config.targets.server.path,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      let startupLogs = '';

      this.process.stdout.on('data', (data) => {
        startupLogs += data.toString();
      });

      this.process.stderr.on('data', (data) => {
        startupLogs += data.toString();
      });

      this.process.on('error', (err) => {
        console.error(`\x1b[31m[Sandbox Error]\x1b[0m Server failed to spawn:`, err.message);
        reject(err);
      });

      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.warn(`\x1b[33m[Sandbox]\x1b[0m Server exited with code ${code}. Logs:\n${startupLogs}`);
        }
      });

      // Poll until server is responding on health endpoint
      const startTime = Date.now();
      const interval = setInterval(async () => {
        if (Date.now() - startTime > 15000) {
          clearInterval(interval);
          this.stop();
          return reject(new Error(`Server sandbox failed to start within 15s. Logs:\n${startupLogs}`));
        }

        try {
          const res = await fetch(`${this.baseUrl}${config.targets.server.healthEndpoint}`);
          if (res.ok || res.status === 200 || res.status === 404) {
            clearInterval(interval);
            console.log(`\x1b[32m[Sandbox Ready]\x1b[0m Server online at ${this.baseUrl}`);
            resolve(this);
          }
        } catch {
          // Waiting for server to bind
        }
      }, 300);
    });
  }

  stop() {
    if (this.process) {
      console.log(`\x1b[36m[Sandbox]\x1b[0m Terminating sandbox server process (PID: ${this.process.pid})...`);
      try {
        this.process.kill('SIGTERM');
      } catch {}
      this.process = null;
    }
    this._cleanupDb();
  }

  _cleanupDb() {
    try {
      if (existsSync(this.dbPath)) unlinkSync(this.dbPath);
      if (existsSync(`${this.dbPath}-wal`)) unlinkSync(`${this.dbPath}-wal`);
      if (existsSync(`${this.dbPath}-shm`)) unlinkSync(`${this.dbPath}-shm`);
    } catch {}
  }
}
