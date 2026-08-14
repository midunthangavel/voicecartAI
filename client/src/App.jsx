import React, { useState, useEffect } from 'react';
import { Phone, ShoppingBag, IndianRupee, Zap, Activity, TrendingUp, Smartphone } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import VoiceSimulator from './components/VoiceSimulator.jsx';
import LiveCallMonitor from './components/LiveCallMonitor.jsx';
import OrderDispatch from './components/OrderDispatch.jsx';
import CatalogManager from './components/CatalogManager.jsx';
import VoiceAnalytics from './components/VoiceAnalytics.jsx';
import MobileCallView from './components/MobileCallView.jsx';
import { useDashboardWs } from './hooks/useDashboardWs.js';

export default function App() {
  const [activeView, setActiveView] = useState('simulator');
  const [theme, setTheme] = useState(() => localStorage.getItem('voicecart_theme') || 'dark');

  const { serverStatus, events, stats } = useDashboardWs();

  // ── Sync theme with html root ──
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('voicecart_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  const isCallRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/call');

  // ── Render Mobile Full Screen Call Mode if on /call or mobile view ──
  if (activeView === 'mobile-call' || isCallRoute) {
    return <MobileCallView />;
  }

  const statCards = [
    { label: 'Total Inbound Calls', value: stats.total_calls, color: 'violet', icon: Phone },
    { label: 'Active Live Calls', value: stats.active_calls, color: 'emerald', icon: Activity, isLive: stats.active_calls > 0 },
    { label: 'Orders Placed', value: stats.total_orders, color: 'cyan', icon: ShoppingBag },
    { label: 'Confirmed & Paid', value: stats.confirmed_orders, color: 'emerald', icon: TrendingUp },
    { label: 'Revenue Generated', value: `₹${(stats.revenue || 0).toLocaleString('en-IN')}`, color: 'amber', icon: IndianRupee },
    { label: 'Avg Turn Latency', value: `${stats.avg_latency_ms || 0}ms`, color: 'rose', icon: Zap },
  ];

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        activeCalls={stats.active_calls}
        serverStatus={serverStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🍛 Sree Annapoorna <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 400 }}>· RS Puram, Coimbatore</span>
            </h1>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              AI Voice Ordering Engine · Exotel / WhatsApp / ONDC Integration
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setActiveView('mobile-call')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', borderColor: 'var(--accent-violet)', color: 'var(--accent-violet)' }}
            >
              <Smartphone size={14} /> Open Mobile View
            </button>
          </div>
        </div>

        {/* Top Metrics Cards Bar */}
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          {statCards.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div key={i} className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-label">{stat.label}</span>
                  <div className={`stat-icon-wrapper ${stat.color}`}>
                    <Icon size={16} />
                  </div>
                </div>
                <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {stat.value}
                  {stat.isLive && (
                    <span className="status-dot live" style={{ width: 8, height: 8 }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* View Switcher */}
        {activeView === 'simulator' && <VoiceSimulator />}
        {activeView === 'calls' && <LiveCallMonitor />}
        {activeView === 'orders' && <OrderDispatch events={events} />}
        {activeView === 'catalog' && <CatalogManager />}
        {activeView === 'analytics' && <VoiceAnalytics />}
      </main>
    </div>
  );
}
