import { useState, useEffect, useCallback } from 'react';
import {
  CustomerOrderSummaryDTO,
  CustomerOrderDetailDTO,
  fetchPortalOrders,
  fetchPortalOrder,
  acknowledgeOrderPromise,
} from './api';

export function usePortalOrders() {
  const [orders, setOrders] = useState<CustomerOrderSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPortalOrders();
      setOrders(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load customer orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { orders, loading, error, refresh: load };
}

export function usePortalOrderDetail(orderId: string) {
  const [order, setOrder] = useState<CustomerOrderDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPortalOrder(orderId);
      setOrder(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load order detail');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAcknowledge = async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      const updated = await acknowledgeOrderPromise(orderId);
      setOrder(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to acknowledge promise');
    } finally {
      setLoading(false);
    }
  };

  return { order, loading, error, refresh: load, acknowledge: handleAcknowledge };
}
