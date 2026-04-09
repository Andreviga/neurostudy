'use client';
import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSupported('serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY);
  }, []);

  async function subscribe() {
    if (!supported || loading) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const token = localStorage.getItem('ns_token');
      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      setSubscribed(true);
    } catch (err) {
      console.error('Push subscribe failed', err);
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    if (loading) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('ns_token');
      await fetch(`${API_BASE}/api/push/unsubscribe`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }

  return { supported, subscribed, loading, subscribe, unsubscribe };
}
