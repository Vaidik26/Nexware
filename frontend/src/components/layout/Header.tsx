import { Menu, User, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/Toast';
import { clearApiCache, preloadAllMasterData } from '@/lib/api';
import { ownsPortal } from '@/lib/access';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const access = useAuthStore((state) => state.access);
  const navigate = useNavigate();

  const handleLogout = () => {
    // `logout` drops the session and every cached response itself, so both
    // sign-out buttons behave identically — this one used to clear the cache
    // and the sidebar's did not.
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
    <header className="h-16 border-b border-outline-variant bg-surface-container-lowest flex items-center justify-between px-4 md:px-6 flex-shrink-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Hamburger — only on mobile */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-1 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-wider bg-primary/10 text-primary px-3 py-1 rounded-full font-semibold border border-primary/20 whitespace-nowrap">
            NexWare Enterprise OS
          </span>
          {ownsPortal(access) && (
            <button
              onClick={handleManualSync}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 font-extrabold text-xs border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer shadow-2xs"
              title="Click to force re-sync live master data from backend database"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>⚡ Smart Cache Active • Sync Live</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-3 pl-2 md:pl-4 border-l border-outline-variant">
          {/* Name — hidden on very small screens to save space */}
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-on-surface truncate max-w-[140px]">
              {user?.email || 'Admin User'}
            </span>
            <span className="text-xs text-on-surface-variant uppercase font-semibold">
              {user?.user_type || 'Manager'}
            </span>
          </div>
          <div className="w-8 h-8 bg-primary-container rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
            <User className="w-4 h-4" />
          </div>
          <button
            onClick={handleLogout}
            title="Log Out"
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-lg border border-error/20 bg-error/5 text-error hover:bg-error hover:text-white font-medium text-xs transition-all shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
