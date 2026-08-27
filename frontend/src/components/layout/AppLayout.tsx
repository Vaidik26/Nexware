import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { preloadAllMasterData } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { ownsPortal } from '@/lib/access';
import { useQueryClient } from '@tanstack/react-query';

import { toast } from '@/components/ui/Toast';

const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine'; // Clean beep sound
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1); 
    
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    console.error("Audio playback failed", err);
  }
};

export default function AppLayout() {
  const queryClient = useQueryClient();
  const access = useAuthStore((state) => state.access);
  const canPreload = ownsPortal(access);

  useEffect(() => {
    // Silently pre-fetch all master datasets on initial application load for
    // 0ms transitions — but only for accounts that can open the screens those
    // datasets feed. Every one of them is an admin-gated endpoint, so a
    // dashboard viewer would spend the first seconds of every session
    // collecting 403s for screens their sidebar does not even offer.
    if (canPreload) preloadAllMasterData();

    // Setup WebSocket for Real-time Notifications
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Assuming backend is at port 8000 in dev
    const wsUrl = import.meta.env.PROD 
      ? `${protocol}//${window.location.host}/ws/notifications`
      : `ws://localhost:8000/ws/notifications`;

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'READY_FOR_AUDIT') {
          playBeep();
          toast.success(`🔔 ${data.message}`, { duration: 8000 });
        } else if (data.event === 'ORDER_CREATED') {
          playBeep();
          toast.success(`🔔 ${data.message}`, { duration: 5000 });
          queryClient.invalidateQueries({ queryKey: ['lpos'] });
        }
      } catch (err) {
        // Ignore parsing errors
      }
    };

    return () => {
      ws.close();
    };
  }, [queryClient, canPreload]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
