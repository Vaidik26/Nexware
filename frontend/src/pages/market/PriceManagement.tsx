import { useState, useEffect } from 'react';
import { 
  Search, 
  Calendar, 
  Download, 
  Plus, 
  Edit2, 
  AlertTriangle,
  Filter,
  FileSpreadsheet,
  FileText,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { PageLoader } from '@/components/ui/PageLoader';
import { getLatestPrices, saveDailyRates, buildBrandedExportPayload, LatestPriceSummary } from '@/lib/data/priceService';
import api from '@/lib/api';

export default function PriceManagement() {
  const todayStr = new Date().toISOString().split('T')[0];
  
  const [items, setItems] = useState<LatestPriceSummary[]>([]);
  const [filteredItems, setFilteredItems] = useState<LatestPriceSummary[]>([]);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Modal State for Entering / Editing Rates
  const [activeItem, setActiveItem] = useState<LatestPriceSummary | null>(null);
  const [localInput, setLocalInput] = useState('');
  const [cifInput, setCifInput] = useState('');
  const [fobInput, setFobInput] = useState('');

  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFilter, setExportFilter] = useState<'today' | 'yesterday' | '3days' | 'week' | 'month' | 'custom'>('month');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [isExporting, setIsExporting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getLatestPrices(selectedDate);
      setItems(data);
      setFilteredItems(data);
    } catch (err) {
      toast.error('Failed to load pricing sheet from repository');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredItems(items);
    } else {
      const s = search.toLowerCase();
      setFilteredItems(items.filter(i => 
        i.item.particulars.toLowerCase().includes(s) || 
        (i.item.sku && i.item.sku.toLowerCase().includes(s)) ||
        i.item.id.toLowerCase().includes(s)
      ));
    }
  }, [search, items]);

  // Open Modal to Enter or Edit Rates
  const handleOpenEditModal = (summary: LatestPriceSummary) => {
    setActiveItem(summary);
    const tr = summary.todayRecord;
    setLocalInput(tr?.dubaiLocalPrice != null ? String(tr.dubaiLocalPrice) : '');
    setCifInput(tr?.internationalCIF != null ? String(tr.internationalCIF) : '');
    setFobInput(tr?.internationalFOB != null ? String(tr.internationalFOB) : '');
  };

  // Commit changes from Modal Form
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;

    const localVal = localInput.trim() !== '' ? Number(localInput) : null;
    const cifVal = cifInput.trim() !== '' ? Number(cifInput) : null;
    const fobVal = fobInput.trim() !== '' ? Number(fobInput) : null;

    if ((localVal !== null && localVal < 0) || (cifVal !== null && cifVal < 0) || (fobVal !== null && fobVal < 0)) {
      toast.error('Negative prices are not valid');
      return;
    }

    if (localVal === null && cifVal === null && fobVal === null) {
      toast.error('Please fill at least one price (Local, CIF, or FOB) to save the rate record.');
      return;
    }

    try {
      setIsSaving(true);
      await saveDailyRates([{
        itemId: activeItem.item.id,
        date: selectedDate,
        dubaiLocalPrice: localVal,
        internationalFOB: fobVal,
        internationalCIF: cifVal,
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

  // Handle Enterprise Branded Export
  const handleExecuteExport = async (format: 'excel' | 'pdf') => {
    try {
      setIsExporting(true);
      let start = todayStr;
      let end = todayStr;
      let scopeLabel = 'TODAY';

      if (exportFilter === 'yesterday') {
        const d = new Date(); d.setDate(d.getDate() - 1);
        start = d.toISOString().split('T')[0];
        end = start;
        scopeLabel = 'YESTERDAY';
      } else if (exportFilter === '3days') {
        const d = new Date(); d.setDate(d.getDate() - 3);
        start = d.toISOString().split('T')[0];
        scopeLabel = 'LAST 3 DAYS';
      } else if (exportFilter === 'week') {
        const d = new Date(); d.setDate(d.getDate() - 7);
        start = d.toISOString().split('T')[0];
        scopeLabel = 'THIS WEEK';
      } else if (exportFilter === 'month') {
        const d = new Date(); d.setDate(d.getDate() - 30);
        start = d.toISOString().split('T')[0];
        scopeLabel = 'THIS MONTH';
      } else if (exportFilter === 'custom') {
        start = customStart || todayStr;
        end = customEnd || todayStr;
        scopeLabel = `${start} TO ${end}`;
      }

      const payload = await buildBrandedExportPayload(start, end, scopeLabel);
      if (!payload.dates || payload.dates.length === 0 || (payload.dates.length === 1 && payload.dates[0].rows.length === 0)) {
        toast.error('No pricing data found in the selected range');
        return;
      }

      const endpoint = format === 'excel' ? '/market/prices/export-excel' : '/market/prices/export-pdf';
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      const mime = format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
      
      const res = await api.post(endpoint, payload, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: mime }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `NexWare_Market_Report_${exportFilter.toUpperCase()}_${todayStr}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(`Exported branded ${format.toUpperCase()} report!`);
      setIsExportModalOpen(false);
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error(`Failed to export ${format.toUpperCase()} report`);
    } finally {
      setIsExporting(false);
    }
  };

  // Deviation checking helper
  const checkDeviation = (currentVal: number | null, priorVal: number | null): boolean => {
    if (currentVal == null || priorVal == null || priorVal === 0) return false;
    const diffPct = Math.abs((currentVal - priorVal) / priorVal) * 100;
    return diffPct > 10;
  };

  if (isLoading) {
    return <PageLoader message="Loading Daily Capture Sheet..." subtitle="Connecting to market rates repository" />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header and export bar matching Warehouse Ops style */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Daily Market Price Management</h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Record and update today's local Dubai rates and international FOB/CIF valuations in a unified view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button 
            variant="primary" 
            onClick={() => setIsExportModalOpen(true)}
            className="shadow-md bg-secondary hover:bg-secondary/90 text-white font-medium px-5"
          >
            <Download className="w-4 h-4 mr-2" /> Export Market Reports
          </Button>
        </div>
      </div>

      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
        {/* Search and Interactive Trading Date Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex max-w-md w-full relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search commodities by title or SKU..."
              className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2.5 bg-surface px-4 py-2 rounded-xl border border-outline-variant shadow-xs">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-semibold text-slate-600">Trading Date:</span>
            <input
              type="date"
              max={todayStr}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="font-mono text-sm font-bold text-on-surface bg-transparent border-0 focus:outline-none focus:ring-0 cursor-pointer p-0"
            />
            {selectedDate !== todayStr && (
              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className="text-[11px] font-semibold text-primary hover:underline bg-primary/10 px-2 py-0.5 rounded-md ml-1 transition-colors"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* Showing Items Count */}
        <div className="flex items-center justify-end border-t border-outline-variant pt-4">
          <span className="text-xs text-slate-500 font-medium">
            Showing <strong>{filteredItems.length}</strong> items
          </span>
        </div>

        {/* Professional Table without open inputs */}
        <div className="overflow-x-auto border border-outline-variant rounded-xl">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-outline-variant font-semibold">
                <th className="py-3.5 px-4 border-r border-outline-variant text-center w-14">S.No</th>
                <th className="py-3.5 px-6 border-r border-outline-variant">Item Name (Particulars)</th>
                <th className="py-3.5 px-4 border-r border-outline-variant text-center w-36">Bag / Ctn Weight</th>
                <th className="py-3.5 px-5 border-r border-outline-variant text-right w-44">
                  Local Dubai Price (AED)
                </th>
                <th className="py-3.5 px-6 border-r border-outline-variant text-right min-w-[240px]">
                  International Rates (CIF & FOB - USD)
                </th>
                <th className="py-3.5 px-4 border-r border-outline-variant text-center w-36">Quote Status</th>
                <th className="py-3.5 px-4 text-right w-36">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-sm">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-medium">
                    No commodity items found matching your dataset filter. Add items in Raw Material Item Master to start daily recording.
                  </td>
                </tr>
              ) : (
                filteredItems.map((summary, idx) => {
                  const item = summary.item;
                  const tr = summary.todayRecord;
                  
                  const localVal = tr?.dubaiLocalPrice != null ? tr.dubaiLocalPrice : null;
                  const cifVal = tr?.internationalCIF != null ? tr.internationalCIF : null;
                  const fobVal = tr?.internationalFOB != null ? tr.internationalFOB : null;

                  const hasAnyEntry = localVal !== null || cifVal !== null || fobVal !== null;
                  const hasAllEntries = localVal !== null && cifVal !== null && fobVal !== null;

                  const localDev = checkDeviation(localVal, summary.lastRecordedLocal.value);
                  const cifDev = checkDeviation(cifVal, summary.lastRecordedInt.cif);
                  const fobDev = checkDeviation(fobVal, summary.lastRecordedInt.fob);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 border-r border-outline-variant text-center font-mono text-xs text-slate-500 font-medium">
                        {idx + 1}
                      </td>
                      <td className="py-3.5 px-6 border-r border-outline-variant font-semibold text-on-surface">
                        {item.particulars}
                      </td>
                      <td className="py-3.5 px-4 border-r border-outline-variant text-center font-mono text-xs text-slate-700">
                        {item.bagCtnWeight ? `${item.bagCtnWeight} ${item.weightUnit || 'kg'}` : 'Standard'}
                      </td>

                      {/* Dubai Local Price */}
                      <td className="py-3.5 px-5 border-r border-outline-variant text-right font-mono font-semibold">
                        {localVal !== null ? (
                          <div>
                            <span className="text-emerald-700">{localVal.toFixed(2)} AED</span>
                            {localDev && (
                              <div className="text-[11px] text-amber-600 flex items-center justify-end gap-1 font-normal mt-0.5" title="Over 10% drift from prior recording">
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                <span>&gt;10% drift</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-normal">—</span>
                        )}
                      </td>

                      {/* International CIF & FOB together in the same line */}
                      <td className="py-3.5 px-6 border-r border-outline-variant text-right font-mono text-xs">
                        {(cifVal !== null || fobVal !== null) ? (
                          <div className="inline-flex items-center justify-end gap-2 font-semibold">
                            <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded border border-blue-200">
                              CIF: {cifVal !== null ? `$${cifVal.toFixed(2)}` : '—'}
                              {cifDev && <span title=">10% drift from prior recording"><AlertTriangle className="w-3 h-3 text-amber-500 inline ml-1" /></span>}
                            </span>
                            <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded border border-amber-200">
                              FOB: {fobVal !== null ? `$${fobVal.toFixed(2)}` : '—'}
                              {fobDev && <span title=">10% drift from prior recording"><AlertTriangle className="w-3 h-3 text-amber-500 inline ml-1" /></span>}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-normal text-sm">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 border-r border-outline-variant text-center">
                        {hasAllEntries ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            Fully Quoted
                          </span>
                        ) : hasAnyEntry ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800" title="You can add missing rates anytime today">
                            Partially Quoted
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                            No Quote Today
                          </span>
                        )}
                      </td>

                      {/* Actions: Button to Enter/Edit in Modal */}
                      <td className="py-3.5 px-4 text-right">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleOpenEditModal(summary)}
                          className="text-xs font-medium px-3 shadow-2xs hover:bg-primary/5 hover:text-primary hover:border-primary"
                        >
                          {hasAnyEntry ? (
                            <span className="flex items-center gap-1.5"><Edit2 className="w-3.5 h-3.5" /> Edit Rates</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-primary"><Plus className="w-3.5 h-3.5" /> Enter Rates</span>
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

      {/* Modal Form to Enter / Edit Today's Rates */}
      <Modal 
        isOpen={!!activeItem} 
        onClose={() => setActiveItem(null)} 
        title={activeItem ? `Enter Daily Market Rates — ${activeItem.item.particulars}` : 'Enter Daily Market Rates'}
      >
        <form onSubmit={handleSaveModal} className="space-y-4">
          {activeItem && (
            <div className="p-3 bg-slate-50 border border-outline-variant rounded-xl flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Standard Packaging Weight:</span>
              <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                {activeItem.item.bagCtnWeight ? `${activeItem.item.bagCtnWeight} kg bag/carton` : 'Standard Unit'}
              </span>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-on-surface-variant mb-1.5 block">
              Local Dubai Price (AED)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 23.50 (Leave blank if not quoted today)"
              value={localInput}
              onChange={(e) => setLocalInput(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-outline-variant font-medium text-sm focus:outline-none focus:border-primary text-on-surface font-mono"
            />
            {activeItem?.lastRecordedLocal.value != null && (
              <p className="text-xs text-slate-500 mt-1">
                Last recorded local quote: <span className="font-mono font-semibold text-slate-700">{activeItem.lastRecordedLocal.value} AED</span> on {activeItem.lastRecordedLocal.date}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant mb-1.5 block">
              International CIF Landed Quote ($ USD)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 32.00 (Leave blank if not quoted today)"
              value={cifInput}
              onChange={(e) => setCifInput(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-outline-variant font-medium text-sm focus:outline-none focus:border-primary text-on-surface font-mono"
            />
            {activeItem?.lastRecordedInt.cif != null && (
              <p className="text-xs text-slate-500 mt-1">
                Last recorded CIF quote: <span className="font-mono font-semibold text-slate-700">${activeItem.lastRecordedInt.cif}</span> on {activeItem.lastRecordedInt.date}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant mb-1.5 block">
              International FOB Export Quote ($ USD)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 40.00 (Leave blank if not quoted today)"
              value={fobInput}
              onChange={(e) => setFobInput(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-outline-variant font-medium text-sm focus:outline-none focus:border-primary text-on-surface font-mono"
            />
            {activeItem?.lastRecordedInt.fob != null && (
              <p className="text-xs text-slate-500 mt-1">
                Last recorded FOB quote: <span className="font-mono font-semibold text-slate-700">${activeItem.lastRecordedInt.fob}</span> on {activeItem.lastRecordedInt.date}
              </p>
            )}
          </div>

          <div className="text-xs text-slate-500 pt-2 border-t border-outline-variant/60">
            * You need at least one rate (Local, CIF, or FOB) to save today's entry. Unfilled fields remain blank so you can come back and edit or add them later today.
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-outline-variant">
            <Button variant="secondary" onClick={() => setActiveItem(null)} type="button">Cancel</Button>
            <Button type="submit" isLoading={isSaving} className="shadow-md">Save Daily Rates</Button>
          </div>
        </form>
      </Modal>

      {/* Export Subwindow (Modal) */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Export Market & Price History Reports"
      >
        <div className="space-y-6">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-2">
              Select Time Horizon
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: '3days', label: 'Last 3 Days' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
                { id: 'custom', label: 'Custom Range' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setExportFilter(f.id as any)}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    exportFilter === f.id
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-2xs'
                      : 'border-outline-variant bg-surface text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {exportFilter === f.id && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {exportFilter === 'custom' && (
            <div className="p-4 bg-slate-50 border border-outline-variant rounded-xl space-y-3 animate-in fade-in duration-200">
              <span className="text-xs font-bold text-slate-700 block flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-primary" /> Specify Custom Date Range:
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-500 block mb-1">Start Date</label>
                  <input
                    type="date"
                    max={customEnd || todayStr}
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-outline-variant rounded-lg font-mono text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500 block mb-1">End Date</label>
                  <input
                    type="date"
                    min={customStart}
                    max={todayStr}
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-outline-variant rounded-lg font-mono text-xs font-semibold text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-3">
            <Filter className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" />
            <div className="text-xs text-emerald-900 leading-relaxed">
              <strong>Enterprise Report Generator:</strong> Downloads include complete historical quotations across local Dubai rates and international FOB/CIF valuations for the selected period, styled in branded corporate formatting.
            </div>
          </div>

          <div className="pt-4 border-t border-outline-variant flex flex-col sm:flex-row items-center justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsExportModalOpen(false)}
              disabled={isExporting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExecuteExport('excel')}
              isLoading={isExporting}
              className="w-full sm:w-auto border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 font-semibold shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" /> Download Excel (.xlsx)
            </Button>
            <Button
              variant="primary"
              onClick={() => handleExecuteExport('pdf')}
              isLoading={isExporting}
              className="w-full sm:w-auto shadow-md"
            >
              <FileText className="w-4 h-4 mr-1.5" /> Download Branded PDF
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
