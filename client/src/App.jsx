import React, { useState, useEffect } from 'react';
import { Phone, ShoppingBag, IndianRupee, Zap, Activity, TrendingUp, Smartphone, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import VoiceSimulator from './components/VoiceSimulator.jsx';
import LiveCallMonitor from './components/LiveCallMonitor.jsx';
import OrderDispatch from './components/OrderDispatch.jsx';
import CatalogManager from './components/CatalogManager.jsx';
import VoiceAnalytics from './components/VoiceAnalytics.jsx';
import EnterpriseConsole from './components/EnterpriseConsole.jsx';
import MobileCallView from './components/MobileCallView.jsx';
import LoginModal from './components/LoginModal.jsx';
import { useDashboardWs } from './hooks/useDashboardWs.js';
import { getStoredUser, clearSession } from './services/apiClient.js';

export default function App() {
  const [activeView, setActiveView] = useState('simulator');
  const [theme, setTheme] = useState(() => localStorage.getItem('voicecart_theme') || 'dark');
  const [user, setUser] = useState(() => getStoredUser());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const { serverStatus, events, stats } = useDashboardWs();

  // ── Sync theme with html root ──
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('voicecart_theme', theme);
  }, [theme]);

  // ── Listen for auth changes ──
  useEffect(() => {
    const handleAuthChange = () => setUser(getStoredUser());
    window.addEventListener('voicecart_auth_change', handleAuthChange);
    return () => window.removeEventListener('voicecart_auth_change', handleAuthChange);
  }, []);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

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

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px 10px' }}>
                <ShieldCheck size={14} color="#10b981" />
                <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{user.name || user.email}</span>
                <span style={{ fontSize: '0.70rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 700 }}>
                  {user.role}
                </span>
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-muted)' }}
                >
                  <LogOut size={13} />
                </button>
              </div>
            ) : (
              <button
                className="btn btn-sm"
                onClick={() => setIsLoginModalOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', background: '#10b981', color: '#0f1117', fontWeight: 700 }}
              >
                <LogIn size={14} /> Staff Sign In
              </button>
            )}

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
        {activeView === 'enterprise' && <EnterpriseConsole />}
      </main>

      {/* Login Authentication Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={(authedUser) => setUser(authedUser)}
      />
    </div>
  );
}
