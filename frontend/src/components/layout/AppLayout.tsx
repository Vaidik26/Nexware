import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { preloadAllMasterData, clearApiCache, invalidateApiCache } from '@/lib/api';
import {
  EVENT_CACHE_PREFIXES,
  LIVE_EVENT,
  LPO_EVENTS,
  getWebSocketUrl,
  type LiveEvent,
} from '@/lib/liveEvents';
import { useAuthStore } from '@/store/authStore';
import { ownsPortal } from '@/lib/access';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/Toast';

const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    console.error('Audio playback failed', err);
  }
};

export default function AppLayout() {
  const queryClient = useQueryClient();
  const access = useAuthStore((state) => state.access);
  const canPreload = ownsPortal(access);

  // Mobile sidebar state — closed by default, toggled by the hamburger button
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (canPreload) preloadAllMasterData();
  }, [canPreload]);

  // Single app-wide notification socket. Reconnects on its own so a dropped
  // connection never leaves the panel silently showing stale data.
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;
    let disposed = false;

    const stopHeartbeat = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      const delay = Math.min(1000 * 2 ** attempt, 15000);
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const handleMessage = (raw: string) => {
      let data: LiveEvent;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      if (!data?.event) return;

      // 1. Drop the HTTP cache this event just invalidated. Without this the
      //    refetch below would be answered from the same stale entry.
      const prefixes = EVENT_CACHE_PREFIXES[data.event];
      if (prefixes) invalidateApiCache(prefixes);
      else clearApiCache();

      // 2. Refetch whatever React Query is holding.
      if (LPO_EVENTS.includes(data.event)) {
        queryClient.invalidateQueries({ queryKey: ['lpos'] });
      }

      // 3. Let pages that manage their own state re-read silently.
      window.dispatchEvent(new CustomEvent<LiveEvent>(LIVE_EVENT, { detail: data }));

      // Audible alerts are unchanged — only these two interrupt the user.
      if (data.event === 'READY_FOR_AUDIT') {
        playBeep();
        toast.success(`🔔 ${data.message}`, { duration: 8000 });
      } else if (data.event === 'ORDER_CREATED') {
        playBeep();
        toast.success(`🔔 ${data.message}`, { duration: 5000 });
      }
    };

    const connect = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(getWebSocketUrl());
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        attempt = 0;
        // Keeps idle proxies from dropping the connection. The backend's
        // receive loop discards whatever text arrives.
        heartbeat = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send('ping');
        }, 25000);
      };
      ws.onmessage = (event) => handleMessage(event.data);
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        stopHeartbeat();
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      disposed = true;
      stopHeartbeat();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, [queryClient]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Mobile overlay backdrop ──────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar — drawer on mobile, always-visible on md+ ───────────── */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
