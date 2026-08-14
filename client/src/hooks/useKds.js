import { useState, useEffect, useCallback } from 'react';

const isLocal = typeof window !== 'undefined' &&
  (['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.startsWith('10.'));
const apiBase = isLocal ? '' : 'https://voicecartai.onrender.com';

/**
 * Custom Hook: Kitchen Display System (KDS) & Order Lifecycle
 * 
 * Fetches normalized orders with snapshot line items and provides
 * status transition handlers with optimistic UI updates.
 */
export function useKds(dashboardEvents = []) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/orders?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
        setError(null);
      } else {
        setError('Failed to fetch orders');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 8000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // React to incoming WebSocket order events
  useEffect(() => {
    if (dashboardEvents.length === 0) return;
    const latest = dashboardEvents[0];

    if (['order_confirmed', 'order_dispatched'].includes(latest?.type)) {
      fetchOrders();
    }
  }, [dashboardEvents, fetchOrders]);

  const updateOrderStatus = useCallback(async (orderId, newStatus) => {
    // Optimistic UI update
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: newStatus } : o))
    );

    try {
      const res = await fetch(`${apiBase}/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        fetchOrders(); // Revert on failure
      }
    } catch {
      fetchOrders();
    }
  }, [fetchOrders]);

  const filteredOrders = orders.filter(order => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'active') return ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);
    return order.status === filterStatus;
  });

  return {
    orders: filteredOrders,
    rawOrders: orders,
    loading,
    error,
    filterStatus,
    setFilterStatus,
    updateOrderStatus,
    refreshOrders: fetchOrders,
  };
}

export default useKds;
