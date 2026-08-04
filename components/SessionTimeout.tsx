'use client';

import { useEffect } from 'react';
import { createClient } from '../lib/supabase';

/** Log out after this much idle time (no clicks / keys / scrolls). */
const IDLE_MS = 24 * 60 * 60 * 1000; // 24 hours

const STORAGE_KEY = 'wod_last_activity';

/** How often we check idle time while the tab is open */
const CHECK_EVERY_MS = 5 * 60 * 1000; // 5 minutes

/** Don't write to localStorage on every mouse move */
const ACTIVITY_THROTTLE_MS = 60 * 1000; // 1 minute

function touchActivity() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // private mode / blocked storage — ignore
  }
}

function getLastActivity(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return Date.now();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : Date.now();
  } catch {
    return Date.now();
  }
}

/**
 * Soft session policy (option A):
 * - Stay logged in across browser restarts while user is active
 * - After 24h with no activity → sign out and send to /login
 */
export default function SessionTimeout() {
  useEffect(() => {
    const supabase = createClient();
    let lastWrite = 0;
    let stopped = false;

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < ACTIVITY_THROTTLE_MS) return;
      lastWrite = now;
      touchActivity();
    };

    const maybeLogout = async () => {
      if (stopped) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const idleFor = Date.now() - getLastActivity();
      if (idleFor < IDLE_MS) return;

      stopped = true;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      await supabase.auth.signOut();
      // Full navigation so all client state clears
      window.location.href = '/login?reason=idle';
    };

    // First visit / tab open: record activity if missing, then check
    if (!localStorage.getItem(STORAGE_KEY)) {
      touchActivity();
    }
    maybeLogout();

    const events: (keyof WindowEventMap)[] = [
      'click',
      'keydown',
      'scroll',
      'touchstart',
      'mousemove',
    ];
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

    const interval = window.setInterval(maybeLogout, CHECK_EVERY_MS);

    // When user returns to the tab, check immediately
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        onActivity();
        maybeLogout();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
