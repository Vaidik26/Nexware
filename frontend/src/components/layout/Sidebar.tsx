import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/components/ui/Toast';
import {
  BarChart3,
  Package2,
  BookOpen,
  CheckSquare,
  Tags,
  DollarSign,
  TrendingUp,
  Users,
  LogOut,
} from 'lucide-react';

const groups = [
  {
    label: 'Dashboard',
    items: [
      { name: 'Executive Summary', path: '/dashboard', icon: BarChart3 },
    ],
  },
  {
    label: 'Warehouse Ops',
    items: [
      { name: 'Order Upload', path: '/warehouse/upload', icon: Package2 },
      { name: 'LPO Management', path: '/warehouse/lpos', icon: Package2 },
      { name: 'Create Manual Order', path: '/warehouse/create-order', icon: Package2 },
      { name: 'Picklists & Dispatch', path: '/warehouse/picklists', icon: CheckSquare },
      { name: 'Sales Catalogue', path: '/warehouse/catalogue', icon: BookOpen },
    ],
  },
  {
    label: 'Market Intelligence',
    items: [
      { name: 'Overview & Analytics', path: '/market/overview', icon: TrendingUp },
      { name: 'Price Management', path: '/market/prices', icon: DollarSign },
      { name: 'Raw Materials', path: '/market/materials', icon: Tags },
    ],
  },
  {
    label: 'Administration',
    items: [
      { name: 'User Management', path: '/admin/users', icon: Users },
    ],
  },
];

export default function Sidebar() {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  return (
    <div className="flex flex-col w-64 bg-primary text-white h-screen border-r border-primary-container">
      <div className="flex items-center gap-3 p-6 border-b border-primary-container">
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary font-bold text-xl">
          N
        </div>
        <div>
          <span className="font-bold text-lg tracking-tight">Nexware</span>
          <span className="text-xs text-on-primary-container block font-medium">Operations Platform</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <h4 className="px-3 text-xs font-semibold text-on-primary-container uppercase tracking-wider mb-2">
              {group.label}
            </h4>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      'hover:bg-primary-container hover:text-white',
                      isActive
                        ? 'bg-secondary text-primary font-bold shadow-xs'
                        : 'text-white'
                    )
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-primary-container">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium text-white hover:bg-primary-container rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
