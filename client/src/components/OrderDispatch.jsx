import React, { useState, useRef } from 'react';
import { ShoppingBag, CreditCard, Truck, MessageSquare, RefreshCw, Pause, Users, Volume2, ChefHat, CheckCircle2, Clock } from 'lucide-react';
import { useKds } from '../hooks/useKds.js';

export default function OrderDispatch({ events = [] }) {
  const {
    orders,
    rawOrders,
    loading,
    filterStatus,
    setFilterStatus,
    updateOrderStatus,
    refreshOrders,
  } = useKds(events);

  const [playingAudio, setPlayingAudio] = useState(null);
  const audioRef = useRef(null);

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

  const statusCounts = {
    all: rawOrders.length,
    active: rawOrders.filter(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)).length,
    confirmed: rawOrders.filter(o => o.status === 'confirmed').length,
    preparing: rawOrders.filter(o => o.status === 'preparing').length,
    ready: rawOrders.filter(o => o.status === 'ready').length,
    completed: rawOrders.filter(o => o.status === 'completed').length,
  };

  const isGroupOrder = (items) => Array.isArray(items) && items.some(i => i.person);
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
          <h2 className="page-title">Orders & Kitchen Display System (KDS)</h2>
          <p className="page-subtitle">Real-time order tickets, preparation status transitions, dispute audio, and snapshot pricing</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refreshOrders}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'All Orders' },
          { id: 'active', label: 'Active Pipeline' },
          { id: 'confirmed', label: 'Confirmed' },
          { id: 'preparing', label: 'In Kitchen' },
          { id: 'ready', label: 'Ready for Pickup' },
          { id: 'completed', label: 'Completed' },
        ].map(tab => (
          <button
            key={tab.id}
            className={`btn btn-sm ${filterStatus === tab.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilterStatus(tab.id)}
          >
            {tab.label} ({statusCounts[tab.id] || 0})
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <ShoppingBag className="empty-state-icon" />
            <h3>No orders matching filter</h3>
            <p>Complete a voice ordering session or place an order to see live KDS tickets</p>
          </div>
        </div>
      ) : (
        <div className="orders-grid">
          {orders.map(order => {
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

                {/* Items List */}
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
                            <span>{item.quantity}× {item.name || item.item_name_snapshot}</span>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(item.price || item.unit_price_snapshot || 0) * (item.quantity || 1)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <ul className="order-items-list">
                    {(order.items || []).map((item, i) => (
                      <li key={i}>
                        <span>{item.quantity}× {item.name || item.item_name_snapshot}</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>₹{(item.price || item.unit_price_snapshot || 0) * (item.quantity || 1)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="order-total">
                  <span>Total</span>
                  <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>₹{order.total_amount}</span>
                </div>

                {/* KDS Status Action Controls */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                  {order.status === 'confirmed' && (
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ flex: 1, fontSize: '0.72rem' }}
                      onClick={() => updateOrderStatus(order.id, 'preparing')}
                    >
                      <ChefHat size={12} /> Start Cooking
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ flex: 1, fontSize: '0.72rem', background: 'var(--accent-cyan)' }}
                      onClick={() => updateOrderStatus(order.id, 'ready')}
                    >
                      <Clock size={12} /> Mark Ready
                    </button>
                  )}
                  {['ready', 'dispatched'].includes(order.status) && (
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ flex: 1, fontSize: '0.72rem', borderColor: 'var(--accent-emerald)', color: 'var(--accent-emerald)' }}
                      onClick={() => updateOrderStatus(order.id, 'completed')}
                    >
                      <CheckCircle2 size={12} /> Complete
                    </button>
                  )}
                </div>

                <div className="order-meta" style={{ marginTop: '10px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Truck size={12} />
                    {order.dispatch_mode === 'ondc' ? 'ONDC' : 'Direct POS'}
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

                {/* Dispute Status & Actions */}
                {order.dispute_status && order.dispute_status !== 'none' && (
                  <div style={{
                    marginTop: '8px', padding: '6px 10px',
                    background: order.dispute_status === 'refunded' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${order.dispute_status === 'refunded' ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
                    borderRadius: 'var(--radius-sm)', fontSize: '0.72rem',
                    color: order.dispute_status === 'refunded' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>⚠️ Dispute: <strong>{order.dispute_status.toUpperCase()}</strong></span>
                    {order.dispute_status === 'pending_review' && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className="btn btn-sm"
                          style={{ background: 'var(--accent-emerald)', color: '#fff', padding: '2px 6px', fontSize: '0.65rem' }}
                          onClick={async () => {
                            await fetch(`/api/orders/${order.id}/resolve-dispute`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ resolution: 'refund', notes: 'Refund approved by store manager' }),
                            });
                            refreshOrders();
                          }}
                        >
                          Refund
                        </button>
                        <button
                          className="btn btn-sm btn-ghost"
                          style={{ padding: '2px 6px', fontSize: '0.65rem', borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}
                          onClick={async () => {
                            await fetch(`/api/orders/${order.id}/resolve-dispute`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ resolution: 'reject', notes: 'Dispute investigated and dismissed' }),
                            });
                            refreshOrders();
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Audio Dispute Player */}
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

                {/* Raise Dispute button if no active dispute */}
                {(!order.dispute_status || order.dispute_status === 'none') && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', marginTop: '6px', fontSize: '0.68rem', color: 'var(--text-muted)' }}
                    onClick={async () => {
                      const reason = prompt('Enter reason for customer dispute:');
                      if (reason) {
                        await fetch(`/api/orders/${order.id}/dispute`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ reason }),
                        });
                        refreshOrders();
                      }
                    }}
                  >
                    Flag Customer Dispute
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
