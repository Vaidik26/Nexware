import api from '@/lib/api';

export interface Item {
  id: string;
  sku?: string;
  slNo: number;
  particulars: string;
  bagCtnWeight: number | null;
  weightUnit?: string;
  hasLocal: boolean;
  hasInternational: boolean;
}

export interface PriceRecord {
  id: string;
  itemId: string;
  date: string;
  dubaiLocalPrice: number | null;
  internationalFOB: number | null;
  internationalCIF: number | null;
}

// Helper to format Date to YYYY-MM-DD
function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

const getPastDate = (daysAgo: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return toDateString(d);
};

// Immediately wipe out legacy dummy seed data from localStorage upon loading
try {
  localStorage.removeItem('nexware_m2_items_v1');
  localStorage.removeItem('nexware_m2_records_v1');
  localStorage.removeItem('nexware_m2_last_updated_v1');
  localStorage.removeItem('raw_materials_index');
  localStorage.removeItem('nexware_market_items');
  localStorage.removeItem('nexware_market_prices');
} catch (e) {
  // Ignore storage exceptions in non-browser environments
}

const STORAGE_KEY_ITEMS = 'nexware_live_materials_cache_v2';
const STORAGE_KEY_RECORDS = 'nexware_live_prices_cache_v2';
const STORAGE_KEY_UPDATED = 'nexware_live_last_updated_v2';

// ==========================================
// LIVE API & PERSISTENT SERVICES (ZERO DUMMY DATA)
// ==========================================

export async function getItems(): Promise<Item[]> {
  try {
    const res = await api.get('/market/materials');
    const dbData = res.data || [];
    if (Array.isArray(dbData)) {
      const sorted = [...dbData].sort((a: any, b: any) => (Number(a.id) || 0) - (Number(b.id) || 0));
      const mapped: Item[] = sorted.map((m: any, idx: number) => ({
        id: String(m.id ?? m.material_code ?? idx),
        sku: String(m.material_code || m.sku || m.id || idx),
        slNo: idx + 1,
        particulars: m.material_name || m.name || 'Unnamed Commodity',
        bagCtnWeight: m.bag_carton_weight !== undefined ? Number(m.bag_carton_weight) : null,
        weightUnit: m.weight_unit || m.unit || 'kg',
        hasLocal: m.market_type === 'dubai' || m.market_type === 'both' || !m.market_type,
        hasInternational: m.market_type === 'international' || m.market_type === 'both' || !m.market_type,
      }));
      try {
        localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(mapped));
      } catch (e) {
        console.error(e);
      }
      return mapped;
    }
  } catch (err) {
    // If backend server is unreachable, return live cached data if available (never dummy data)
    try {
      const cached = localStorage.getItem(STORAGE_KEY_ITEMS);
      if (cached) {
        const parsed: Item[] = JSON.parse(cached);
        return parsed.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0)).map((m, idx) => ({ 
          ...m, 
          sku: m.sku || String(m.id || idx),
          slNo: idx + 1 
        }));
      }
    } catch (e) {
      console.error(e);
    }
  }
  return [];
}

export async function getItemById(itemId: string): Promise<Item | null> {
  const items = await getItems();
  return items.find(i => i.id === itemId) || null;
}

