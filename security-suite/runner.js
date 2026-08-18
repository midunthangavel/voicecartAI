#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, watch } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { config } from './config.js';
import { ServerSandbox } from './sandboxes/server_sandbox.js';
import { ServerPentester } from './analyzers/server_pentester.js';
import { ClientAuditor } from './analyzers/client_auditor.js';
import { MobileAuditor } from './analyzers/mobile_auditor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse CLI Arguments
const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  const idx = args.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
  if (idx === -1) return defaultValue;
  if (args[idx].includes('=')) return args[idx].split('=')[1];
  return args[idx + 1] || true;
}

const targetArg = (getArg('--target') || 'all').toLowerCase();
const isLoop = args.includes('--loop') || args.includes('-l');
const isStrixOnly = args.includes('--strix');

async function runSecurityPipeline() {
  const startTime = Date.now();
  console.log('\x1b[1m\x1b[34m=================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[36m  🛡️  VoiceCart AI — Autonomous Security & Pentest Suite\x1b[0m');
  console.log('\x1b[1m\x1b[34m=================================================================\x1b[0m');
  console.log(`  \x1b[90mTarget:\x1b[0m \x1b[33m${targetArg.toUpperCase()}\x1b[0m | \x1b[90mTimestamp:\x1b[0m ${new Date().toLocaleString()}`);

  const allFindings = [];

  // 1. Client Security Audit
  if (targetArg === 'all' || targetArg === 'client') {
    try {
      const clientAuditor = new ClientAuditor();
      const findings = await clientAuditor.runAll();
      allFindings.push(...findings);
    } catch (err) {
      console.error(`\x1b[31m[Client Audit Error]\x1b[0m`, err.message);
    }
  }

  // 2. Mobile Security Audit
  if (targetArg === 'all' || targetArg === 'mobile') {
    try {
      const mobileAuditor = new MobileAuditor();
      const findings = await mobileAuditor.runAll();
      allFindings.push(...findings);
    } catch (err) {
      console.error(`\x1b[31m[Mobile Audit Error]\x1b[0m`, err.message);
    }
  }

  // 3. Server Live Sandbox & Dynamic Pentest
  if (targetArg === 'all' || targetArg === 'server') {
    const sandbox = new ServerSandbox();
    try {
      await sandbox.start();
      const pentester = new ServerPentester(sandbox.baseUrl, sandbox.wsUrl);
      const findings = await pentester.runAll();
      allFindings.push(...findings);
    } catch (err) {
      console.error(`\x1b[31m[Server Pentest Error]\x1b[0m`, err.message);
    } finally {
      sandbox.stop();
    }
  }

  // 4. Strix AI Agent Invocation (if requested or standalone)
  if (isStrixOnly || targetArg === 'strix') {
    await runStrixWrapper();
  }

  // Generate Reports
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  generateReports(allFindings, duration);
}

function runStrixWrapper() {
  return new Promise((resolve) => {
    const scriptPath = resolve(__dirname, 'analyzers/strix_orchestrator.py');
    const py = spawn('python', [scriptPath, targetArg], {
      cwd: __dirname,
      stdio: 'inherit',
    });
    py.on('close', () => resolve());
    py.on('error', (err) => {
      console.warn(`[Strix Python Warning]`, err.message);
      resolve();
    });
  });
}

