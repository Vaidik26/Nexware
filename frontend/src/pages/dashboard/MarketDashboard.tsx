import { useNavigate } from 'react-router-dom';
import { Package2, TrendingUp, ShieldAlert, ArrowRight } from 'lucide-react';

export default function MarketDashboard() {
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto py-12 px-4 text-center space-y-8">
      <div className="w-20 h-20 bg-primary-container/20 text-primary rounded-3xl flex items-center justify-center mx-auto shadow-sm border border-primary-container">
        <ShieldAlert className="w-10 h-10 text-primary" />
      </div>

      <div className="space-y-3 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
          Under Development
        </span>
        <h1 className="text-3xl font-bold text-on-surface">
          Executive Operations & Market Intelligence Summary
        </h1>
        <p className="text-on-surface-variant text-base leading-relaxed">
          This centralized dashboard is currently being engineered to bring together integrated, real-time summaries combining both <strong>Warehouse Operations</strong> and <strong>Market Intelligence</strong> into a unified corporate view.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto pt-4 text-left">
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
              Manage order file uploads, generate picklists, audit item verification, and administer the live sales catalogue.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-primary">
            <span>Enter Warehouse Module</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

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
              Record daily rates for Dubai Spot and International CIF/FOB, analyze price trends, monitor top daily movers, and inspect sourcing spreads.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-emerald-700">
            <span>Enter Market Intelligence Module</span>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      <div className="pt-6">
        <p className="text-xs text-slate-400 font-mono">
          NexWare ERP Suite • System Architecture v2.4
        </p>
      </div>
    </div>
  );
}