async function fetchPriceRecords(): Promise<PriceRecord[]> {
  try {
    const [dubaiRes, intlRes] = await Promise.all([
      api.get('/market/dubai-prices').catch(() => ({ data: null })),
      api.get('/market/international-prices').catch(() => ({ data: null })),
    ]);

    const dubaiList = Array.isArray(dubaiRes.data) ? dubaiRes.data : null;
    const intlList = Array.isArray(intlRes.data) ? intlRes.data : null;

    // If API calls returned valid arrays, synthesize them by commodity and date
    if (dubaiList !== null || intlList !== null) {
      const recordMap: Record<string, PriceRecord> = {};

      (dubaiList || []).forEach((d: any) => {
        const key = `${d.material_id}_${d.date}`;
        recordMap[key] = {
          id: String(d.id ?? key),
          itemId: String(d.material_id),
          date: String(d.date),
          dubaiLocalPrice: d.local_market_price !== undefined ? Number(d.local_market_price) : null,
          internationalFOB: null,
          internationalCIF: null,
        };
      });

      (intlList || []).forEach((i: any) => {
        const key = `${i.material_id}_${i.date}`;
        if (recordMap[key]) {
          recordMap[key].internationalFOB = i.fob_price !== undefined ? Number(i.fob_price) : null;
          recordMap[key].internationalCIF = i.cif_price !== undefined ? Number(i.cif_price) : null;
        } else {
          recordMap[key] = {
            id: String(i.id ?? key),
            itemId: String(i.material_id),
            date: String(i.date),
            dubaiLocalPrice: null,
            internationalFOB: i.fob_price !== undefined ? Number(i.fob_price) : null,
            internationalCIF: i.cif_price !== undefined ? Number(i.cif_price) : null,
          };
        }
      });

      const merged = Object.values(recordMap);
      try {
        localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(merged));
      } catch (e) {
        console.error(e);
      }
      return merged;
    }
  } catch (err) {
    console.error('Failed to query pricing API, falling back to local cache:', err);
  }

  // Fallback to real cached records if offline (no dummy records generated)
  try {
    const cached = localStorage.getItem(STORAGE_KEY_RECORDS);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    console.error(e);
  }
  return [];
}

export interface LatestPriceSummary {
  item: Item;
  latest: PriceRecord | null;
  previous: PriceRecord | null;
  todayRecord: PriceRecord | null;
  lastRecordedLocal: { value: number | null; date: string | null };
  lastRecordedInt: { fob: number | null; cif: number | null; date: string | null };
  sparklineLocal: number[];
  sparklineFOB: number[];
  sparklineCIF: number[];
  dayOverDayLocalChange: number | null;
  dayOverDayIntChange: number | null;
  regionalSpreadPct: number | null;
}

