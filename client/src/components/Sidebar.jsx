import React, { useState, useEffect } from 'react';
import { Mic, MonitorSpeaker, ShoppingBag, BookOpen, BarChart3, ShieldCheck, Zap, Sun, Moon, Cpu, Radio, Volume2 } from 'lucide-react';

const navItems = [
  { id: 'simulator', label: 'Voice Simulator', icon: Mic },
  { id: 'calls', label: 'Live Calls', icon: MonitorSpeaker },
  { id: 'orders', label: 'Orders & KDS', icon: ShoppingBag },
  { id: 'catalog', label: 'Catalog & Hints', icon: BookOpen },
  { id: 'analytics', label: 'Voice Analytics', icon: BarChart3 },
  { id: 'enterprise', label: 'Enterprise & Reliability', icon: ShieldCheck },
];

export default function Sidebar({ activeView, onNavigate, activeCalls, serverStatus, theme, onToggleTheme }) {
  const [engineStatus, setEngineStatus] = useState(null);

  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.startsWith('10.');
  const apiBase = isLocal ? '' : 'https://voicecartai.onrender.com';

  useEffect(() => {
    async function fetchEngineStatus() {
      try {
        const res = await fetch(`${apiBase}/api/engine-status`);
        if (res.ok) {
          setEngineStatus(await res.json());
        }
      } catch {}
    }
    fetchEngineStatus();
    const interval = setInterval(fetchEngineStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const llmName = engineStatus?.llm?.provider === 'groq' ? 'Groq Llama 3.3'
    : engineStatus?.llm?.provider === 'openrouter' ? 'OpenRouter Qwen'
    : engineStatus?.llm?.provider === 'gemini' ? 'Gemini Flash'
    : 'Gemini (Auto)';

  const sttName = engineStatus?.stt?.provider === 'groq' ? 'Groq Whisper'
    : engineStatus?.stt?.provider === 'google' ? 'Google STT'
    : 'Mock STT';

  const ttsName = engineStatus?.tts?.provider === 'sarvam' ? 'Sarvam Bulbul'
    : engineStatus?.tts?.provider === 'google' ? 'Google TTS'
    : 'Mock TTS';

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Zap size={20} color="white" />
        </div>
        <div className="sidebar-brand-text">
          <h1>VoiceCart AI</h1>
          <span>Operations Dashboard</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <div
            key={item.id}
            className={`sidebar-nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon className="icon" size={19} />
            <span>{item.label}</span>
            {item.id === 'calls' && activeCalls > 0 && (
              <span className="sidebar-badge badge-live">{activeCalls}</span>
            )}
          </div>
        ))}
      </nav>

      {/* Engine Status & Theme Footer */}
      <div className="sidebar-footer">
        {/* Active AI Stack Badge */}
        <div className="sidebar-engine-card">
          <div className="engine-card-header">
            <Cpu size={13} color="var(--accent-violet)" />
            <span>Active AI Pipeline</span>
          </div>
          <div className="engine-pills">
            <div className="engine-pill" title="LLM Intent & Dialogue Engine">
              <span className="pill-dot live" />
              <span className="pill-label">LLM:</span>
              <span className="pill-val">{llmName}</span>
            </div>
            <div className="engine-pill" title="Speech to Text Engine">
              <Radio size={11} className="pill-icon" />
              <span className="pill-label">STT:</span>
              <span className="pill-val">{sttName}</span>
            </div>
            <div className="engine-pill" title="Voice Synthesis Engine">
              <Volume2 size={11} className="pill-icon" />
              <span className="pill-label">TTS:</span>
              <span className="pill-val">{ttsName}</span>
            </div>
          </div>
        </div>

        <div
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          <div className="theme-toggle-icon">
            {theme === 'dark' ? <Sun size={15} color="#f59e0b" /> : <Moon size={15} color="#8b5cf6" />}
          </div>
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </div>

        <div className="sidebar-status" style={{ marginTop: '10px' }}>
          <div className={`status-dot ${serverStatus === 'online' ? '' : 'offline'}`} />
          <span>{serverStatus === 'online' ? 'Server Connected' : 'Disconnected'}</span>
        </div>
      </div>
    </aside>
  );
}
