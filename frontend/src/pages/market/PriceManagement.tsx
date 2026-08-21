import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Calendar, 
   
  Plus, Download, 
  Edit2, 
  
  
  
  
  
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { PageLoader } from '@/components/ui/PageLoader';
import { getLatestPrices, saveDailyRates, LatestPriceSummary } from '@/lib/data/priceService';
import { convertCurrency } from '@/lib/currency';
import api from '@/lib/api';


export default function PriceManagement() {
  const todayStr = new Date().toISOString().split('T')[0];
  
  const [items, setItems] = useState<LatestPriceSummary[]>([]);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Filters
  const [marketFilter, setMarketFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [quoteStatusFilter, setQuoteStatusFilter] = useState('ALL'); // NEW FILTER
  const [currencyView, setCurrencyView] = useState('DEFAULT');

  // Modal State for Entering / Editing Rates
  const [activeItem, setActiveItem] = useState<LatestPriceSummary | null>(null);
  const [localAedInput, setLocalAedInput] = useState('');
  const [localOmrInput, setLocalOmrInput] = useState('');
  const [supplierDubaiInput, setSupplierDubaiInput] = useState('');
  const [supplierOmanInput, setSupplierOmanInput] = useState('');
  const [cifInput, setCifInput] = useState('');
  const [fobInput, setFobInput] = useState('');

  // Export Modal State
  
  
  
  
  

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getLatestPrices(selectedDate);
      setItems(data);
    } catch (err) {
      toast.error('Failed to load pricing sheet from repository');
    } finally {
      setIsLoading(false);
    }
  };

  
  const handleExportTemplate = (market: string) => {
    // Construct the URL directly, assuming API base URL is available, or use window.open
    // Better to fetch and download blob to keep auth headers if needed
    toast.success(`Generating template for ${market}...`);
    api.get(`/market/prices/export-capture-template?market=${market}`, { responseType: 'blob' })
      .then((res: any) => {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Price_Capture_Template_${market}.xlsx`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('Template downloaded successfully');
      })
      .catch((err: any) => {
        console.error(err);
        toast.error('Failed to download template');
      });
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.item.category).filter(Boolean));
    return ['ALL', ...Array.from(cats)];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(summary => {
      const s = search.toLowerCase();
      const matchesSearch = !search || summary.item.particulars.toLowerCase().includes(s) || 
                            (summary.item.sku && summary.item.sku.toLowerCase().includes(s));
      
      const matchesMarket = marketFilter === 'ALL' || summary.item.market_type === marketFilter || summary.item.market_type === 'BOTH';
      const matchesCategory = categoryFilter === 'ALL' || summary.item.category === categoryFilter;
      
      const isQuoted = !!summary.target_price;
      const matchesQuoteStatus = quoteStatusFilter === 'ALL' || 
                                 (quoteStatusFilter === 'QUOTED' && isQuoted) || 
                                 (quoteStatusFilter === 'UNQUOTED' && !isQuoted);

      return matchesSearch && matchesMarket && matchesCategory && matchesQuoteStatus;
    });
  }, [items, search, marketFilter, categoryFilter, quoteStatusFilter]);

  const handleOpenEditModal = (summary: LatestPriceSummary) => {
    setActiveItem(summary);
    const tr = summary.target_price;
    setLocalAedInput(tr?.local_price_aed != null ? String(tr.local_price_aed) : '');
    setLocalOmrInput(tr?.local_price_omr != null ? String(tr.local_price_omr) : '');
    setSupplierDubaiInput(tr?.supplier_dubai || '');
    setSupplierOmanInput(tr?.supplier_oman || '');
    setCifInput(tr?.cif_price != null ? String(tr.cif_price) : '');
    setFobInput(tr?.fob_price != null ? String(tr.fob_price) : '');
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;

    const locAed = localAedInput.trim() !== '' ? Number(localAedInput) : null;
    const locOmr = localOmrInput.trim() !== '' ? Number(localOmrInput) : null;
    const cifVal = cifInput.trim() !== '' ? Number(cifInput) : null;
    const fobVal = fobInput.trim() !== '' ? Number(fobInput) : null;
    const supDxb = supplierDubaiInput.trim();
    const supOmr = supplierOmanInput.trim();

    if (locAed === null && locOmr === null && cifVal === null && fobVal === null) {
      toast.error('Please fill at least one price to save the rate record.');
      return;
    }

    try {
      setIsSaving(true);
      await saveDailyRates([{
        itemId: activeItem.item.id,
        date: selectedDate,
        local_price_aed: locAed,
        local_price_omr: locOmr,
        supplier_dubai: supDxb,
        supplier_oman: supOmr,
        fob_price: fobVal,
        cif_price: cifVal,
      }]);

      toast.success(`Updated rates for ${activeItem.item.particulars} on ${selectedDate}`);
      setActiveItem(null);
      await loadData();
    } catch (err) {
      toast.error('Failed to save rate record');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <PageLoader message="Loading Daily Capture Sheet..." subtitle="Connecting to market rates repository" />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Daily Market Price Management</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Record and update today's local Dubai rates and international FOB/CIF valuations in a unified view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => handleExportTemplate('ALL')} className="shadow-sm flex items-center gap-2">
                <Download className="w-4 h-4" /> Export Template
              </Button>
          </div>
      </div>

      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex w-full md:max-w-md relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search commodities..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-outline-variant focus:outline-none focus:border-primary text-sm transition-all shadow-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2.5 bg-surface px-4 py-2 rounded-xl border border-outline-variant shadow-sm w-full sm:w-auto shrink-0 justify-center">
              <Calendar className="w-4 h-4 text-primary shrink-0" />
              <input
                type="date"
                max={todayStr}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="font-mono text-sm font-bold text-on-surface bg-transparent border-0 focus:outline-none focus:ring-0 cursor-pointer p-0"
              />
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50/50 rounded-xl border border-slate-100">
            <select
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value)}
              className="bg-white px-3 py-2 rounded-lg border border-outline-variant text-sm focus:outline-none shadow-sm flex-1 sm:flex-none min-w-[140px]"
            >
              <option value="ALL">All Markets</option>
              <option value="DXB">Dubai (Local)</option>
              <option value="INT">International</option>
              <option value="BOTH">Both</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-white px-3 py-2 rounded-lg border border-outline-variant text-sm focus:outline-none shadow-sm flex-1 sm:flex-none min-w-[140px]"
            >
              {categories.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Categories' : c}</option>)}
            </select>
            <select
              value={quoteStatusFilter}
              onChange={(e) => setQuoteStatusFilter(e.target.value)}
              className="bg-white px-3 py-2 rounded-lg border border-outline-variant text-sm focus:outline-none shadow-sm flex-1 sm:flex-none min-w-[140px]"
            >
              <option value="ALL">All Quote Statuses</option>
              <option value="QUOTED">Quoted / Captured</option>
              <option value="UNQUOTED">Unquoted / Missing</option>
            </select>
            <select 
              value={currencyView}
              onChange={(e) => setCurrencyView(e.target.value)}
              className="bg-blue-50 text-blue-700 font-semibold px-3 py-2 rounded-lg border border-blue-100 text-sm focus:outline-none shadow-sm flex-1 sm:flex-none min-w-[140px]"
            >
              <option value="DEFAULT">Currency: Default</option>
              <option value="AED">View in AED</option>
              <option value="USD">View in USD</option>
              <option value="OMR">View in OMR</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-outline-variant pt-4">
          <span className="text-xs text-slate-500 font-medium">
            Showing <strong>{filteredItems.length}</strong> items
          </span>
        </div>

        <div className="overflow-x-auto border border-outline-variant rounded-xl">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-outline-variant font-semibold">
                <th className="py-3.5 px-4 border-r border-outline-variant text-center w-14">S.No</th>
                <th className="py-3.5 px-6 border-r border-outline-variant">Item Name</th>
                <th className="py-3.5 px-4 border-r border-outline-variant text-center">Category</th>
                <th className="py-3.5 px-4 border-r border-outline-variant text-center">Market</th>
                <th className="py-3.5 px-6 border-r border-outline-variant text-right">Last Price</th>
                <th className="py-3.5 px-4 border-r border-outline-variant text-center">Last Updated</th>
                <th className="py-3.5 px-4 text-right w-36">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-sm">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-medium">
                    No commodity items found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map((summary, idx) => {
                  const item = summary.item;
                  const tp = summary.target_price;
                  const last_p = tp || summary.last_price;

                  let priceStr = '—';
                  if (last_p) {
                    const parts = [];
                      const isDef = currencyView === 'DEFAULT';
                      
                      const locAed = isDef ? last_p.local_price_aed : convertCurrency(last_p.local_price_aed, 'AED', currencyView);
                      const locOmr = isDef ? last_p.local_price_omr : convertCurrency(last_p.local_price_omr, 'OMR', currencyView);
                      const cif = isDef ? last_p.cif_price : convertCurrency(last_p.cif_price, 'USD', currencyView);
                      const fob = isDef ? last_p.fob_price : convertCurrency(last_p.fob_price, 'USD', currencyView);
                      
                      if (locAed != null) parts.push(`DXB: ${locAed.toFixed(2)} ${isDef ? 'AED' : currencyView}`);
                      if (locOmr != null) parts.push(`OMN: ${locOmr.toFixed(2)} ${isDef ? 'OMR' : currencyView}`);
                      if (cif != null) parts.push(`CIF: ${cif.toFixed(2)} ${isDef ? 'USD' : currencyView}`);
                      if (fob != null) parts.push(`FOB: ${fob.toFixed(2)} ${isDef ? 'USD' : currencyView}`);
                      
                      if (parts.length > 0) {
                        priceStr = parts.join(' | ');
                      }
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 border-r border-outline-variant text-center font-mono text-xs text-slate-500 font-medium">
                        {idx + 1}
                      </td>
                      <td className="py-3.5 px-6 border-r border-outline-variant font-semibold text-on-surface">
                        {item.particulars}
                      </td>
                      <td className="py-3.5 px-4 border-r border-outline-variant text-center text-slate-700">
                        {item.category}
                      </td>
                      <td className="py-3.5 px-4 border-r border-outline-variant text-center">
                        <div className="flex justify-center gap-1">
                          {(item.market_type === 'DXB' || item.market_type === 'BOTH') && <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded">DXB</span>}
                          {(item.market_type === 'INT' || item.market_type === 'BOTH') && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded">INT</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-6 border-r border-outline-variant text-right font-mono font-semibold">
                        {priceStr}
                      </td>
                      <td className="py-3.5 px-4 border-r border-outline-variant text-center font-mono text-xs text-slate-500">
                        {last_p?.date || '�'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            disabled={selectedDate !== todayStr}
                            title={selectedDate !== todayStr ? "Prices can only be captured for today" : undefined}
                            onClick={() => handleOpenEditModal(summary)}
                            className="text-xs font-medium px-3 shadow-2xs hover:bg-primary/5 hover:text-primary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                          {tp ? (
                            <span className="flex items-center gap-1.5"><Edit2 className="w-3.5 h-3.5" /> Edit Rates</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-primary"><Plus className="w-3.5 h-3.5" /> Capture</span>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal 
        isOpen={!!activeItem} 
        onClose={() => setActiveItem(null)} 
        title={activeItem ? `Enter Daily Market Rates � ${activeItem.item.particulars}` : 'Enter Daily Market Rates'}
      >
        <form onSubmit={handleSaveModal} className="space-y-4">
            {activeItem?.item?.market_type !== 'INT' && (
              <>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                  <h4 className="text-sm font-bold text-slate-700">Dubai Local Market</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Price (AED)</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={localAedInput} onChange={(e) => setLocalAedInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Supplier</label>
                      <input
                        type="text"
                        value={supplierDubaiInput} onChange={(e) => setSupplierDubaiInput(e.target.value)}
                        placeholder="Type supplier name..."
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                  <h4 className="text-sm font-bold text-slate-700">Oman Local Market</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Price (OMR)</label>
                      <input
                        type="number" step="0.001" min="0"
                        value={localOmrInput} onChange={(e) => setLocalOmrInput(e.target.value)}
                        placeholder="0.000"
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Supplier</label>
                      <input
                        type="text"
                        value={supplierOmanInput} onChange={(e) => setSupplierOmanInput(e.target.value)}
                        placeholder="Type supplier name..."
                        className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeItem?.item?.market_type !== 'DXB' && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                <h4 className="text-sm font-bold text-slate-700">International Market (USD)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">CIF Price</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={cifInput} onChange={(e) => setCifInput(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">FOB Price</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={fobInput} onChange={(e) => setFobInput(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            )}
            
            

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-outline-variant">
              <Button variant="secondary" onClick={() => setActiveItem(null)} type="button">Cancel</Button>
              <Button type="submit" isLoading={isSaving} className="shadow-md">Save Daily Rates</Button>
            </div>
          </form>
      </Modal>
    </div>
  );
}