export async function getLatestPrices(targetDate?: string): Promise<LatestPriceSummary[]> {
  const [items, allRecords] = await Promise.all([getItems(), fetchPriceRecords()]);
  const activeDateStr = targetDate || toDateString(new Date());
  const todayStr = activeDateStr;

  const summaries: LatestPriceSummary[] = items.map(item => {
    const itemRecords = allRecords
      .filter(r => r.itemId === item.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const latest = itemRecords.length > 0 ? itemRecords[0] : null;
    const previous = itemRecords.length > 1 ? itemRecords[1] : null;
    const todayRecord = itemRecords.find(r => r.date === activeDateStr) || null;

    const validLocalRecord = itemRecords.find(r => r.dubaiLocalPrice !== null);
    const validIntRecord = itemRecords.find(r => r.internationalFOB !== null && r.internationalCIF !== null);

    // Day-over-day change is strictly computed ONLY when both today and prior recorded day have values
    let dayOverDayLocalChange: number | null = null;
    const pastLocalRecords = itemRecords.filter(r => r.dubaiLocalPrice !== null && r.date < todayStr);
    if (todayRecord && todayRecord.dubaiLocalPrice !== null && pastLocalRecords.length > 0) {
      const priorLocal = pastLocalRecords[0].dubaiLocalPrice!;
      const diff = todayRecord.dubaiLocalPrice - priorLocal;
      dayOverDayLocalChange = Number(((diff / priorLocal) * 100).toFixed(2));
    }

    let dayOverDayIntChange: number | null = null;
    const pastIntRecords = itemRecords.filter(r => r.internationalCIF !== null && r.date < todayStr);
    if (todayRecord && todayRecord.internationalCIF !== null && pastIntRecords.length > 0) {
      const priorCif = pastIntRecords[0].internationalCIF!;
      const diff = todayRecord.internationalCIF - priorCif;
      dayOverDayIntChange = Number(((diff / priorCif) * 100).toFixed(2));
    }

    // Regional spread computed strictly per item where both local & international CIF prices exist
    let regionalSpreadPct: number | null = null;
    if (validLocalRecord?.dubaiLocalPrice != null && validIntRecord?.internationalCIF != null) {
      const lPrice = validLocalRecord.dubaiLocalPrice;
      const cPrice = validIntRecord.internationalCIF;
      if (cPrice > 0) {
        regionalSpreadPct = Number(((lPrice - cPrice) / cPrice * 100).toFixed(1));
      }
    }

    // Sparkline arrays from older to newer (excluding nulls)
    const sortedAsc = [...itemRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sparklineLocal = sortedAsc.map(r => r.dubaiLocalPrice).filter((v): v is number => v !== null);
    const sparklineFOB = sortedAsc.map(r => r.internationalFOB).filter((v): v is number => v !== null);
    const sparklineCIF = sortedAsc.map(r => r.internationalCIF).filter((v): v is number => v !== null);

    return {
      item,
      latest,
      previous,
      todayRecord,
      lastRecordedLocal: {
        value: validLocalRecord?.dubaiLocalPrice ?? null,
        date: validLocalRecord?.date ?? null,
      },
      lastRecordedInt: {
        fob: validIntRecord?.internationalFOB ?? null,
        cif: validIntRecord?.internationalCIF ?? null,
        date: validIntRecord?.date ?? null,
      },
      sparklineLocal,
      sparklineFOB,
      sparklineCIF,
      dayOverDayLocalChange,
      dayOverDayIntChange,
      regionalSpreadPct,
    };
  });

  return summaries;
}

export async function getPriceHistory(itemId: string, range: string = 'all'): Promise<PriceRecord[]> {
  const allRecords = await fetchPriceRecords();
  let records = allRecords.filter(r => r.itemId === itemId);

  if (range !== 'all') {
    const days = parseInt(range.replace('d', ''), 10);
    if (!isNaN(days)) {
      const cutoffDate = getPastDate(days);
      records = records.filter(r => r.date >= cutoffDate);
    }
  }

  return records.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function buildBrandedExportPayload(startDate: string, endDate: string, scopeLabel: string) {
  const [items, allRecords] = await Promise.all([getItems(), fetchPriceRecords()]);
  
  const datesSet = new Set<string>();
  allRecords.forEach(r => {
    if (r.date >= startDate && r.date <= endDate) {
      datesSet.add(r.date);
    }
  });
  if (datesSet.size === 0 && startDate === endDate) {
    datesSet.add(startDate);
  }

  const availableDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a));

  return {
    scope: scopeLabel,
    dates: availableDates.map(date => {
      const dateFormatted = new Date(date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
      return {
        date,
        date_formatted: dateFormatted,
        rows: items.map((item, idx) => {
          const rec = allRecords.find(r => r.itemId === item.id && r.date === date);
          const localVal = rec?.dubaiLocalPrice != null ? `${rec.dubaiLocalPrice.toFixed(2)} AED` : '—';
          const cifVal = rec?.internationalCIF != null ? `$${rec.internationalCIF.toFixed(2)}` : '—';
          const fobVal = rec?.internationalFOB != null ? `$${rec.internationalFOB.toFixed(2)}` : '—';
          const weight = item.bagCtnWeight ? `${item.bagCtnWeight} ${item.weightUnit || 'kg'}` : 'Standard Unit';
          return {
            sno: idx + 1,
            commodity: item.particulars,
            weight,
            local_price: localVal,
            cif_price: cifVal,
            fob_price: fobVal
          };
        })
      };
    })
  };
}

export async function saveDailyRates(newRecords: Partial<PriceRecord>[]): Promise<void> {
  const todayStr = toDateString(new Date());
  const existingRecords: PriceRecord[] = (() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RECORDS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  })();

  for (const record of newRecords) {
    if (!record.itemId) continue;
    const targetDate = record.date || todayStr;

    // Send to Dubai local pricing endpoint if provided
    if (record.dubaiLocalPrice !== undefined && record.dubaiLocalPrice !== null) {
      await api.post('/market/dubai-prices', {
        material_id: Number(record.itemId),
        date: targetDate,
        local_market_price: Number(record.dubaiLocalPrice),
      }).catch(() => null);
    }

    // Send to International pricing endpoint if FOB & CIF provided
    if (record.internationalFOB !== undefined && record.internationalFOB !== null &&
        record.internationalCIF !== undefined && record.internationalCIF !== null) {
      await api.post('/market/international-prices', {
        material_id: Number(record.itemId),
        date: targetDate,
        fob_price: Number(record.internationalFOB),
        cif_price: Number(record.internationalCIF),
      }).catch(() => null);
    }

    // Immediately reflect changes in persistent local cache
    const index = existingRecords.findIndex(r => r.itemId === record.itemId && r.date === targetDate);
    if (index !== -1) {
      existingRecords[index] = {
        ...existingRecords[index],
        dubaiLocalPrice: record.dubaiLocalPrice !== undefined ? record.dubaiLocalPrice : existingRecords[index].dubaiLocalPrice,
        internationalFOB: record.internationalFOB !== undefined ? record.internationalFOB : existingRecords[index].internationalFOB,
        internationalCIF: record.internationalCIF !== undefined ? record.internationalCIF : existingRecords[index].internationalCIF,
      };
    } else {
      existingRecords.push({
        id: record.id || `pr-${record.itemId}-${targetDate}-${Date.now()}`,
        itemId: record.itemId,
        date: targetDate,
        dubaiLocalPrice: record.dubaiLocalPrice !== undefined ? record.dubaiLocalPrice : null,
        internationalFOB: record.internationalFOB !== undefined ? record.internationalFOB : null,
        internationalCIF: record.internationalCIF !== undefined ? record.internationalCIF : null,
      });
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(existingRecords));
    localStorage.setItem(STORAGE_KEY_UPDATED, new Date().toISOString());
  } catch (e) {
    console.error(e);
  }
}

export async function getOperationalKPIs(view: 'local' | 'international'): Promise<{
  totalTracked: number;
  missingToday: number;
  recordedToday: number;
  completionRate: number;
  lastUpdated: string;
}> {
  const [items, allRecords] = await Promise.all([getItems(), fetchPriceRecords()]);
  const todayStr = toDateString(new Date());

  const trackedItems = items.filter(i => view === 'local' ? i.hasLocal : i.hasInternational);
  const totalTracked = trackedItems.length;

  let recordedToday = 0;
  trackedItems.forEach(item => {
    const record = allRecords.find(r => r.itemId === item.id && r.date === todayStr);
    if (view === 'local') {
      if (record && record.dubaiLocalPrice !== null) recordedToday++;
    } else {
      if (record && record.internationalFOB !== null && record.internationalCIF !== null) recordedToday++;
    }
  });

  const missingToday = Math.max(0, totalTracked - recordedToday);
  const completionRate = totalTracked > 0 ? Math.round((recordedToday / totalTracked) * 100) : 0;
  const lastUpdatedRaw = localStorage.getItem(STORAGE_KEY_UPDATED) || new Date().toISOString();

  return {
    totalTracked,
    missingToday,
    recordedToday,
    completionRate,
    lastUpdated: lastUpdatedRaw,
  };
}

export async function resetPriceSeeder(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY_ITEMS);
    localStorage.removeItem(STORAGE_KEY_RECORDS);
    localStorage.removeItem(STORAGE_KEY_UPDATED);
  } catch (e) {
    console.error(e);
  }
}
