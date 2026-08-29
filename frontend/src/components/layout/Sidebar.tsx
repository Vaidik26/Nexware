import { useMemo, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { PortalModule, hasModule, ownsPortal } from '@/lib/access';
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
  ChevronDown,
  Database,
  Shield,
  Truck,
  FileText,
  X,
} from 'lucide-react';

type NavItem = { name: string; path: string; icon: typeof Users; module?: PortalModule };
type NavGroup = {
  label: string;
  icon: typeof BarChart3;
  path?: string;
  module?: PortalModule;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: 'Executive Summary',
    icon: BarChart3,
    path: '/dashboard',
    items: [],
  },
  {
    label: 'Dashboards',
    icon: BarChart3,
    items: [
      { name: 'Sales Dashboard', path: '/dashboard/sales', icon: TrendingUp, module: 'SALES_DASH' },
      { name: 'Procurement Dashboard', path: '/dashboard/procurement', icon: DollarSign, module: 'PROCUREMENT' },
    ],
  },
  {
    label: 'Master Data',
    icon: Database,
    items: [
      { name: 'Customer Master', path: '/admin/customers', icon: Users },
      { name: 'Sales Catalogue', path: '/warehouse/catalogue', icon: BookOpen },
    ],
  },
  {
    label: 'Warehouse Ops',
    icon: Package2,
    items: [
      { name: 'Order Upload', path: '/warehouse/upload', icon: Package2 },
      { name: 'LPO Management', path: '/warehouse/lpos', icon: Package2 },
      { name: 'Picklists & Dispatch', path: '/warehouse/picklists', icon: CheckSquare },
    ],
  },
  {
    label: 'Delivery & Logistics',
    icon: Truck,
    items: [
      { name: 'Delivery Manifest', path: '/delivery/manifest', icon: FileText },
      { name: 'Vehicle Loading', path: '/delivery/loading/1', icon: Truck },
    ],
  },
  {
    label: 'Market Intelligence',
    icon: TrendingUp,
    items: [
      { name: 'Overview & Analytics', path: '/market/overview', icon: TrendingUp },
      { name: 'Price Management', path: '/market/prices', icon: DollarSign },
      { name: 'Raw Materials', path: '/market/materials', icon: Tags },
    ],
  },
  {
    label: 'Administration',
    icon: Shield,
    items: [
      { name: 'User Management', path: '/admin/users', icon: Users, module: 'USER_ADMIN' },
    ],
  },
];

interface SidebarProps {
  /** On mobile this controls the drawer open state. On md+ it is ignored. */
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const logout = useAuthStore((state) => state.logout);
  const access = useAuthStore((state) => state.access);
  const navigate = useNavigate();
  const location = useLocation();

  const visibleGroups = useMemo(() => {
    const canOpen = (module?: PortalModule) =>
      module ? ownsPortal(access) || hasModule(access, module) : ownsPortal(access);

    return groups
      .map((group) =>
        group.items.length === 0
          ? group
          : { ...group, items: group.items.filter((i) => canOpen(i.module)) }
      )
      .filter((group) =>
        group.items.length === 0 ? canOpen(group.module) : group.items.length > 0
      );
  }, [access]);

  const activeGroup = visibleGroups.find((g) =>
    g.items.some((i) => location.pathname.startsWith(i.path))
  )?.label;

  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    activeGroup || 'Dashboards',
    'Warehouse Ops',
    'Master Data',
  ]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );
  };

  // On mobile: slide in from left as a drawer (z-30 so it sits above the backdrop).
  // On md+: always visible, no transform applied.
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col w-72 md:w-64 bg-primary text-white border-r border-primary-container',
        'transition-transform duration-200 ease-in-out',
        // Mobile: hide by default, show when open
        isOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: always visible
        'md:relative md:translate-x-0 md:z-auto'
      )}
    >
      {/* Brand + mobile close button */}
      <div className="flex items-center gap-3 p-6 border-b border-primary-container">
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary font-bold text-xl">
          N
        </div>
        <div className="flex-1">
          <span className="font-bold text-lg tracking-tight">Nexware</span>
          <span className="text-xs text-white/60 block font-medium">Operations Platform</span>
        </div>
        {/* Close button — only visible on mobile */}
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded-lg hover:bg-primary-container/50 text-white/70 hover:text-white"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
        {visibleGroups.length === 0 && (
          <p className="px-3 py-6 text-xs leading-relaxed text-white/60">
            No modules are granted to this account. A user administrator can change that from User
            Management.
          </p>
        )}
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          const isExpanded = expandedGroups.includes(group.label);
          const hasActiveChild =
            group.items.length > 0
              ? group.items.some((item) => location.pathname.startsWith(item.path))
              : location.pathname === group.path;

          return (
            <div key={group.label} className="space-y-1">
              {group.items.length === 0 && group.path ? (
                <NavLink
                  to={group.path}
                  end
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'w-full flex items-center justify-between px-3 py-2 text-sm font-bold uppercase tracking-wider rounded-lg transition-colors',
                      isActive
                        ? 'text-secondary bg-secondary/10'
                        : 'text-white/70 hover:bg-primary-container/50 hover:text-white'
                    )
                  }
                >
                  <div className="flex items-center gap-2.5">
                    <GroupIcon className="w-4 h-4 opacity-70" />
                    <span>{group.label}</span>
                  </div>
                </NavLink>
              ) : (
                <>
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-sm font-bold uppercase tracking-wider rounded-lg transition-colors',
                      hasActiveChild
                        ? 'text-secondary'
                        : 'text-white/70 hover:bg-primary-container/50 hover:text-white'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <GroupIcon className="w-4 h-4 opacity-70" />
                      <span>{group.label}</span>
                    </div>
                    {group.items.length > 0 && (
                      <ChevronDown
                        className={cn('w-4 h-4 transition-transform', isExpanded ? 'rotate-180' : '')}
                      />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-1 space-y-1 pl-2 border-l-2 border-primary-container ml-5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={onClose}
                            className={({ isActive }) =>
                              cn(
                                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                                'hover:bg-primary-container hover:text-white',
                                isActive
                                  ? 'bg-secondary text-primary font-bold shadow-xs'
                                  : 'text-white/80'
                              )
                            }
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            <span>{item.name}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
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
    </aside>
  );
}
