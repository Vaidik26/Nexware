import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck, Package2, MapPin, Clock, ArrowRight,
  Zap, CheckCircle2, Box,
  Navigation2, Layers, RefreshCw, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

// ─────────────────────────────────────────────────────────────
// HARDCODED DATA
// ─────────────────────────────────────────────────────────────

const ORDER_COLORS: Record<string, string> = {
  'LPO-0081': '#16a34a',
  'LPO-0082': '#2563eb',
  'LPO-0083': '#9333ea',
  'LPO-0084': '#d97706',
  'LPO-0085': '#dc2626',
  'LPO-0086': '#0891b2',
  'LPO-0087': '#db2777',
  'LPO-0091': '#84cc16',
  'LPO-0092': '#f97316',
  'LPO-0093': '#6366f1',
  'LPO-0094': '#14b8a6',
  'LPO-0095': '#e11d48',
};

export const ALL_MANIFESTS = [
  {
    id: 1,
    number: 'DM-001',
    date: 'Aug 19, 2026',
    vehicle: { plate: 'DXB-A-12345', type: '3-Ton Refrigerated Van', capacity: 30 },
    driver: 'Mohammed Al-Rashid',
    incharge: 'Ahmed Siddiqui',
    phone: '+971-50-123-4567',
    departure: '06:00 AM',
    status: 'ready',
    distance: '38.5 km',
    invoiceBarcode: 'INV-DM001-2608',
    orders: [
      { lpo: 'LPO-0081', customer: 'Carrefour Deira', cartons: 4, items: 3 },
      { lpo: 'LPO-0082', customer: 'Lulu Hypermarket Al Nahda', cartons: 3, items: 5 },
      { lpo: 'LPO-0083', customer: 'Spinneys Mirdif', cartons: 5, items: 4 },
      { lpo: 'LPO-0084', customer: 'Union Co-op Muhaisnah', cartons: 4, items: 6 },
      { lpo: 'LPO-0085', customer: 'Géant Al Quoz', cartons: 3, items: 2 },
      { lpo: 'LPO-0086', customer: 'Nesto Hypermarket JA', cartons: 2, items: 3 },
      { lpo: 'LPO-0087', customer: 'Al Maya Rashidiya', cartons: 2, items: 4 },
    ],
    route: [
      { lat: 25.1175, lng: 55.2009, label: 'W', name: 'Warehouse — Jebel Ali' },
      { lat: 25.0657, lng: 55.1906, label: '1', name: 'Nesto Hypermarket' },
      { lat: 25.0783, lng: 55.1348, label: '2', name: 'Géant Al Quoz' },
      { lat: 25.2100, lng: 55.3600, label: '3', name: 'Union Co-op' },
      { lat: 25.2697, lng: 55.3094, label: '4', name: 'Carrefour Deira' },
      { lat: 25.2773, lng: 55.3778, label: '5', name: 'Lulu Al Nahda' },
      { lat: 25.2295, lng: 55.4079, label: '6', name: 'Spinneys Mirdif' },
      { lat: 25.1221, lng: 55.1947, label: '7', name: 'Al Maya Rashidiya' },
    ],
    cartons: [
      { barcode: 'CTN-0081-A', order: 'LPO-0081', customer: 'Carrefour Deira', contents: 'Noor Gazal Premium 1L × 12' },
      { barcode: 'CTN-0081-B', order: 'LPO-0081', customer: 'Carrefour Deira', contents: 'Extra Virgin 500ml × 24' },
      { barcode: 'CTN-0081-C', order: 'LPO-0081', customer: 'Carrefour Deira', contents: 'Sunflower Oil 5L × 6' },
      { barcode: 'CTN-0081-D', order: 'LPO-0081', customer: 'Carrefour Deira', contents: 'Corn Oil 1L × 24' },
      { barcode: 'CTN-0082-A', order: 'LPO-0082', customer: 'Lulu Al Nahda', contents: 'Premium Blend 1L × 12' },
      { barcode: 'CTN-0082-B', order: 'LPO-0082', customer: 'Lulu Al Nahda', contents: 'Olive Oil 250ml × 48' },
      { barcode: 'CTN-0082-C', order: 'LPO-0082', customer: 'Lulu Al Nahda', contents: 'Sunflower 2L × 12' },
      { barcode: 'CTN-0083-A', order: 'LPO-0083', customer: 'Spinneys Mirdif', contents: 'Premium 1L × 24' },
      { barcode: 'CTN-0083-B', order: 'LPO-0083', customer: 'Spinneys Mirdif', contents: 'Extra Virgin 500ml × 36' },
      { barcode: 'CTN-0083-C', order: 'LPO-0083', customer: 'Spinneys Mirdif', contents: 'Corn Oil 5L × 4' },
      { barcode: 'CTN-0083-D', order: 'LPO-0083', customer: 'Spinneys Mirdif', contents: 'Canola Oil 1L × 12' },
      { barcode: 'CTN-0083-E', order: 'LPO-0083', customer: 'Spinneys Mirdif', contents: 'Sunflower 3L × 9' },
      { barcode: 'CTN-0084-A', order: 'LPO-0084', customer: 'Union Co-op', contents: 'Premium Blend 2L × 18' },
      { barcode: 'CTN-0084-B', order: 'LPO-0084', customer: 'Union Co-op', contents: 'Olive Oil 1L × 12' },
      { barcode: 'CTN-0084-C', order: 'LPO-0084', customer: 'Union Co-op', contents: 'Sunflower 5L × 6' },
      { barcode: 'CTN-0084-D', order: 'LPO-0084', customer: 'Union Co-op', contents: 'Extra Virgin 750ml × 24' },
      { barcode: 'CTN-0085-A', order: 'LPO-0085', customer: 'Géant Al Quoz', contents: 'Premium 1L × 24' },
      { barcode: 'CTN-0085-B', order: 'LPO-0085', customer: 'Géant Al Quoz', contents: 'Corn Oil 2L × 12' },
      { barcode: 'CTN-0085-C', order: 'LPO-0085', customer: 'Géant Al Quoz', contents: 'Canola 1L × 24' },
      { barcode: 'CTN-0086-A', order: 'LPO-0086', customer: 'Nesto Hypermarket', contents: 'Premium Blend 5L × 4' },
      { barcode: 'CTN-0086-B', order: 'LPO-0086', customer: 'Nesto Hypermarket', contents: 'Sunflower 1L × 24' },
      { barcode: 'CTN-0087-A', order: 'LPO-0087', customer: 'Al Maya Rashidiya', contents: 'Extra Virgin 500ml × 48' },
      { barcode: 'CTN-0087-B', order: 'LPO-0087', customer: 'Al Maya Rashidiya', contents: 'Premium 1L × 18' },
    ],
  },
  {
    id: 2,
    number: 'DM-002',
    date: 'Aug 19, 2026',
    vehicle: { plate: 'AUH-B-54321', type: '5-Ton Box Truck', capacity: 45 },
    driver: 'Khalid Hassan',
    incharge: 'Farhan Qureshi',
    phone: '+971-55-987-6543',
    departure: '07:30 AM',
    status: 'loading',
    distance: '25.2 km',
    invoiceBarcode: 'INV-DM002-2608',
    orders: [
      { lpo: 'LPO-0091', customer: 'Carrefour Sheikh Zayed', cartons: 5, items: 7 },
      { lpo: 'LPO-0092', customer: 'Waitrose Dubai Mall', cartons: 4, items: 5 },
      { lpo: 'LPO-0093', customer: 'Spinneys JBR', cartons: 3, items: 4 },
      { lpo: 'LPO-0094', customer: 'Al Madina Hypermarket', cartons: 2, items: 3 },
      { lpo: 'LPO-0095', customer: 'West Zone Fresh', cartons: 2, items: 2 },
    ],
    route: [
      { lat: 25.1175, lng: 55.2009, label: 'W', name: 'Warehouse — Jebel Ali' },
      { lat: 25.1985, lng: 55.2796, label: '1', name: 'West Zone Fresh' },
      { lat: 25.2048, lng: 55.2708, label: '2', name: 'Al Madina Hypermarket' },
      { lat: 25.1972, lng: 55.2744, label: '3', name: 'Spinneys JBR' },
      { lat: 25.2018, lng: 55.2915, label: '4', name: 'Carrefour Shk Zayed' },
      { lat: 25.1972, lng: 55.2795, label: '5', name: 'Waitrose Dubai Mall' },
    ],
    cartons: [
      { barcode: 'CTN-0091-A', order: 'LPO-0091', customer: 'Carrefour Sheikh Zayed', contents: 'Noor Gazal Extra Virgin 1L × 24' },
      { barcode: 'CTN-0091-B', order: 'LPO-0091', customer: 'Carrefour Sheikh Zayed', contents: 'Premium Blend 2L × 12' },
      { barcode: 'CTN-0091-C', order: 'LPO-0091', customer: 'Carrefour Sheikh Zayed', contents: 'Sunflower 5L × 6' },
      { barcode: 'CTN-0091-D', order: 'LPO-0091', customer: 'Carrefour Sheikh Zayed', contents: 'Corn Oil 1L × 24' },
      { barcode: 'CTN-0091-E', order: 'LPO-0091', customer: 'Carrefour Sheikh Zayed', contents: 'Canola 3L × 8' },
      { barcode: 'CTN-0092-A', order: 'LPO-0092', customer: 'Waitrose Dubai Mall', contents: 'Extra Virgin 500ml × 48' },
      { barcode: 'CTN-0092-B', order: 'LPO-0092', customer: 'Waitrose Dubai Mall', contents: 'Premium 750ml × 24' },
      { barcode: 'CTN-0092-C', order: 'LPO-0092', customer: 'Waitrose Dubai Mall', contents: 'Olive Pomace 1L × 12' },
      { barcode: 'CTN-0092-D', order: 'LPO-0092', customer: 'Waitrose Dubai Mall', contents: 'Sunflower 1L × 24' },
      { barcode: 'CTN-0093-A', order: 'LPO-0093', customer: 'Spinneys JBR', contents: 'Premium Blend 1L × 12' },
      { barcode: 'CTN-0093-B', order: 'LPO-0093', customer: 'Spinneys JBR', contents: 'Corn Oil 2L × 12' },
      { barcode: 'CTN-0093-C', order: 'LPO-0093', customer: 'Spinneys JBR', contents: 'Sunflower 3L × 9' },
      { barcode: 'CTN-0094-A', order: 'LPO-0094', customer: 'Al Madina', contents: 'Noor Gazal 5L × 4' },
      { barcode: 'CTN-0094-B', order: 'LPO-0094', customer: 'Al Madina', contents: 'Premium 1L × 24' },
      { barcode: 'CTN-0095-A', order: 'LPO-0095', customer: 'West Zone Fresh', contents: 'Sunflower 2L × 12' },
      { barcode: 'CTN-0095-B', order: 'LPO-0095', customer: 'West Zone Fresh', contents: 'Extra Virgin 250ml × 48' },
    ],
  },
  {
    id: 3,
    number: 'DM-003',
    date: 'Aug 19, 2026',
    vehicle: { plate: 'SHJ-C-99887', type: '1-Ton Delivery Van', capacity: 15 },
    driver: 'Ibrahim Al-Mansouri',
    incharge: 'Raza Khan',
    phone: '+971-52-456-7890',
    departure: '08:00 AM',
    status: 'draft',
    distance: '52.1 km',
    invoiceBarcode: 'INV-DM003-2608',
    orders: [
      { lpo: 'LPO-0101', customer: 'Carrefour Sharjah City', cartons: 6, items: 5 },
      { lpo: 'LPO-0102', customer: 'Lulu Sharjah', cartons: 7, items: 8 },
      { lpo: 'LPO-0103', customer: 'Al Ain Co-op', cartons: 5, items: 4 },
      { lpo: 'LPO-0104', customer: 'Union Co-op Sharjah', cartons: 4, items: 6 },
      { lpo: 'LPO-0105', customer: 'Nesto Sharjah', cartons: 4, items: 3 },
      { lpo: 'LPO-0106', customer: 'Al Maya Sharjah', cartons: 3, items: 4 },
      { lpo: 'LPO-0107', customer: 'Safeer Hypermarket', cartons: 2, items: 3 },
      { lpo: 'LPO-0108', customer: 'Grand Hypermarket', cartons: 2, items: 2 },
      { lpo: 'LPO-0109', customer: 'Al Madina Sharjah', cartons: 2, items: 3 },
    ],
    route: [
      { lat: 25.1175, lng: 55.2009, label: 'W', name: 'Warehouse — Jebel Ali' },
      { lat: 25.3250, lng: 55.3850, label: '1', name: 'Nesto Sharjah' },
      { lat: 25.3380, lng: 55.4280, label: '2', name: 'Lulu Sharjah' },
      { lat: 25.3573, lng: 55.3936, label: '3', name: 'Carrefour Sharjah' },
      { lat: 25.3200, lng: 55.4410, label: '4', name: 'Al Ain Co-op' },
      { lat: 25.3000, lng: 55.4200, label: '5', name: 'Union Co-op Sharjah' },
    ],
    cartons: [
      { barcode: 'CTN-0101-A', order: 'LPO-0101', customer: 'Carrefour Sharjah', contents: 'Premium 1L × 24' },
      { barcode: 'CTN-0101-B', order: 'LPO-0101', customer: 'Carrefour Sharjah', contents: 'Sunflower 5L × 6' },
      { barcode: 'CTN-0101-C', order: 'LPO-0101', customer: 'Carrefour Sharjah', contents: 'Corn Oil 2L × 12' },
      { barcode: 'CTN-0101-D', order: 'LPO-0101', customer: 'Carrefour Sharjah', contents: 'Extra Virgin 500ml × 36' },
      { barcode: 'CTN-0101-E', order: 'LPO-0101', customer: 'Carrefour Sharjah', contents: 'Canola 1L × 24' },
      { barcode: 'CTN-0101-F', order: 'LPO-0101', customer: 'Carrefour Sharjah', contents: 'Premium Blend 3L × 8' },
      { barcode: 'CTN-0102-A', order: 'LPO-0102', customer: 'Lulu Sharjah', contents: 'Noor Gazal 1L × 24' },
      { barcode: 'CTN-0102-B', order: 'LPO-0102', customer: 'Lulu Sharjah', contents: 'Sunflower 2L × 12' },
      { barcode: 'CTN-0102-C', order: 'LPO-0102', customer: 'Lulu Sharjah', contents: 'Corn Oil 5L × 4' },
      { barcode: 'CTN-0102-D', order: 'LPO-0102', customer: 'Lulu Sharjah', contents: 'Olive Pomace 1L × 12' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────
function ManifestBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string; dot: string }> = {
    ready:   { label: 'Ready for Dispatch', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500 animate-pulse' },
    loading: { label: 'Loading in Progress', cls: 'bg-blue-50 text-blue-800 border-blue-300',     dot: 'bg-blue-500 animate-pulse' },
    draft:   { label: 'Draft — Pending',     cls: 'bg-amber-50 text-amber-800 border-amber-300',   dot: 'bg-amber-500' },
    dispatched: { label: 'Dispatched',       cls: 'bg-slate-100 text-slate-600 border-slate-300', dot: 'bg-slate-400' },
  };
  const c = cfg[status] ?? cfg.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// SVG ROUTE MAP (Fallback for Demo)
// ─────────────────────────────────────────────────────────────
function RouteMapSVG({ route }: { route: typeof ALL_MANIFESTS[0]['route'] }) {
  // Map lat/lng to arbitrary SVG coordinates for demo purposes
  const minLat = Math.min(...route.map(r => r.lat));
  const maxLat = Math.max(...route.map(r => r.lat));
  const minLng = Math.min(...route.map(r => r.lng));
  const maxLng = Math.max(...route.map(r => r.lng));

  const pts = route.map(r => ({
    x: 40 + ((r.lng - minLng) / (maxLng - minLng || 1)) * 320,
    y: 200 - ((r.lat - minLat) / (maxLat - minLat || 1)) * 160,
    name: r.name,
    label: r.label,
  }));

  const pathD = `M ${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox="0 0 400 240" className="w-full h-[260px] bg-slate-50">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" />
        </pattern>
        <filter id="shadow-dm" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      
      {/* Route Line */}
      <path d={pathD} fill="none" stroke="#006c49" strokeWidth="3" strokeDasharray="6,6" opacity="0.8" />
      
      {/* Stops */}
      {pts.map((p, i) => {
        const isWarehouse = i === 0;
        return (
          <g key={i} filter="url(#shadow-dm)">
            <circle cx={p.x} cy={p.y} r={isWarehouse ? 16 : 13} fill={isWarehouse ? '#003527' : '#006c49'} />
            <circle cx={p.x} cy={p.y} r={isWarehouse ? 16 : 13} fill="none" stroke="white" strokeWidth="2.5" />
            <text x={p.x} y={p.y} fill="white" fontSize={isWarehouse ? "14" : "12"} fontWeight="bold" textAnchor="middle" dominantBaseline="central">
              {p.label}
            </text>
            <rect x={p.x - 30} y={p.y + 18} width="60" height="14" rx="4" fill="white" fillOpacity="0.9" />
            <text x={p.x} y={p.y + 25} fill="#475569" fontSize="8" fontWeight="bold" textAnchor="middle">
              {p.name.substring(0, 15)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 3-D TRUCK LOADING VIZ
// ─────────────────────────────────────────────────────────────
function Truck3D({
  cartons,
  loadedSet,
}: {
  cartons: typeof ALL_MANIFESTS[0]['cartons'];
  loadedSet: Set<string>;
}) {
  const COLS = 5;
  const totalCartons = cartons.length;
  const loadedCount = loadedSet.size;
  const pct = totalCartons > 0 ? Math.round((loadedCount / totalCartons) * 100) : 0;

  return (
    <div className="select-none">
      {/* Truck illustration */}
      <div style={{ perspective: '700px' }} className="flex justify-center">
        <div style={{ transform: 'rotateX(14deg) rotateY(-8deg)', transformStyle: 'preserve-3d' }}>

          {/* --- Truck body row --- */}
          <div className="flex items-end gap-0">

            {/* Cab */}
            <div className="relative flex-shrink-0" style={{ width: 60, height: 100 }}>
              {/* Cab body */}
              <div className="absolute bottom-0 left-0 right-0 bg-primary rounded-tl-2xl rounded-bl-sm" style={{ height: 96 }} />
              {/* Windshield */}
              <div className="absolute bg-sky-300/80 rounded border border-sky-200" style={{ top: 14, left: 6, right: 8, height: 38 }} />
              {/* Side mirror */}
              <div className="absolute bg-slate-700 rounded" style={{ top: 28, right: 1, width: 5, height: 8 }} />
              {/* Headlight */}
              <div className="absolute bg-amber-300 rounded-full" style={{ bottom: 18, right: 4, width: 8, height: 6 }} />
            </div>

            {/* Cargo Bay */}
            <div
              className="relative rounded-r-sm overflow-hidden"
              style={{
                width: 260,
                height: 100,
                background: 'linear-gradient(170deg, #1e293b 0%, #0f172a 100%)',
                border: '2px solid #334155',
                boxShadow: '6px 6px 0 #090d13, inset 0 0 0 1px rgba(255,255,255,0.04)',
              }}
            >
              {/* Inner glow top */}
              <div className="absolute inset-x-0 top-0 h-3" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.06), transparent)' }} />

              {/* Carton grid */}
              <div
                className="absolute inset-2 grid gap-1"
                style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
              >
                {cartons.map((ctn) => {
                  const loaded = loadedSet.has(ctn.barcode);
                  const color = ORDER_COLORS[ctn.order] ?? '#64748b';
                  return (
                    <AnimatePresence key={ctn.barcode}>
                      <motion.div
                        layout
                        initial={{ scale: 0, opacity: 0 }}
                        animate={
                          loaded
                            ? { scale: 1, opacity: 1, backgroundColor: color }
                            : { scale: 1, opacity: 1, backgroundColor: '#1e3a5f' }
                        }
                        transition={{ duration: 0.35, type: 'spring', stiffness: 260, damping: 22 }}
                        title={loaded ? `${ctn.barcode} — ${ctn.contents}` : 'Empty slot'}
                        className="rounded-sm relative overflow-hidden cursor-default"
                        style={{
                          border: loaded ? `1px solid ${color}88` : '1px solid #334155',
                          boxShadow: loaded ? `inset 0 -2px 0 rgba(0,0,0,0.35)` : 'none',
                        }}
                      >
                        {loaded && (
                          <div
                            className="absolute inset-x-0 top-0 h-1/3 rounded-t-sm"
                            style={{ background: 'rgba(255,255,255,0.18)' }}
                          />
                        )}
                      </motion.div>
                    </AnimatePresence>
                  );
                })}
              </div>

              {/* Door lines */}
              <div className="absolute inset-y-0 right-0 flex flex-col justify-around pointer-events-none">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="w-full border-b border-slate-600/40" />
                ))}
              </div>
              <div className="absolute inset-y-4 right-4 w-px bg-slate-600/50" />

              {/* Loading % overlay badge */}
              <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-black px-2 py-0.5 rounded-full border border-white/10">
                {pct}% LOADED
              </div>
            </div>

            {/* Right face (depth side) */}
            <div
              style={{
                width: 14,
                height: 100,
                background: 'linear-gradient(to right, #0f172a, #1a2540)',
                border: '1px solid #1e293b',
                borderLeft: 'none',
                flexShrink: 0,
              }}
            />
          </div>

          {/* Top face */}
          <div
            style={{
              width: 334,
              height: 14,
              marginTop: -2,
              background: 'linear-gradient(to bottom, #2d3f5a, #1e2f47)',
              border: '1px solid #334155',
              borderBottom: 'none',
              transform: 'rotateX(90deg)',
              transformOrigin: 'top center',
            }}
          />

          {/* Wheels */}
          <div className="flex items-center mt-1.5" style={{ paddingLeft: 10 }}>
            {/* Front wheels (cab) */}
            <div className="flex gap-1">
              <div className="rounded-full bg-slate-700 border-2 border-slate-500 flex items-center justify-center" style={{ width: 22, height: 22 }}>
                <div className="rounded-full bg-slate-500" style={{ width: 8, height: 8 }} />
              </div>
            </div>
            <div style={{ width: 28 }} />
            {/* Rear wheels */}
            <div className="flex gap-1" style={{ marginLeft: 100 }}>
              {[0, 1].map(i => (
                <div key={i} className="rounded-full bg-slate-700 border-2 border-slate-500 flex items-center justify-center" style={{ width: 22, height: 22 }}>
                  <div className="rounded-full bg-slate-500" style={{ width: 8, height: 8 }} />
                </div>
              ))}
            </div>
            <div style={{ width: 8 }} />
            <div className="flex gap-1">
              {[0, 1].map(i => (
                <div key={i} className="rounded-full bg-slate-700 border-2 border-slate-500 flex items-center justify-center" style={{ width: 22, height: 22 }}>
                  <div className="rounded-full bg-slate-500" style={{ width: 8, height: 8 }} />
                </div>
              ))}
            </div>
          </div>

          {/* Ground shadow */}
          <div
            className="mx-auto mt-1 rounded-full"
            style={{ width: 310, height: 8, background: 'radial-gradient(ellipse, rgba(0,0,0,0.22) 0%, transparent 80%)' }}
          />
        </div>
      </div>

      {/* Loading progress bar */}
      <div className="mt-5 space-y-1.5">
        <div className="flex justify-between items-center text-xs font-bold text-on-surface-variant">
          <span>Cargo Load</span>
          <span className="text-primary">{loadedCount} / {totalCartons} cartons</span>
        </div>
        <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #006c49, #00a86b)' }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Carton legend */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Object.entries(
          cartons.reduce((acc, ctn) => {
            if (!acc[ctn.order]) acc[ctn.order] = { order: ctn.order, customer: ctn.customer, count: 0, loaded: 0 };
            acc[ctn.order].count++;
            if (loadedSet.has(ctn.barcode)) acc[ctn.order].loaded++;
            return acc;
          }, {} as Record<string, { order: string; customer: string; count: number; loaded: number }>)
        ).map(([lpo, info]) => (
          <div
            key={lpo}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold bg-white border border-outline-variant"
          >
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ORDER_COLORS[lpo] ?? '#64748b' }} />
            <span className="text-on-surface-variant truncate max-w-[80px]">{info.customer.split(' ').slice(0, 2).join(' ')}</span>
            <span className="text-primary">{info.loaded}/{info.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
export default function DeliveryManifest() {
  const navigate = useNavigate();
  const manifests = ALL_MANIFESTS;
  const [activeTab, setActiveTab] = useState<'all' | 'today' | 'pending'>('all');
  const [selectedId, setSelectedId] = useState<number>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const selected = manifests.find(m => m.id === selectedId) ?? manifests[0];

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setGenerated(true);
      setTimeout(() => setGenerated(false), 3000);
    }, 2200);
  };

  const filtered = manifests.filter(m => {
    if (activeTab === 'today') return true;
    if (activeTab === 'pending') return m.status === 'draft' || m.status === 'loading';
    return true;
  });

  const kpis = [
    { label: 'Total Manifests', value: manifests.length, icon: FileText, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
    { label: 'Vehicles Assigned', value: manifests.filter(m => m.status !== 'draft').length, icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
    { label: 'Orders Clubbed', value: manifests.reduce((a, m) => a + m.orders.length, 0), icon: Package2, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
    { label: 'Total Cartons', value: manifests.reduce((a, m) => a + m.cartons.length, 0), icon: Box, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  ];

  // Build a loaded set for selected manifest (for demo: manifest 2 is "loading", show half loaded)
  const demoLoadedSet = new Set<string>(
    selected.status === 'loading'
      ? selected.cartons.slice(0, Math.ceil(selected.cartons.length * 0.6)).map(c => c.barcode)
      : selected.status === 'ready'
      ? selected.cartons.map(c => c.barcode)
      : []
  );

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface flex items-center gap-2.5">
            <Truck className="w-6 h-6 text-primary" />
            <span>Delivery Manifest</span>
            <span className="bg-primary-container text-on-primary-container text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Auto-Clustering Demo
            </span>
          </h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Auto-club orders to vehicles · route optimisation · 3D cargo load view
          </p>
        </div>

        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            {generated && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-emerald-700 text-xs font-bold bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-full"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Manifests Generated!
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="bg-primary text-white font-bold shadow-sm"
          >
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Clustering Orders…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Generate Manifests
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`p-5 rounded-2xl border ${k.bg} shadow-xs flex items-center justify-between`}
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{k.label}</div>
              <div className="text-3xl font-black text-on-surface mt-1">{k.value}</div>
            </div>
            <div className={`p-2.5 bg-white rounded-xl shadow-xs ${k.color}`}>
              <k.icon className="w-5 h-5" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Manifest Table ── */}
      <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant shadow-sm space-y-6">
        {/* Tab bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-outline-variant pb-4">
          <div className="flex bg-surface-container-low p-1.5 rounded-xl border border-outline-variant flex-wrap gap-1">
            {(['all', 'today', 'pending'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
                  activeTab === tab ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                {tab === 'all' ? 'All Manifests' : tab === 'today' ? "Today's Route" : 'Pending Dispatch'}
              </button>
            ))}
          </div>
          <span className="text-xs text-on-surface-variant font-semibold">
            Showing <strong>{filtered.length}</strong> manifests
          </span>
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
          <table className="w-full text-left text-sm text-on-surface">
            <thead className="bg-surface text-on-surface-variant text-xs uppercase font-medium">
              <tr>
                {['Manifest #', 'Vehicle', 'Driver & Incharge', 'Stops', 'Orders', 'Cartons', 'Distance', 'Departure', 'Status', ''].map(h => (
                  <th key={h} className="px-6 py-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => (
                <motion.tr
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={`border-t border-outline-variant transition-colors cursor-pointer ${
                    selectedId === m.id ? 'bg-primary/5' : 'hover:bg-surface/50'
                  }`}
                >
                  <td className="px-6 py-4 font-semibold text-primary whitespace-nowrap">
                    {m.number}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-on-surface">{m.vehicle.plate}</div>
                    <div className="text-xs text-on-surface-variant">{m.vehicle.type}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-on-surface">{m.driver}</div>
                    <div className="text-xs text-on-surface-variant">IC: {m.incharge}</div>
                  </td>
                  <td className="px-6 py-4 font-medium">{m.route.length - 1}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 bg-surface-container-highest px-2.5 py-1 rounded-md text-xs font-semibold">
                      <Package2 className="w-3.5 h-3.5 text-primary" />
                      {m.orders.length}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium">{m.cartons.length}</td>
                  <td className="px-6 py-4 text-on-surface-variant whitespace-nowrap">{m.distance}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant whitespace-nowrap">
                      <Clock className="w-3.5 h-3.5" />{m.departure}
                    </span>
                  </td>
                  <td className="px-6 py-4"><ManifestBadge status={m.status} /></td>
                  <td className="px-6 py-4">
                    <Button
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); navigate(`/delivery/loading/${m.id}`); }}
                      className="gap-1.5"
                    >
                      <Truck className="w-3.5 h-3.5" /> Load <ArrowRight className="w-3 h-3" />
                    </Button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detail Panel: Map + Truck 3D ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-5"
        >
          {/* Route Map */}
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface flex items-center gap-2">
                <Navigation2 className="w-4 h-4 text-primary" />
                Route Map — {selected.number}
              </h3>
              <a
                href={`https://www.google.com/maps/dir/${selected.route.map(r => `${r.lat},${r.lng}`).join('/')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <MapPin className="w-3.5 h-3.5" /> Open in Google Maps
              </a>
            </div>

            <div className="rounded-xl overflow-hidden border border-outline-variant">
              <RouteMapSVG route={selected.route} />
            </div>

            {/* Stop list */}
            <div className="space-y-1.5">
              {selected.route.map((stop, i) => (
                <div key={i} className="flex items-center gap-2.5 text-xs">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white font-black text-[10px] flex-shrink-0"
                    style={{ backgroundColor: i === 0 ? '#003527' : '#006c49' }}
                  >
                    {stop.label}
                  </div>
                  <span className={`font-semibold ${i === 0 ? 'text-primary' : 'text-on-surface'}`}>{stop.name}</span>
                  {i === 0 && <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">DEPOT</span>}
                </div>
              ))}
            </div>
          </div>

          {/* 3D Truck + Order Manifest */}
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Cargo Load — 3D View
              </h3>
              <span className="text-xs font-bold text-on-surface-variant">{selected.vehicle.plate} · {selected.vehicle.type}</span>
            </div>

            <Truck3D cartons={selected.cartons} loadedSet={demoLoadedSet} />

            {/* Orders on this manifest */}
            <div className="border-t border-outline-variant pt-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Clubbed Orders ({selected.orders.length})</h4>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {selected.orders.map((ord) => (
                  <div key={ord.lpo} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-container border border-outline-variant">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: ORDER_COLORS[ord.lpo] ?? '#64748b' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-xs text-primary">{ord.lpo}</span>
                        <span className="font-semibold text-xs text-on-surface truncate">{ord.customer}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 text-[10px] font-bold text-on-surface-variant flex-shrink-0">
                      <span className="bg-white border border-outline-variant px-1.5 py-0.5 rounded">{ord.cartons} ctns</span>
                      <span className="bg-white border border-outline-variant px-1.5 py-0.5 rounded">{ord.items} SKUs</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => navigate(`/delivery/loading/${selected.id}`)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-secondary transition-colors shadow-sm"
            >
              <Truck className="w-4 h-4" />
              Start Vehicle Loading — {selected.number}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

    </div>
  );
}
