import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join, extname } from 'path';
import { config } from '../config.js';

export class MobileAuditor {
  constructor(mobileDir = null) {
    this.mobileDir = mobileDir || config.targets.mobile.path;
    this.findings = [];
  }

  async runAll() {
    console.log(`\n\x1b[35m[Auditor: Mobile]\x1b[0m Commencing static and security audit for Mobile App (${this.mobileDir})...`);

    this.checkAppJson();

    const files = this._getFiles(this.mobileDir);
    for (const filePath of files) {
      // Exclude node_modules and dot folders
      if (filePath.includes('node_modules') || filePath.includes('.expo')) continue;

      const content = readFileSync(filePath, 'utf-8');
      const relPath = filePath.replace(this.mobileDir, '').replace(/^[\\/]/, '');

      this.checkHardcodedSecrets(relPath, content);
      this.checkCleartextTraffic(relPath, content);
      this.checkInsecureStorage(relPath, content);
      this.checkDeepLinkHandling(relPath, content);
    }

    return this.findings;
  }

  _recordFinding({ id, title, severity, category, file, line, description, poc, remediation }) {
    this.findings.push({
      id,
      title,
      severity,
      category,
      target: 'mobile',
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
          if (!file.startsWith('.') && file !== 'node_modules') {
            results = results.concat(this._getFiles(fullPath));
          }
        } else if (['.js', '.jsx', '.ts', '.tsx', '.json'].includes(extname(fullPath))) {
          results.push(fullPath);
        }
      }
    } catch {}
    return results;
  }

  // 1. Mobile Config & Permissions in app.json
  checkAppJson() {
    const appJsonPath = resolve(this.mobileDir, 'app.json');
    if (!existsSync(appJsonPath)) return;

    try {
      const appConfig = JSON.parse(readFileSync(appJsonPath, 'utf-8'));
      const expo = appConfig.expo || {};

      // Check scheme
      if (!expo.scheme) {
        this._recordFinding({
          id: 'SEC-MOB-CFG-001',
          title: 'Missing Custom URL Scheme in app.json',
          severity: 'LOW',
          category: 'Mobile Configuration',
          file: 'app.json',
          line: 1,
          description: 'No custom URL scheme is defined for deep linking into VoiceCart mobile application.',
          poc: '"scheme": undefined',
          remediation: 'Add a specific scheme (e.g. "scheme": "voicecart") to enable secure deep linking.',
        });
      }
    } catch {}
  }

  // 2. Hardcoded Secrets in Mobile Source
  checkHardcodedSecrets(file, content) {
    const patterns = [
      { regex: /(?:rzp_live_[a-zA-Z0-9]{14,})/g, name: 'Razorpay Live Key', severity: 'CRITICAL' },
      { regex: /(?:sk_live_[a-zA-Z0-9]{24,})/g, name: 'Stripe Live Secret Key', severity: 'CRITICAL' },
      { regex: /(?:AIzaSy[a-zA-Z0-9_-]{33})/g, name: 'Google API Key', severity: 'HIGH' },
      { regex: /(?:Bearer\s+[a-zA-Z0-9_\-\.]{30,})/g, name: 'Hardcoded Bearer Token', severity: 'HIGH' },
    ];

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const p of patterns) {
        if (p.regex.test(lines[i])) {
          this._recordFinding({
            id: `SEC-MOB-SECRET-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
            title: `Hardcoded Secret in Mobile App: ${p.name}`,
            severity: p.severity,
            category: 'Credential Exposure',
            file,
            line: i + 1,
            description: `Mobile application code contains hardcoded ${p.name}. Mobile binaries can be easily decompiled with APKTool/JADX.`,
            poc: lines[i].trim().slice(0, 100),
            remediation: 'Never include private API keys in client-side mobile applications. Delegate requests to VoiceCart backend.',
          });
        }
      }
    }
  }

  // 3. Cleartext HTTP Network Traffic
  checkCleartextTraffic(file, content) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match http:// URLs except localhost/127.0.0.1
      if (/http:\/\/(?!localhost|127\.0\.0\.1|10\.0\.2\.2)[a-zA-Z0-9.-]+/i.test(line)) {
        this._recordFinding({
          id: 'SEC-MOB-NET-001',
          title: 'Insecure Cleartext HTTP Protocol in Mobile Code',
          severity: 'HIGH',
          category: 'Transport Layer Security',
          file,
          line: i + 1,
          description: 'Mobile app makes network requests over unencrypted HTTP, vulnerable to MITM interception on public Wi-Fi.',
          poc: line.trim().slice(0, 100),
          remediation: 'Enforce HTTPS (https://) and WSS (wss://) across all mobile networking calls.',
        });
      }
    }
  }

  // 4. Insecure Storage (AsyncStorage vs SecureStore)
  checkInsecureStorage(file, content) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/AsyncStorage\.setItem\s*\(\s*['"](?:jwt|token|password|auth_token)['"]/i.test(line)) {
        this._recordFinding({
          id: 'SEC-MOB-STORE-001',
          title: 'Sensitive Token Stored in Unencrypted AsyncStorage',
          severity: 'MEDIUM',
          category: 'Insecure Data Storage',
          file,
          line: i + 1,
          description: 'AsyncStorage is unencrypted on device storage and can be extracted on rooted/jailbroken devices.',
          poc: line.trim(),
          remediation: 'Use expo-secure-store (Keychain on iOS, EncryptedSharedPreferences on Android) for sensitive tokens.',
        });
      }
    }
  }

  // 5. Deep Link Input Sanitization
  checkDeepLinkHandling(file, content) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/Linking\.addEventListener\s*\(\s*['"]url['"]/.test(line) && !content.includes('encodeURI') && !content.includes('URL(')) {
        this._recordFinding({
          id: 'SEC-MOB-LINK-001',
          title: 'Unvalidated Deep Link Handler',
          severity: 'LOW',
          category: 'Input Validation',
          file,
          line: i + 1,
          description: 'Incoming deep link URLs should be strictly parsed and validated against expected route schemes.',
          poc: line.trim(),
          remediation: 'Validate deep link path and parameters before triggering navigation state changes.',
        });
      }
    }
  }
}
