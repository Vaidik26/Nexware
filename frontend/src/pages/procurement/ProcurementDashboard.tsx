import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { AreaChart, TrendingUp, DollarSign, Package } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

import BuyingDesk from '@/components/procurement-dashboard/BuyingDesk';
import MPPIView from '@/components/procurement-dashboard/MPPIView';
import PriceTrends from '@/components/procurement-dashboard/PriceTrends';
import ModelAndLogic from '@/components/procurement-dashboard/ModelAndLogic';

export default function ProcurementDashboard() {
  const [activeTab, setActiveTab] = useState<'mppi' | 'desk' | 'trends' | 'model'>('desk');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [deskFilters, setDeskFilters] = useState({
    q: '',
    market: 'ALL',
    inco: 'CIF',
    cat: '',
    showFilter: 'all'
  });

  // Global procurement settings state
  const [settings, setSettings] = useState({
    globalOn: false,
    globalM: 0.15,
    grpM: {} as Record<string, number>,
    skuM: {} as Record<string, number>,
    reorder: 15,
    cover: 30,
    inco: 'CIF' // used by buying desk for INT market
  });

  useEffect(() => {
    fetch('/procurement/data.json')
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading procurement data:", err);
        setLoading(false);
      });
  }, []);

  const access = useAuthStore((s) => s.access);

  const tabs = [
    { id: 'desk', label: 'Buying Desk', icon: DollarSign },
    ...(access?.role === 'PROCUREMENT_MANAGER' ? [] : [
      { id: 'mppi', label: 'MPPI Ceiling', icon: Package },
      { id: 'trends', label: 'Price Trends', icon: TrendingUp },
      { id: 'model', label: 'Model & Logic', icon: AreaChart },
    ])
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Procurement Price Desk</h1>
            <span className="px-2 py-1 text-xs font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">Prototype</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">MPPI ceiling, buying desk and price trends for commodity procurement.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={clsx(
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
                'group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors'
              )}
            >
              <tab.icon className={clsx(
                activeTab === tab.id ? 'text-primary' : 'text-slate-400 group-hover:text-slate-500',
                'h-4 w-4'
              )} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="min-h-[500px]">
        {activeTab === 'desk' && (
          <BuyingDesk data={data} settings={settings} filters={deskFilters} setFilters={setDeskFilters} />
        )}
        {activeTab === 'mppi' && (
          <MPPIView data={data} settings={settings} setSettings={setSettings} onJumpToDesk={(rm) => {
            setDeskFilters({ q: rm, market: 'ALL', inco: 'CIF', cat: '', showFilter: 'all' });
            setActiveTab('desk');
          }} />
        )}
        {activeTab === 'trends' && (
          <PriceTrends data={data} settings={settings} />
        )}
        {activeTab === 'model' && (
          <ModelAndLogic data={data} settings={settings} />
        )}
      </div>
    </div>
  );
}
