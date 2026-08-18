#!/usr/bin/env python3
"""
Strix AI Penetration Testing Orchestrator
Integrates the open-source Strix AI agent framework (https://github.com/usestrix/strix)
for autonomous penetration testing of VoiceCart AI targets (server, client, mobile).
"""

import os
import sys
import json
import shutil
import subprocess
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT_DIR / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

def check_environment():
    """Verify prerequisites for running Strix."""
    has_docker = shutil.which("docker") is not None
    docker_running = False

    if has_docker:
        try:
            res = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
            docker_running = (res.returncode == 0)
        except Exception:
            docker_running = False

    has_strix = shutil.which("strix") is not None
    api_key = os.environ.get("LLM_API_KEY") or os.environ.get("GEMINI_API_KEY") or os.environ.get("OPENAI_API_KEY")

    return {
        "has_docker": has_docker,
        "docker_running": docker_running,
        "has_strix": has_strix,
        "has_api_key": bool(api_key),
        "llm_provider": os.environ.get("STRIX_LLM", "gemini/gemini-2.0-flash")
    }

def run_strix(target="server", endpoint="http://localhost:3999"):
    """Trigger Strix scan on the target."""
    env_status = check_environment()
    print("\n[Strix AI Orchestrator] Checking environment readiness...")
    print(f"  * Docker CLI Available: {'[YES]' if env_status['has_docker'] else '[NO]'}")
    print(f"  * Docker Daemon Running: {'[YES]' if env_status['docker_running'] else '[NO]'}")
    print(f"  * Strix CLI Installed: {'[YES]' if env_status['has_strix'] else '[NO]'}")
    print(f"  * LLM API Key Configured: {'[YES]' if env_status['has_api_key'] else '[NOT SET / DEFAULT]'}")

    if not env_status["docker_running"]:
        msg = "Docker daemon is not running. Strix requires Docker to launch isolated agent sandboxes."
        print(f"\033[33m[Strix Notice]\033[0m {msg}")
        return {
            "status": "SKIPPED",
            "reason": msg,
            "findings": []
        }

    if not env_status["has_strix"]:
        msg = "Strix CLI is not installed. Install via: pip install strix-agent"
        print(f"\033[33m[Strix Notice]\033[0m {msg}")
        return {
            "status": "SKIPPED",
            "reason": msg,
            "findings": []
        }

    # Run Strix scan
    cmd = ["strix", "-n", "--target", endpoint]
    print(f"\033[36m[Strix Executing]\033[0m Running: {' '.join(cmd)}")
    
    try:
        proc = subprocess.run(cmd, cwd=str(ROOT_DIR), capture_output=True, text=True, timeout=600)
        print(f"\033[32m[Strix Completed]\033[0m Exit Code: {proc.returncode}")
        
        # Check strix_runs output directory if generated
        findings = parse_strix_output()
        return {
            "status": "COMPLETED",
            "returncode": proc.returncode,
            "findings": findings
        }
    except subprocess.TimeoutExpired:
        return {"status": "TIMEOUT", "findings": []}
    except Exception as e:
        return {"status": "ERROR", "error": str(e), "findings": []}

def parse_strix_output():
    """Parse output reports from strix_runs/ directory."""
    runs_dir = ROOT_DIR / "strix_runs"
    findings = []
    if not runs_dir.exists():
        return findings

    for run_file in runs_dir.glob("**/*.json"):
        try:
            with open(run_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    findings.extend(data)
                elif isinstance(data, dict) and "vulnerabilities" in data:
                    findings.extend(data["vulnerabilities"])
        except Exception:
            pass
    return findings

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    res = run_strix(target=target)
    out_file = REPORTS_DIR / "strix_latest.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=2)
    print(f"Strix audit summary saved to {out_file}")
