import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, PhoneOff, Clock, RefreshCw, Phone } from 'lucide-react';

export default function VoiceAnalytics() {
  const [calls, setCalls] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchData() {
    try {
      const [callsRes, ordersRes] = await Promise.all([
        fetch('/api/calls'),
        fetch('/api/orders'),
      ]);
      if (callsRes.ok) setCalls(await callsRes.json());
      if (ordersRes.ok) setOrders(await ordersRes.json());
    } catch {} finally {
      setLoading(false);
    }
  }

  // ── Compute Analytics Metrics ──
  const totalCalls = calls.length;
  const completedCalls = calls.filter(c => c.status === 'completed').length;
  const activeCalls = calls.filter(c => c.status === 'active').length;
  const abandonedCalls = totalCalls - completedCalls - activeCalls;
  const completionRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;
  const avgDuration = completedCalls > 0
    ? Math.round(calls.filter(c => c.status === 'completed').reduce((s, c) => s + (c.duration_seconds || 0), 0) / completedCalls)
    : 0;
  const avgLatency = calls.filter(c => c.latency_avg_ms > 0).length > 0
    ? Math.round(calls.filter(c => c.latency_avg_ms > 0).reduce((s, c) => s + c.latency_avg_ms, 0) / calls.filter(c => c.latency_avg_ms > 0).length)
    : 0;

  const confirmedOrders = orders.filter(o => o.status === 'confirmed').length;
  const totalRevenue = orders.filter(o => o.status === 'confirmed').reduce((s, o) => s + (o.total_amount || 0), 0);
  const conversionRate = totalCalls > 0 ? Math.round((confirmedOrders / totalCalls) * 100) : 0;

  // ── Peak Hours (group calls by hour) ──
  const hourBuckets = Array(24).fill(0);
  calls.forEach(c => {
    const hour = new Date(c.started_at).getHours();
    hourBuckets[hour]++;
  });
  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
  const maxCallsInHour = Math.max(...hourBuckets, 1);

  // ── Most Ordered Items ──
  const itemCounts = {};
  orders.forEach(o => {
    (o.items || []).forEach(item => {
      const key = item.name || 'Unknown';
      itemCounts[key] = (itemCounts[key] || 0) + (item.quantity || 1);
    });
  });
  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxItemCount = topItems.length > 0 ? topItems[0][1] : 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Voice Analytics</h2>
          <p className="page-subtitle">Call performance, conversion rates, peak hours, and top menu items</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchData}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── KPI Metrics Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Calls', value: totalCalls, color: 'var(--accent-violet)', icon: Phone },
          { label: 'Completed', value: completedCalls, color: 'var(--accent-emerald)', icon: TrendingUp },
          { label: 'Abandoned', value: abandonedCalls, color: 'var(--accent-rose)', icon: PhoneOff },
          { label: 'Completion %', value: `${completionRate}%`, color: 'var(--accent-cyan)', icon: BarChart3 },
          { label: 'Avg Duration', value: `${avgDuration}s`, color: 'var(--accent-amber)', icon: Clock },
          { label: 'Avg Latency', value: `${avgLatency}ms`, color: avgLatency < 500 ? 'var(--accent-emerald)' : 'var(--accent-rose)', icon: Clock },
          { label: 'Conversion', value: `${conversionRate}%`, color: 'var(--accent-emerald)', icon: TrendingUp },
          { label: 'Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, color: 'var(--accent-amber)', icon: TrendingUp },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)', padding: '16px', textAlign: 'center',
          }}>
            <kpi.icon size={18} style={{ color: kpi.color, marginBottom: '6px' }} />
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: kpi.color, fontFamily: 'var(--font-mono)' }}>{kpi.value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* ── Peak Hours Chart ── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📊 Peak Ordering Hours</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-amber)' }}>
              Peak: {peakHour}:00 ({hourBuckets[peakHour]} calls)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '120px', padding: '8px 0' }}>
            {hourBuckets.map((count, hour) => (
              <div key={hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div
                  style={{
                    width: '100%',
                    height: `${Math.max(4, (count / maxCallsInHour) * 100)}px`,
                    background: hour === peakHour
                      ? 'var(--accent-amber)'
                      : count > 0 ? 'var(--accent-violet)' : 'var(--border-subtle)',
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.3s ease',
                    minHeight: '4px',
                  }}
                  title={`${hour}:00 — ${count} calls`}
                />
                {hour % 3 === 0 && (
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{hour}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Top Ordered Items ── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🔥 Most Ordered Items</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{topItems.length} items</span>
          </div>
          {topItems.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px' }}>
              <p>No orders yet — complete a voice session to see top items!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topItems.map(([name, count], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: '20px', textAlign: 'right' }}>#{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>×{count}</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--bg-input)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${(count / maxItemCount) * 100}%`,
                        background: i === 0 ? 'var(--accent-amber)' : 'var(--accent-violet)',
                        borderRadius: '3px', transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
