import { useState, useEffect, useRef, useCallback } from 'react';

const isLocal = typeof window !== 'undefined' &&
  (['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.startsWith('10.'));
const apiBase = isLocal ? '' : 'https://voicecartai.onrender.com';

/**
 * Custom Hook: Real-Time Dashboard WebSocket Coordinator
 * 
 * Manages WebSocket connection to /dashboard-ws, event buffering,
 * auto-reconnect backoff, and live metrics synchronization.
 */
export function useDashboardWs() {
  const [serverStatus, setServerStatus] = useState('connecting');
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({
    total_calls: 0,
    active_calls: 0,
    total_orders: 0,
    confirmed_orders: 0,
    revenue: 0,
    avg_latency_ms: 0,
  });

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setServerStatus('online');
      }
    } catch {
      setServerStatus('offline');
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  useEffect(() => {
    let reconnectAttempts = 0;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = isLocal ? window.location.host : 'voicecartai.onrender.com';
      const ws = new WebSocket(`${protocol}//${wsHost}/dashboard-ws`);

      ws.onopen = () => {
        setServerStatus('online');
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          setEvents(prev => [msg, ...prev].slice(0, 50));

          if (['order_confirmed', 'order_dispatched', 'call_started', 'call_ended'].includes(msg.type)) {
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
        setServerStatus('offline');
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts++), 10000);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [fetchStats]);

  const sendEvent = useCallback((type, payload = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...payload }));
    }
  }, []);

  return {
    serverStatus,
    events,
    stats,
    sendEvent,
    refreshStats: fetchStats,
    apiBase,
  };
}

export default useDashboardWs;
