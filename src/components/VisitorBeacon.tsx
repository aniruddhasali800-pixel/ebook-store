'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Tells the shop a customer is here.
 *
 * The id is random, lives in sessionStorage (so a new tab is a new visitor and
 * closing the tab forgets it), and is never sent anywhere except this app's own
 * beacon endpoint. No cookie, no IP, no stored history — the dashboard answers
 * "is someone on the site now", and after ninety seconds it cannot answer
 * anything about them at all.
 */
export function VisitorBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    let stopped = false;

    const visitorId = () => {
      const KEY = 'upi_visitor_id';
      const existing = sessionStorage.getItem(KEY);
      if (existing) return existing;
      // crypto.randomUUID only exists in a secure context, and a shop opened as
      // http://192.168.x.x from a phone is not one. The id only has to be
      // unguessable-ish and stable per tab, so a weaker fallback is fine.
      const fresh =
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID().replace(/-/g, '')
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      sessionStorage.setItem(KEY, fresh);
      return fresh;
    };

    const send = (page: string) => {
      if (stopped) return;
      // keepalive lets the ping survive the tab closing mid-navigation.
      fetch('/api/visit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitorId: visitorId(), page }),
        keepalive: true,
      }).catch(() => {
        // Nothing on the page depends on this; a dropped beacon is invisible.
      });
    };

    send(pathname);
    const heartbeat = setInterval(() => send(window.location.pathname), 45_000);

    return () => {
      stopped = true;
      clearInterval(heartbeat);
    };
  }, [pathname]);

  return null;
}
