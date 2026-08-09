import React from 'react';
import { Mic, MonitorSpeaker, ShoppingBag, BookOpen, BarChart3, Zap, Sun, Moon } from 'lucide-react';

const navItems = [
  { id: 'simulator', label: 'Voice Simulator', icon: Mic },
  { id: 'calls', label: 'Live Calls', icon: MonitorSpeaker },
  { id: 'orders', label: 'Orders & KDS', icon: ShoppingBag },
  { id: 'catalog', label: 'Catalog & Hints', icon: BookOpen },
  { id: 'analytics', label: 'Voice Analytics', icon: BarChart3 },
];

export default function Sidebar({ activeView, onNavigate, activeCalls, serverStatus, theme, onToggleTheme }) {
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

      {/* Theme Toggle + Server Status */}
      <div className="sidebar-footer">
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

        <div className="sidebar-status" style={{ marginTop: '12px' }}>
          <div className={`status-dot ${serverStatus === 'online' ? '' : 'offline'}`} />
          <span>{serverStatus === 'online' ? 'Server Connected' : 'Disconnected'}</span>
        </div>
      </div>
    </aside>
  );
}
