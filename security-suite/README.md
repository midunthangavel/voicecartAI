# 🛡️ VoiceCart AI — Autonomous Security & Pentest Suite

A completely isolated Red-Team, Penetration Testing & Vulnerability Audit module for **VoiceCart AI**. 

It operates independently without polluting or coupling with the main application codebases (`server/`, `client/`, `mobile/`).

---

## 🚀 Quick Start

### 1. Run a Full Security Audit (Server, Client & Mobile)
From within the `security-suite` directory:
```bash
node runner.js --target all
```
Or from the root directory:
```bash
node security-suite/runner.js --target all
```

### 2. Audit Specific Subsystems
```bash
# Audit backend API, WebSockets, webhooks & auth in an isolated sandbox
node runner.js --target server

# Audit web frontend for exposed secrets, XSS sinks, and insecure storage
node runner.js --target client

# Audit React Native / Expo mobile codebase for hardcoded keys, cleartext traffic & deep links
node runner.js --target mobile
```

### 3. Continuous Develop-Hack-Fix Loop (`--loop`)
Watches `server/`, `client/`, and `mobile/` for code changes. Whenever you edit or fix code, it automatically re-runs the pentest suite and verifies resolution:
```bash
node runner.js --target all --loop
```

---

## 🤖 Strix AI Autonomous Pentesting Integration

The suite includes integration with [usestrix/strix](https://github.com/usestrix/strix) for AI-driven multi-agent penetration testing.

### Prerequisites for Strix:
1. **Docker**: Ensure Docker Desktop / daemon is running.
2. **Strix CLI**:
   ```bash
   pip install strix-agent
   ```
3. **Set your LLM Key** (OpenAI, Gemini, Anthropic, or local Ollama):
   ```bash
   export STRIX_LLM="gemini/gemini-2.0-flash"
   export LLM_API_KEY="your-api-key"
   ```

### Run Strix Autonomous Scan:
```bash
node runner.js --strix
# OR directly
python analyzers/strix_orchestrator.py
```

*Note: If Docker is not running on your machine, the suite automatically runs the high-speed Native Pentesting Engine so your develop-hack-fix loop is never blocked.*

---

## 📊 Security Reports

Every scan automatically generates structured reports in `security-suite/reports/`:
* 📄 **Markdown Report**: `reports/audit_report.md` (Executive summary, severity table, PoC requests, and remediation diffs)
* 📊 **JSON Report**: `reports/audit_report.json` (Machine-readable for CI/CD pipelines)

---

## 🔒 Threat Surfaces Evaluated

| Component | Target | Tests Performed |
| :--- | :--- | :--- |
| **Server** | `../server` | Webhook forgery (Twilio/Razorpay), Parameter manipulation, IDOR, SQLi, JWT tampering, Rate limiting, WebSocket floods |
| **Client** | `../client` | Leaked API secrets, React `dangerouslySetInnerHTML`, DOM XSS sinks, Insecure `localStorage` credentials, `postMessage` origins |
| **Mobile** | `../mobile` | Hardcoded live keys, Cleartext `http://` traffic, Unencrypted `AsyncStorage` tokens, Deep link input validation |
