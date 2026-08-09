import React, { useState, useEffect, useRef } from 'react';
import { ShoppingBag, CreditCard, Truck, MessageSquare, RefreshCw, Pause, Users, Volume2 } from 'lucide-react';

export default function OrderDispatch() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [playingAudio, setPlayingAudio] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchOrders() {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) setOrders(await res.json());
    } catch {}
  }

  function toggleAudio(callId) {
    if (playingAudio === callId) {
      audioRef.current?.pause();
      setPlayingAudio(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(`/api/calls/${callId}/audio`);
      audio.onended = () => setPlayingAudio(null);
      audio.play().catch(() => {});
      audioRef.current = audio;
      setPlayingAudio(callId);
    }
  }

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const statusCounts = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
  };

  // Check if order has group items (items with "person" field)
  const isGroupOrder = (items) => items?.some(i => i.person);
  // Group items by person
  const groupByPerson = (items) => {
    const groups = {};
    (items || []).forEach(i => {
      const person = i.person || 'General';
      if (!groups[person]) groups[person] = [];
      groups[person].push(i);
    });
    return groups;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Orders & Kitchen Display</h2>
          <p className="page-subtitle">Real-time order dispatch, KDS tickets, audio dispute player, and payment tracking</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchOrders}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['all', 'pending', 'confirmed'].map(f => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({statusCounts[f]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <ShoppingBag className="empty-state-icon" />
            <h3>No orders yet</h3>
            <p>Complete a voice ordering session to see orders appear here in real-time</p>
          </div>
        </div>
      ) : (
        <div className="orders-grid">
          {filtered.map(order => {
            const hasGroup = isGroupOrder(order.items);
            const personGroups = hasGroup ? groupByPerson(order.items) : null;

            return (
              <div key={order.id} className={`order-card ${order.status}`}>
                <div className="order-header">
                  <span className="order-id">{order.ondc_order_id || `#${order.id}`}</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {hasGroup && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                        background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-violet)',
                        padding: '2px 8px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 600,
                      }}>
                        <Users size={10} /> Group
                      </span>
                    )}
                    <span className={`order-badge ${order.status}`}>{order.status}</span>
                  </div>
                </div>

                {/* Items List — grouped by person if group order */}
                {hasGroup && personGroups ? (
                  Object.entries(personGroups).map(([person, items]) => (
                    <div key={person} style={{ marginBottom: '8px' }}>
                      <div style={{
                        fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-violet)',
                        marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px',
                      }}>
                        👤 {person}
                      </div>
                      <ul className="order-items-list" style={{ marginLeft: '12px' }}>
                        {items.map((item, i) => (
                          <li key={i}>
                            <span>{item.quantity}× {item.name}</span>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(item.price || 0) * (item.quantity || 1)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <ul className="order-items-list">
                    {(order.items || []).map((item, i) => (
                      <li key={i}>
                        <span>{item.quantity}× {item.name}</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(item.price || 0) * (item.quantity || 1)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="order-total">
                  <span>Total</span>
                  <span style={{ color: 'var(--accent-emerald)' }}>₹{order.total_amount}</span>
                </div>

                <div className="order-meta">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Truck size={12} />
                    {order.dispatch_mode === 'ondc' ? 'ONDC' : 'Direct'}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CreditCard size={12} />
                    {order.payment_status}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MessageSquare size={12} />
                    SMS {order.sms_sent ? '✓' : '—'}
                  </span>
                </div>

                {/* ── Audio Dispute Player ── */}
                {order.call_id && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', marginTop: '8px', fontSize: '0.72rem' }}
                    onClick={() => toggleAudio(order.call_id)}
                  >
                    {playingAudio === order.call_id ? (
                      <><Pause size={12} /> Pause Recording</>
                    ) : (
                      <><Volume2 size={12} /> 🎧 Play Call Recording</>
                    )}
                  </button>
                )}

                {order.payment_link && (
                  <div style={{
                    marginTop: '10px', padding: '8px 12px', background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)',
                    color: 'var(--accent-cyan)', wordBreak: 'break-all',
                  }}>
                    💳 {order.payment_link}
                  </div>
                )}

                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  {new Date(order.created_at).toLocaleString()}
                  {order.caller_phone && order.caller_phone !== 'Browser' && ` · 📞 ${order.caller_phone}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