function generateReports(findings, duration) {
  if (!existsSync(config.reportsDir)) {
    mkdirSync(config.reportsDir, { recursive: true });
  }

  // Sort: CRITICAL > HIGH > MEDIUM > LOW > INFO
  const severityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
  findings.sort((a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0));

  const stats = {
    total: findings.length,
    critical: findings.filter((f) => f.severity === 'CRITICAL').length,
    high: findings.filter((f) => f.severity === 'HIGH').length,
    medium: findings.filter((f) => f.severity === 'MEDIUM').length,
    low: findings.filter((f) => f.severity === 'LOW').length,
  };

  // 1. JSON Report
  const jsonReportPath = resolve(config.reportsDir, 'audit_report.json');
  writeFileSync(
    jsonReportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        scanDurationSeconds: duration,
        target: targetArg,
        stats,
        findings,
      },
      null,
      2
    )
  );

  // 2. Markdown Report
  const mdReportPath = resolve(config.reportsDir, 'audit_report.md');
  let md = `# 🛡️ VoiceCart AI Security Audit & Pentest Report\n\n`;
  md += `> **Generated**: ${new Date().toUTCString()}  \n`;
  md += `> **Scan Target**: \`${targetArg.toUpperCase()}\` | **Duration**: \`${duration}s\`\n\n`;
  md += `## 📊 Executive Summary\n\n`;
  md += `| Severity | Count | Status |\n`;
  md += `| :--- | :---: | :--- |\n`;
  md += `| 🔴 **CRITICAL** | **${stats.critical}** | ${stats.critical > 0 ? '⚠️ Immediate Action Required' : '✅ Clear'} |\n`;
  md += `| 🟠 **HIGH** | **${stats.high}** | ${stats.high > 0 ? '⚠️ Patch Prior to Production' : '✅ Clear'} |\n`;
  md += `| 🟡 **MEDIUM** | **${stats.medium}** | ${stats.medium > 0 ? '⚡ Hardening Recommended' : '✅ Clear'} |\n`;
  md += `| 🟢 **LOW** | **${stats.low}** | ℹ️ Best Practice Optimization |\n\n`;

  md += `## 🔍 Detailed Vulnerability Findings\n\n`;

  if (findings.length === 0) {
    md += `🎉 **Zero vulnerabilities identified across scanned surfaces!**\n`;
  } else {
    findings.forEach((f, idx) => {
      const badge =
        f.severity === 'CRITICAL' ? '🔴 CRITICAL' :
        f.severity === 'HIGH' ? '🟠 HIGH' :
        f.severity === 'MEDIUM' ? '🟡 MEDIUM' : '🟢 LOW';

      md += `### ${idx + 1}. [${f.id}] ${f.title}\n\n`;
      md += `- **Severity**: \`${badge}\`\n`;
      md += `- **Target**: \`${f.target.toUpperCase()}\` (${f.file || f.endpoint || 'General'})\n`;
      md += `- **Category**: \`${f.category}\`\n\n`;
      md += `**Description**:\n${f.description}\n\n`;
      if (f.poc) {
        md += `**Proof of Concept (PoC)**:\n\`\`\`text\n${f.poc}\n\`\`\`\n\n`;
      }
      md += `**Remediation**:\n> 💡 ${f.remediation}\n\n---\n\n`;
    });
  }

  writeFileSync(mdReportPath, md);

  // Terminal Output
  console.log('\n\x1b[1m\x1b[32m================ Scan Complete ================\x1b[0m');
  console.log(`  ⏱️  Duration: \x1b[33m${duration}s\x1b[0m`);
  console.log(`  📋 Total Findings: \x1b[1m${stats.total}\x1b[0m`);
  console.log(`     🔴 Critical: \x1b[31m${stats.critical}\x1b[0m`);
  console.log(`     🟠 High:     \x1b[33m${stats.high}\x1b[0m`);
  console.log(`     🟡 Medium:   \x1b[36m${stats.medium}\x1b[0m`);
  console.log(`     🟢 Low:      \x1b[32m${stats.low}\x1b[0m`);
  console.log(`\n  📄 Markdown Report: \x1b[34m${mdReportPath}\x1b[0m`);
  console.log(`  📊 JSON Report:     \x1b[34m${jsonReportPath}\x1b[0m`);
  console.log('\x1b[1m\x1b[32m================================================\x1b[0m\n');
}

// Execution Entrypoint
if (isLoop) {
  console.log('\x1b[35m[Watch Mode Active]\x1b[0m Watching for changes in server, client, and mobile...');
  runSecurityPipeline();

  let debounceTimer = null;
  const watchPaths = [config.targets.server.path, config.targets.client.path, config.targets.mobile.path];

  watchPaths.forEach((p) => {
    try {
      watch(p, { recursive: true }, (event, filename) => {
        if (filename && (filename.includes('node_modules') || filename.includes('.git') || filename.includes('test_') || filename.includes('reports'))) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          console.log(`\n\x1b[33m[Change Detected]\x1b[0m ${filename} changed. Re-running pentest suite...`);
          runSecurityPipeline();
        }, 1000);
      });
    } catch {}
  });
} else {
  runSecurityPipeline();
}
