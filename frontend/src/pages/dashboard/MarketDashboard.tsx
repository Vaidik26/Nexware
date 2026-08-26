import { useNavigate } from 'react-router-dom';
import { Package2, TrendingUp, ArrowRight, Database, Truck, Shield } from 'lucide-react';

export default function MarketDashboard() {
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto py-12 px-4 text-center space-y-8">
      <div className="space-y-3 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-on-surface">
          Executive Summary
        </h1>
        <p className="text-on-surface-variant text-base leading-relaxed">
          Welcome to the NexWare Operations Platform. This centralized hub provides professional access to all core modules across the enterprise.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto pt-4 text-left">
        {/* Dashboards */}
        <div 
          onClick={() => navigate('/dashboard/sales')}
          className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant hover:border-primary/50 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center mb-4 border border-indigo-200 group-hover:scale-105 transition-transform">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-on-surface group-hover:text-primary transition-colors">
              Dashboards
            </h3>
            <p className="text-sm text-slate-500 mt-2">
              View comprehensive sales dashboards, performance metrics, and top-level analytics for critical business decision-making.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Enter Dashboards</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Master Data */}
        <div 
          onClick={() => navigate('/admin/customers')}
          className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant hover:border-primary/50 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center mb-4 border border-cyan-200 group-hover:scale-105 transition-transform">
              <Database className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-on-surface group-hover:text-primary transition-colors">
              Master Data
            </h3>
            <p className="text-sm text-slate-500 mt-2">
              Manage core foundational data including customer records, profiles, and the complete sales catalogue.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Enter Master Data</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Warehouse Ops */}
        <div 
          onClick={() => navigate('/warehouse/upload')}
          className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant hover:border-primary/50 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-4 border border-blue-200 group-hover:scale-105 transition-transform">
              <Package2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-on-surface group-hover:text-primary transition-colors">
              Warehouse Operations Hub
            </h3>
            <p className="text-sm text-slate-500 mt-2">
              Manage order file uploads, LPO processing, generate picklists, and streamline dispatch procedures.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Enter Warehouse Module</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Delivery & Logistics */}
        <div 
          onClick={() => navigate('/delivery/manifest')}
          className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant hover:border-primary/50 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-4 border border-amber-200 group-hover:scale-105 transition-transform">
              <Truck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-on-surface group-hover:text-primary transition-colors">
              Delivery & Logistics
            </h3>
            <p className="text-sm text-slate-500 mt-2">
              Coordinate delivery manifests, monitor vehicle loading operations, and manage out-bound logistics efficiently.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Enter Delivery Module</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Market Intelligence */}
        <div 
          onClick={() => navigate('/market/overview')}
          className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant hover:border-emerald-600/50 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4 border border-emerald-200 group-hover:scale-105 transition-transform">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-on-surface group-hover:text-emerald-700 transition-colors">
              Market Intelligence & Price Capture
            </h3>
            <p className="text-sm text-slate-500 mt-2">
              Record daily rates, analyze price trends, manage raw materials, and inspect global sourcing spreads.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-emerald-700">
            <span>Enter Market Intelligence</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Administration */}
        <div 
          onClick={() => navigate('/admin/users')}
          className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant hover:border-primary/50 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mb-4 border border-rose-200 group-hover:scale-105 transition-transform">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-on-surface group-hover:text-primary transition-colors">
              Administration
            </h3>
            <p className="text-sm text-slate-500 mt-2">
              Control system access, administer user roles and permissions, and manage platform-wide configurations.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Enter Administration</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
}
