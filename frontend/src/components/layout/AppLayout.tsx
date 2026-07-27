import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { preloadAllMasterData } from '@/lib/api';

export default function AppLayout() {
  useEffect(() => {
    // Silently pre-fetch all master datasets on initial application load for 0ms transitions
    preloadAllMasterData();
  }, []);

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
