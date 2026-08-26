import { User, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/Toast';
import { clearApiCache, preloadAllMasterData } from '@/lib/api';

export default function Header() {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const handleLogout = () => {
    clearApiCache();
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const handleManualSync = () => {
    clearApiCache();
    preloadAllMasterData();
    toast.success('System datasets re-synced with live server database!');
  };

  return (
    <header className="h-16 border-b border-outline-variant bg-surface-container-lowest flex items-center justify-between px-6">
      <div className="flex items-center gap-4 flex-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-wider bg-primary/10 text-primary px-3 py-1 rounded-full font-semibold border border-primary/20">
            NexWare Enterprise OS
          </span>
          <button
            onClick={handleManualSync}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 font-extrabold text-xs border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer shadow-2xs"
            title="Click to force re-sync live master data from backend database"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>⚡ Smart Cache Active • Sync Live</span>
          </button>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 pl-4 border-l border-outline-variant">
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium text-on-surface">{user?.email || 'Admin User'}</span>
            <span className="text-xs text-on-surface-variant uppercase font-semibold">{user?.user_type || 'Manager'}</span>
          </div>
          <div className="w-9 h-9 bg-primary-container rounded-full flex items-center justify-center text-white font-semibold">
            <User className="w-5 h-5" />
          </div>
          <button
            onClick={handleLogout}
            title="Log Out"
            className="flex items-center gap-1.5 px-3 py-1.5 ml-2 rounded-lg border border-error/20 bg-error/5 text-error hover:bg-error hover:text-white font-medium text-xs transition-all shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}

