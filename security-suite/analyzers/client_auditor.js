import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, extname } from 'path';
import { config } from '../config.js';

export class ClientAuditor {
  constructor(clientDir = null) {
    this.clientDir = clientDir || config.targets.client.path;
    this.srcDir = resolve(this.clientDir, 'src');
    this.findings = [];
  }

  async runAll() {
    console.log(`\n\x1b[35m[Auditor: Client]\x1b[0m Commencing static and vulnerability audit for Web Client (${this.srcDir})...`);

    const files = this._getFiles(this.srcDir);

    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf-8');
      const relPath = filePath.replace(this.clientDir, '').replace(/^[\\/]/, '');

      this.checkSecretLeaks(relPath, content);
      this.checkXssSinks(relPath, content);
      this.checkInsecureStorage(relPath, content);
      this.checkPostMessage(relPath, content);
    }

    return this.findings;
  }

  _recordFinding({ id, title, severity, category, file, line, description, poc, remediation }) {
    this.findings.push({
      id,
      title,
      severity,
      category,
      target: 'client',
      file,
      line,
      description,
      poc,
      remediation,
      status: 'OPEN',
      timestamp: new Date().toISOString(),
    });
  }

  _getFiles(dir) {
    let results = [];
    try {
      const list = readdirSync(dir);
      for (const file of list) {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(this._getFiles(fullPath));
        } else if (['.js', '.jsx', '.ts', '.tsx', '.html', '.json'].includes(extname(fullPath))) {
          results.push(fullPath);
        }
      }
    } catch {}
    return results;
  }

  // 1. Hardcoded Secret & Key Detection
  checkSecretLeaks(file, content) {
    const patterns = [
      { regex: /(?:rzp_live_[a-zA-Z0-9]{14,})/g, name: 'Razorpay Live API Key', severity: 'CRITICAL' },
      { regex: /(?:sk_live_[a-zA-Z0-9]{24,})/g, name: 'Stripe Live Secret Key', severity: 'CRITICAL' },
      { regex: /(?:AIzaSy[a-zA-Z0-9_-]{33})/g, name: 'Google / Gemini API Key', severity: 'HIGH' },
      { regex: /(?:Bearer\s+[a-zA-Z0-9_\-\.]{30,})/g, name: 'Hardcoded Bearer Token', severity: 'HIGH' },
      { regex: /(?:password\s*[:=]\s*['"][^'"]{6,}['"])/gi, name: 'Hardcoded Password Field', severity: 'MEDIUM' },
    ];

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const p of patterns) {
        if (p.regex.test(lines[i])) {
          this._recordFinding({
            id: `SEC-CLI-SECRET-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
            title: `Hardcoded Secret Detected: ${p.name}`,
            severity: p.severity,
            category: 'Credential Exposure',
            file,
            line: i + 1,
            description: `A potentially sensitive ${p.name} pattern was found in client source code.`,
            poc: lines[i].trim().slice(0, 100),
            remediation: 'Move secrets to backend environment variables; never embed secret keys in frontend bundles.',
          });
        }
      }
    }
  }

  // 2. DOM-based XSS Sinks
  checkXssSinks(file, content) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes('dangerouslySetInnerHTML')) {
        this._recordFinding({
          id: 'SEC-CLI-XSS-001',
          title: 'React dangerouslySetInnerHTML Usage',
          severity: 'HIGH',
          category: 'Cross-Site Scripting (XSS)',
          file,
          line: i + 1,
          description: 'dangerouslySetInnerHTML bypasses React XSS sanitization and may execute malicious user payloads.',
          poc: line.trim(),
          remediation: 'Use standard JSX element rendering or sanitize HTML with DOMPurify before injection.',
        });
      }

      if (/\.innerHTML\s*=/.test(line)) {
        this._recordFinding({
          id: 'SEC-CLI-XSS-002',
          title: 'Direct innerHTML Assignment Sink',
          severity: 'HIGH',
          category: 'Cross-Site Scripting (XSS)',
          file,
          line: i + 1,
          description: 'Direct assignment to innerHTML can execute unsanitized script tags.',
          poc: line.trim(),
          remediation: 'Use textContent or React state binding instead of direct innerHTML modification.',
        });
      }

      if (/\beval\s*\(/.test(line) || /new\s+Function\s*\(/.test(line)) {
        this._recordFinding({
          id: 'SEC-CLI-EVAL-001',
          title: 'Dynamic Code Evaluation (eval/Function)',
          severity: 'HIGH',
          category: 'Code Injection',
          file,
          line: i + 1,
          description: 'eval() or new Function() allows arbitrary JavaScript execution if user input is supplied.',
          poc: line.trim(),
          remediation: 'Refactor logic to use JSON.parse() or standard functional transformations.',
        });
      }
    }
  }

  // 3. Insecure Local Storage of Credentials
  checkInsecureStorage(file, content) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/localStorage\.setItem\s*\(\s*['"]password['"]/i.test(line)) {
        this._recordFinding({
          id: 'SEC-CLI-STORE-001',
          title: 'Raw Password Stored in localStorage',
          severity: 'HIGH',
          category: 'Insecure Storage',
          file,
          line: i + 1,
          description: 'Plaintext passwords should never be stored in browser localStorage accessible to XSS.',
          poc: line.trim(),
          remediation: 'Use httpOnly cookies or in-memory short-lived session state.',
        });
      }
    }
  }

  // 4. Insecure postMessage Handling
  checkPostMessage(file, content) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/window\.addEventListener\s*\(\s*['"]message['"]/.test(line) && !content.includes('event.origin')) {
        this._recordFinding({
          id: 'SEC-CLI-MSG-001',
          title: 'Missing event.origin Validation in postMessage Listener',
          severity: 'MEDIUM',
          category: 'Cross-Origin Communication',
          file,
          line: i + 1,
          description: 'Window message listener does not verify event.origin, allowing any embedded frame or attacker page to send commands.',
          poc: line.trim(),
          remediation: 'Always check if (event.origin === TRUSTED_DOMAIN) before handling message data.',
        });
      }
    }
  }
}
