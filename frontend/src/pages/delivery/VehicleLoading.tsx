import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ScanLine, CheckCircle2, XCircle, Truck,
  Package2, AlertTriangle, Layers, PackageCheck, User,
  Clock, Box,
} from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { ALL_MANIFESTS } from './DeliveryManifest';

// ─────────────────────────────────────────────────────────────
// ORDER COLOR MAP (same as Manifest page)
// ─────────────────────────────────────────────────────────────
const ORDER_COLORS: Record<string, string> = {
  'LPO-0081': '#16a34a', 'LPO-0082': '#2563eb', 'LPO-0083': '#9333ea',
  'LPO-0084': '#d97706', 'LPO-0085': '#dc2626', 'LPO-0086': '#0891b2',
  'LPO-0087': '#db2777', 'LPO-0091': '#84cc16', 'LPO-0092': '#f97316',
  'LPO-0093': '#6366f1', 'LPO-0094': '#14b8a6', 'LPO-0095': '#e11d48',
  'LPO-0101': '#16a34a', 'LPO-0102': '#2563eb',
};

// ─────────────────────────────────────────────────────────────
// 3D TRUCK (compact for loading page)
// ─────────────────────────────────────────────────────────────
function MiniTruck3D({ cartons, loadedSet }: {
  cartons: { barcode: string; order: string }[];
  loadedSet: Set<string>;
}) {
  const COLS = 5;
  const pct = cartons.length > 0 ? Math.round((loadedSet.size / cartons.length) * 100) : 0;
  return (
    <div style={{ perspective: '600px' }} className="flex justify-center">
      <div style={{ transform: 'rotateX(12deg) rotateY(-6deg)', transformStyle: 'preserve-3d' }}>
        <div className="flex items-end gap-0">
          {/* Cab */}
          <div className="relative flex-shrink-0" style={{ width: 44, height: 76 }}>
            <div className="absolute bottom-0 left-0 right-0 bg-primary rounded-tl-2xl rounded-bl-sm" style={{ height: 74 }} />
            <div className="absolute bg-sky-300/80 rounded border border-sky-200" style={{ top: 10, left: 4, right: 6, height: 28 }} />
            <div className="absolute bg-amber-300 rounded-full" style={{ bottom: 14, right: 3, width: 6, height: 4 }} />
          </div>
          {/* Cargo Bay */}
          <div
            className="relative rounded-r-sm overflow-hidden"
            style={{
              width: 200, height: 76,
              background: 'linear-gradient(170deg, #1e293b 0%, #0f172a 100%)',
              border: '2px solid #334155',
              boxShadow: '4px 4px 0 #090d13',
            }}
          >
            <div className="absolute inset-1.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
              {cartons.map(ctn => {
                const loaded = loadedSet.has(ctn.barcode);
                const color = ORDER_COLORS[ctn.order] ?? '#64748b';
                return (
                  <motion.div
                    key={ctn.barcode}
                    animate={loaded
                      ? { scale: 1, opacity: 1, backgroundColor: color }
                      : { scale: 1, opacity: 1, backgroundColor: '#1e3a5f' }
                    }
                    transition={{ duration: 0.3, type: 'spring', stiffness: 300, damping: 24 }}
                    className="rounded-sm"
                    style={{ border: loaded ? `1px solid ${color}66` : '1px solid #334155', boxShadow: loaded ? 'inset 0 -1px 0 rgba(0,0,0,0.3)' : 'none' }}
                  />
                );
              })}
            </div>
            <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border border-white/10">
              {pct}%
            </div>
          </div>
          <div style={{ width: 10, height: 76, background: 'linear-gradient(to right, #0f172a, #1a2540)', border: '1px solid #1e293b', borderLeft: 'none', flexShrink: 0 }} />
        </div>
        <div className="flex items-center mt-1" style={{ paddingLeft: 8 }}>
          <div className="rounded-full bg-slate-700 border-2 border-slate-500" style={{ width: 16, height: 16 }} />
          <div className="flex gap-1" style={{ marginLeft: 86 }}>
            {[0, 1].map(i => <div key={i} className="rounded-full bg-slate-700 border-2 border-slate-500" style={{ width: 16, height: 16 }} />)}
          </div>
          <div className="flex gap-1" style={{ marginLeft: 6 }}>
            {[0, 1].map(i => <div key={i} className="rounded-full bg-slate-700 border-2 border-slate-500" style={{ width: 16, height: 16 }} />)}
          </div>
        </div>
        <div className="mx-auto mt-1 rounded-full" style={{ width: 244, height: 6, background: 'radial-gradient(ellipse, rgba(0,0,0,0.2) 0%, transparent 80%)' }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STEP PROGRESS
// ─────────────────────────────────────────────────────────────
function StepBadge({ step, current, label }: { step: number; current: number; label: string }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs transition-all ${
        done ? 'bg-emerald-500 text-white' : active ? 'bg-primary text-white ring-4 ring-primary/20' : 'bg-slate-200 text-slate-500'
      }`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : step}
      </div>
      <span className={`text-sm font-bold ${done ? 'text-emerald-600' : active ? 'text-on-surface' : 'text-on-surface-variant'}`}>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BARCODE INPUT
// ─────────────────────────────────────────────────────────────
function BarcodeInput({
  placeholder,
  onScan,
  disabled,
}: {
  placeholder: string;
  onScan: (val: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    onScan(v);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
        <input
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-outline-variant bg-surface-container-lowest font-mono text-sm text-on-surface focus:outline-none focus:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        />
      </div>
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="px-5 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <ScanLine className="w-4 h-4" /> Scan
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function VehicleLoading() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const manifest = ALL_MANIFESTS.find(m => m.id === Number(id)) ?? ALL_MANIFESTS[0];

  // Step: 1 = scan invoice, 2 = scan cartons, 3 = complete
  const [step, setStep] = useState(1);
  const [loadedSet, setLoadedSet] = useState<Set<string>>(new Set());
  const [mismatch, setMismatch] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<string | null>(null);

  const cartons = manifest.cartons;
  const pct = cartons.length > 0 ? Math.round((loadedSet.size / cartons.length) * 100) : 0;
  const allLoaded = loadedSet.size === cartons.length;

  // Invoice Scan Handler
  const handleInvoiceScan = (val: string) => {
    if (val === manifest.invoiceBarcode) {
      setStep(2);
      toast.success(`✓ Invoice ${manifest.invoiceBarcode} verified — begin carton loading`);
    } else {
      toast.error(`✗ Barcode mismatch: "${val}" — expected ${manifest.invoiceBarcode}`);
    }
  };

  // Carton Scan Handler
  const handleCartonScan = (val: string) => {
    const found = cartons.find(c => c.barcode === val);
    if (!found) {
      setMismatch(val);
      toast.error(`✗ Unknown carton barcode: "${val}" — not on this manifest`);
      setTimeout(() => setMismatch(null), 2500);
      return;
    }
    if (loadedSet.has(val)) {
      toast.error(`⚠ Carton ${val} already scanned`);
      return;
    }
    const next = new Set(loadedSet);
    next.add(val);
    setLoadedSet(next);
    setLastLoaded(val);
    setTimeout(() => setLastLoaded(null), 1800);
    if (next.size === cartons.length) {
      setTimeout(() => setStep(3), 400);
    }
  };

  const handleFinalize = () => {
    toast.success(`🚛 Manifest ${manifest.number} fully loaded — vehicle cleared for dispatch!`);
    setTimeout(() => navigate('/delivery/manifest'), 1500);
  };

  // Group cartons by order for display
  const cartonsByOrder = cartons.reduce((acc, ctn) => {
    if (!acc[ctn.order]) acc[ctn.order] = [];
    acc[ctn.order].push(ctn);
    return acc;
  }, {} as Record<string, typeof cartons>);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/delivery/manifest')}
          className="mt-1 p-2 rounded-xl border border-outline-variant hover:bg-surface-container transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-on-surface-variant" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2.5">
            <Truck className="w-6 h-6 text-primary" />
            Vehicle Loading — {manifest.number}
          </h1>
          <p className="text-on-surface-variant text-sm mt-1">
            Scan invoice barcode → scan each carton to validate loading onto vehicle
          </p>
        </div>
      </div>

      {/* ── Manifest Info Card ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Truck, label: 'Vehicle', value: manifest.vehicle.plate, sub: manifest.vehicle.type },
          { icon: User, label: 'Driver', value: manifest.driver },
          { icon: User, label: 'Vehicle Incharge', value: manifest.incharge },
          { icon: Clock, label: 'Scheduled Departure', value: manifest.departure, sub: manifest.date },
        ].map((info, i) => (
          <div key={i} className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-4 flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <info.icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{info.label}</div>
              <div className="font-bold text-on-surface text-sm mt-0.5">{info.value}</div>
              {info.sub && <div className="text-xs text-on-surface-variant">{info.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Step Progress ── */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5">
        <div className="flex items-center gap-6">
          <StepBadge step={1} current={step} label="Scan Invoice" />
          <div className="flex-1 h-0.5 bg-outline-variant">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: step > 1 ? '100%' : '0%' }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <StepBadge step={2} current={step} label="Load Cartons" />
          <div className="flex-1 h-0.5 bg-outline-variant">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: step > 2 ? '100%' : '0%' }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <StepBadge step={3} current={step} label="Dispatch Ready" />
        </div>
      </div>

      {/* ── STEP 1: Invoice Scan ── */}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-6 space-y-5"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-xl">
                <ScanLine className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-on-surface text-lg">Step 1 — Scan Invoice Barcode</h2>
                <p className="text-sm text-on-surface-variant">Scan or type the invoice barcode to unlock carton loading for {manifest.number}</p>
              </div>
            </div>

            {/* Barcode hint card */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800">
                <div className="font-bold mb-1">Expected Invoice Barcode:</div>
                <div className="font-mono text-base font-extrabold tracking-widest text-amber-900 bg-white/60 px-3 py-1.5 rounded-lg inline-block border border-amber-300">
                  {manifest.invoiceBarcode}
                </div>
                <div className="mt-1.5 text-amber-700">Type this barcode in the scan field below (or scan with a handheld scanner)</div>
              </div>
            </div>

            <BarcodeInput
              placeholder={`Scan invoice barcode — e.g. ${manifest.invoiceBarcode}`}
              onScan={handleInvoiceScan}
            />

            {/* Demo shortcut */}
            <div className="flex justify-end">
              <button
                onClick={() => handleInvoiceScan(manifest.invoiceBarcode)}
                className="text-xs text-on-surface-variant hover:text-primary underline underline-offset-2 transition-colors"
              >
                Demo: auto-fill correct barcode →
              </button>
            </div>
          </motion.div>
        )}

        {/* ── STEP 2: Carton Scan ── */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Invoice confirmed banner */}
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <div className="font-bold text-emerald-800 text-sm">Invoice Verified — {manifest.invoiceBarcode}</div>
                <div className="text-xs text-emerald-700">Scan carton barcodes below. Each carton must match this manifest.</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* Left: Carton scan + list (3/5) */}
              <div className="lg:col-span-3 space-y-4">
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-on-surface flex items-center gap-2">
                      <ScanLine className="w-4 h-4 text-primary" />
                      Step 2 — Scan Carton Barcodes
                    </h2>
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                      {loadedSet.size} / {cartons.length} loaded
                    </span>
                  </div>

                  <BarcodeInput
                    placeholder="Scan carton barcode — e.g. CTN-0081-A"
                    onScan={handleCartonScan}
                    disabled={allLoaded}
                  />

                  {/* Demo shortcut */}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-on-surface-variant font-semibold">Quick scan:</span>
                    {cartons.filter(c => !loadedSet.has(c.barcode)).slice(0, 5).map(c => (
                      <button
                        key={c.barcode}
                        onClick={() => handleCartonScan(c.barcode)}
                        className="text-[10px] font-mono font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg transition-colors"
                      >
                        {c.barcode}
                      </button>
                    ))}
                    {cartons.filter(c => !loadedSet.has(c.barcode)).length > 5 && (
                      <span className="text-[10px] text-on-surface-variant">+{cartons.filter(c => !loadedSet.has(c.barcode)).length - 5} more</span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-on-surface-variant">
                      <span>Loading Progress</span>
                      <span className="text-primary">{pct}% Complete</span>
                    </div>
                    <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #006c49, #00a86b)' }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Carton list grouped by order */}
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden">
                  <div className="px-5 py-3.5 bg-surface-container border-b border-outline-variant flex items-center justify-between">
                    <h3 className="font-bold text-on-surface text-sm flex items-center gap-2">
                      <Box className="w-4 h-4 text-primary" />
                      Carton Loading Manifest
                    </h3>
                    <div className="flex items-center gap-3 text-xs font-semibold">
                      <span className="text-emerald-700 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        Loaded: {loadedSet.size}
                      </span>
                      <span className="text-amber-600 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                        Pending: {cartons.length - loadedSet.size}
                      </span>
                    </div>
                  </div>

                  <div className="divide-y divide-outline-variant max-h-[460px] overflow-y-auto">
                    {Object.entries(cartonsByOrder).map(([lpo, ctns]) => (
                      <div key={lpo}>
                        {/* Order header */}
                        <div
                          className="flex items-center gap-2 px-5 py-2.5 sticky top-0 z-10"
                          style={{ backgroundColor: (ORDER_COLORS[lpo] ?? '#64748b') + '15', borderLeft: `3px solid ${ORDER_COLORS[lpo] ?? '#64748b'}` }}
                        >
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ORDER_COLORS[lpo] ?? '#64748b' }} />
                          <span className="font-extrabold text-xs text-on-surface">{lpo}</span>
                          <span className="text-xs text-on-surface-variant">·</span>
                          <span className="text-xs font-semibold text-on-surface-variant">{ctns[0].customer}</span>
                          <span className="ml-auto text-xs font-bold text-on-surface-variant">
                            {ctns.filter(c => loadedSet.has(c.barcode)).length}/{ctns.length} loaded
                          </span>
                        </div>
                        {/* Cartons */}
                        {ctns.map(ctn => {
                          const loaded = loadedSet.has(ctn.barcode);
                          const isMismatch = mismatch === ctn.barcode;
                          const isJustLoaded = lastLoaded === ctn.barcode;
                          return (
                            <motion.div
                              key={ctn.barcode}
                              animate={isJustLoaded ? { backgroundColor: ['#dcfce7', '#ffffff'] } : {}}
                              transition={{ duration: 1.2 }}
                              className={`flex items-center gap-3 px-5 py-3 transition-all ${
                                loaded ? 'bg-emerald-50/60' : isMismatch ? 'bg-red-50' : 'bg-white hover:bg-surface-container/40'
                              }`}
                            >
                              {/* Status icon */}
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                loaded ? 'bg-emerald-500' : 'bg-slate-200'
                              }`}>
                                {loaded
                                  ? <CheckCircle2 className="w-4 h-4 text-white" />
                                  : <Box className="w-4 h-4 text-slate-500" />
                                }
                              </div>

                              {/* Carton info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-extrabold text-xs text-primary">{ctn.barcode}</span>
                                  {loaded && (
                                    <motion.span
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      className="text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 px-1.5 py-0.5 rounded-full"
                                    >
                                      ✓ LOADED
                                    </motion.span>
                                  )}
                                </div>
                                <div className="text-xs text-on-surface-variant truncate mt-0.5">{ctn.contents}</div>
                              </div>

                              {/* Scan button (quick demo) */}
                              {!loaded && (
                                <button
                                  onClick={() => handleCartonScan(ctn.barcode)}
                                  className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white border border-primary/20 transition-colors flex-shrink-0"
                                >
                                  <ScanLine className="w-3 h-3" />
                                </button>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: 3D Truck + summary (2/5) */}
              <div className="lg:col-span-2 space-y-4">

                {/* 3D Truck */}
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 space-y-4">
                  <h3 className="font-bold text-on-surface text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Live Cargo View
                  </h3>
                  <MiniTruck3D cartons={cartons} loadedSet={loadedSet} />
                </div>

                {/* Last scanned */}
                <AnimatePresence>
                  {lastLoaded && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center gap-3"
                    >
                      <div className="p-2.5 bg-emerald-500 rounded-xl">
                        <CheckCircle2 className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="font-extrabold text-emerald-800 text-sm">Carton Loaded!</div>
                        <div className="font-mono text-xs text-emerald-700">{lastLoaded}</div>
                      </div>
                    </motion.div>
                  )}
                  {mismatch && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="bg-red-50 border border-red-300 rounded-2xl p-4 flex items-center gap-3"
                    >
                      <div className="p-2.5 bg-red-500 rounded-xl">
                        <XCircle className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="font-extrabold text-red-800 text-sm">Barcode Mismatch!</div>
                        <div className="font-mono text-xs text-red-700">{mismatch}</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Order summary */}
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant p-5 space-y-3">
                  <h3 className="font-bold text-on-surface text-sm flex items-center gap-2">
                    <Package2 className="w-4 h-4 text-primary" />
                    Order Summary
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(cartonsByOrder).map(([lpo, ctns]) => {
                      const loaded = ctns.filter(c => loadedSet.has(c.barcode)).length;
                      const done = loaded === ctns.length;
                      return (
                        <div key={lpo} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: ORDER_COLORS[lpo] ?? '#64748b' }} />
                          <span className="text-xs font-bold text-on-surface-variant flex-1 truncate">{lpo}</span>
                          <div className="flex items-center gap-1">
                            <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(loaded / ctns.length) * 100}%`,
                                  backgroundColor: ORDER_COLORS[lpo] ?? '#64748b',
                                }}
                              />
                            </div>
                            <span className={`text-[10px] font-extrabold ${done ? 'text-emerald-600' : 'text-on-surface-variant'}`}>
                              {loaded}/{ctns.length}
                            </span>
                            {done && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* All loaded / Finalize */}
                {allLoaded && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-primary rounded-2xl p-5 text-white text-center space-y-3"
                  >
                    <PackageCheck className="w-10 h-10 mx-auto text-secondary" />
                    <div>
                      <div className="font-extrabold text-lg">All Cartons Loaded!</div>
                      <div className="text-sm text-white/70 mt-1">{cartons.length} cartons scanned & verified</div>
                    </div>
                    <button
                      onClick={handleFinalize}
                      className="w-full py-3 rounded-xl bg-secondary-container text-primary font-extrabold text-sm hover:brightness-95 transition-all"
                    >
                      Finalize & Clear for Dispatch →
                    </button>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── STEP 3: Complete ── */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-container-lowest rounded-3xl border border-outline-variant p-10 text-center space-y-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-300/40"
            >
              <CheckCircle2 className="w-12 h-12 text-white" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-extrabold text-on-surface">Loading Complete!</h2>
              <p className="text-on-surface-variant mt-2">
                {manifest.number} — all {cartons.length} cartons verified and loaded onto {manifest.vehicle.plate}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
              {[
                { label: 'Cartons Loaded', value: cartons.length },
                { label: 'Orders', value: manifest.orders.length },
                { label: 'Stops', value: manifest.route.length - 1 },
              ].map(s => (
                <div key={s.label} className="bg-surface-container rounded-2xl p-4 border border-outline-variant">
                  <div className="text-2xl font-black text-primary">{s.value}</div>
                  <div className="text-xs text-on-surface-variant font-semibold mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-center flex-wrap">
              <Button
                onClick={handleFinalize}
                className="bg-primary text-white font-bold px-8"
              >
                <Truck className="w-4 h-4 mr-2" /> Dispatch Vehicle
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/delivery/manifest')}
                className="px-8"
              >
                Back to Manifests
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
