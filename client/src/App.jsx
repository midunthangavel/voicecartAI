import React, { useState, useEffect, useRef } from 'react';
import { Phone, ShoppingBag, IndianRupee, Zap, Activity, TrendingUp } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import VoiceSimulator from './components/VoiceSimulator.jsx';
import LiveCallMonitor from './components/LiveCallMonitor.jsx';
import OrderDispatch from './components/OrderDispatch.jsx';
import CatalogManager from './components/CatalogManager.jsx';
import VoiceAnalytics from './components/VoiceAnalytics.jsx';

export default function App() {
  const [activeView, setActiveView] = useState('simulator');
  const [theme, setTheme] = useState(() => localStorage.getItem('voicecart_theme') || 'dark');
  const [stats, setStats] = useState({
    total_calls: 0, active_calls: 0, total_orders: 0,
    confirmed_orders: 0, revenue: 0, avg_latency_ms: 0,
  });
  const [serverStatus, setServerStatus] = useState('offline');
  const [realtimeEvents, setRealtimeEvents] = useState([]);
  const dashboardWs = useRef(null);

  // ── Sync theme with html root ──
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('voicecart_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  // ── Fetch stats ──
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 4000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        setStats(await res.json());
        setServerStatus('online');
      } else {
        setServerStatus('offline');
      }
    } catch {
      setServerStatus('offline');
    }
  }

  // ── Dashboard WebSocket for real-time events ──
  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/dashboard-ws`);

      ws.onopen = () => {
        console.log('[Dashboard WS] Connected');
        setServerStatus('online');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          setRealtimeEvents(prev => [msg, ...prev].slice(0, 50));

          if (['order_confirmed', 'call_started', 'call_ended'].includes(msg.type)) {
            fetchStats();
          }

          if (msg.type === 'call_started') {
            setStats(prev => ({ ...prev, active_calls: prev.active_calls + 1 }));
          } else if (msg.type === 'call_ended') {
            setStats(prev => ({ ...prev, active_calls: Math.max(0, prev.active_calls - 1) }));
          }
        } catch {}
      };

      ws.onclose = () => {
        console.log('[Dashboard WS] Disconnected, reconnecting in 3s...');
        setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
      dashboardWs.current = ws;
    }

    connect();
    return () => dashboardWs.current?.close();
  }, []);

  const statCards = [
    { label: 'Total Calls', value: stats.total_calls, color: 'violet', icon: Phone },
    { label: 'Active Now', value: stats.active_calls, color: 'emerald', icon: Activity },
    { label: 'Orders', value: stats.confirmed_orders, color: 'cyan', icon: ShoppingBag },
    { label: 'Revenue', value: `₹${stats.revenue.toLocaleString('en-IN')}`, color: 'amber', icon: IndianRupee },
    { label: 'Avg Latency', value: `${stats.avg_latency_ms}ms`, color: stats.avg_latency_ms < 500 ? 'emerald' : stats.avg_latency_ms < 1000 ? 'amber' : 'rose', icon: Zap },
    { label: 'Conversion', value: stats.total_calls > 0 ? `${Math.round((stats.confirmed_orders / stats.total_calls) * 100)}%` : '—', color: 'blue', icon: TrendingUp },
  ];

  return (
    <div className="app-layout">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        activeCalls={stats.active_calls}
        serverStatus={serverStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="main-content">
        {/* ── Stats Bar (always visible) ── */}
        <div className="stats-grid">
          {statCards.map((stat, i) => (
            <div key={i} className={`stat-card ${stat.color}`}>
              <div className={`stat-icon ${stat.color}`}>
                <stat.icon size={18} />
              </div>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ── Active View ── */}
        {activeView === 'simulator' && (
          <>
            <div className="page-header">
              <div>
                <h2 className="page-title">Voice Simulator & Inspector</h2>
                <p className="page-subtitle">Test voice ordering directly in your browser — type or speak, see STT → Dialogue → TTS in real time</p>
              </div>
            </div>
            <VoiceSimulator />
          </>
        )}

        {activeView === 'calls' && <LiveCallMonitor />}
        {activeView === 'orders' && <OrderDispatch />}
        {activeView === 'catalog' && <CatalogManager />}
        {activeView === 'analytics' && <VoiceAnalytics />}
      </main>
    </div>
  );
}
