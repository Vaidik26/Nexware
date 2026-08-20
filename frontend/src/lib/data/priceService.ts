import api from '@/lib/api';

export interface Item {
  id: string;
  sku?: string;
  slNo: number;
  particulars: string;
  bagCtnWeight: number | null;
  weightUnit?: string;
  category?: string;
  market_type?: string; // 'DXB', 'INT', 'BOTH'
  hasLocal?: boolean;
  hasInternational?: boolean;
}

export interface PriceRecord {
  id: string;
  itemId: string;
  date: string;
  price?: number;
  market?: string;
  price_type?: string;
  currency?: string;
  
  // Legacy fields for backward compatibility
  dubaiLocalPrice?: number | null;
  internationalFOB?: number | null;
  internationalCIF?: number | null;
}

export interface RowData {
  id: string;
  item: Item;
  market: string;
  type: string;
  todayRecord: PriceRecord | null;
  lastRecord: PriceRecord | null;
  lastUpdated: string | null;
}

export async function getItems(): Promise<Item[]> {
  const res = await api.get('/market/materials');
  const dbData = res.data || [];
  return dbData.map((m: any, idx: number) => {
    const marketType = (m.market_type || 'BOTH').toUpperCase();
    return {
      id: String(m.id),
      sku: String(m.material_code),
      slNo: idx + 1,
      particulars: m.material_name,
      bagCtnWeight: m.bag_carton_weight,
      weightUnit: m.weight_unit,
      category: m.category,
      market_type: marketType,
      hasLocal: marketType === 'DXB' || marketType === 'BOTH',
      hasInternational: marketType === 'INT' || marketType === 'BOTH',
    };
  });
}

export async function fetchPriceRecords(date_from?: string, date_to?: string): Promise<PriceRecord[]> {
  let url = '/market/prices';
  const params = [];
  if (date_from) params.push(`date_from=${date_from}`);
  if (date_to) params.push(`date_to=${date_to}`);
  if (params.length > 0) url += '?' + params.join('&');
  
  const res = await api.get(url);
  return res.data.map((r: any) => ({
    id: String(r.id),
    itemId: String(r.material_id),
    date: r.date,
    price: r.price,
    market: r.market,
    price_type: r.price_type,
    currency: r.currency,
    dubaiLocalPrice: r.market === 'DXB' && r.price_type === 'LOC' ? r.price : null,
    internationalFOB: r.market === 'INT' && r.price_type === 'FOB' ? r.price : null,
    internationalCIF: r.market === 'INT' && r.price_type === 'CIF' ? r.price : null,
  }));
}

export async function getLatestPrices(targetDate?: string): Promise<RowData[]> {
  const dateStr = targetDate || new Date().toISOString().split('T')[0];
  const items = await getItems();
  const allRecords = await fetchPriceRecords();

  const rows: RowData[] = [];

  for (const item of items) {
    const itemRecords = allRecords
      .filter(r => r.itemId === item.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const addRow = (market: string, type: string) => {
      const typeRecords = itemRecords.filter(r => r.market === market && r.price_type === type);
      const todayRecord = typeRecords.find(r => r.date === dateStr) || null;
      const pastRecords = typeRecords.filter(r => r.date <= dateStr);
      // Last record should be the latest available
      const lastRecord = pastRecords.length > 0 ? pastRecords[0] : null;
      const lastUpdated = lastRecord ? lastRecord.date : null;

      rows.push({
        id: `${item.id}-${market}-${type}`,
        item,
        market,
        type,
        todayRecord,
        lastRecord,
        lastUpdated
      });
    };

    if (item.market_type === 'DXB' || item.market_type === 'BOTH') {
      addRow('DXB', 'LOC');
    }
    if (item.market_type === 'INT' || item.market_type === 'BOTH') {
      addRow('INT', 'FOB');
      addRow('INT', 'CIF');
    }
  }

  return rows;
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
  priorLocalPrice: number | null;
  priorIntCifPrice: number | null;
}

export async function getLatestPriceSummaries(targetDate?: string): Promise<LatestPriceSummary[]> {
  const dateStr = targetDate || new Date().toISOString().split('T')[0];
  const items = await getItems();
  const allRecords = await fetchPriceRecords();

  return items.map(item => {
    const itemRecords = allRecords.filter(r => r.itemId === item.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // Group records by date to synthesize a legacy PriceRecord
    const recordsByDate: Record<string, PriceRecord> = {};
    itemRecords.forEach(r => {
      if (!recordsByDate[r.date]) {
        recordsByDate[r.date] = { id: r.date, itemId: item.id, date: r.date, dubaiLocalPrice: null, internationalFOB: null, internationalCIF: null };
      }
      if (r.market === 'DXB' && r.price_type === 'LOC') recordsByDate[r.date].dubaiLocalPrice = r.price;
      if (r.market === 'INT' && r.price_type === 'FOB') recordsByDate[r.date].internationalFOB = r.price;
      if (r.market === 'INT' && r.price_type === 'CIF') recordsByDate[r.date].internationalCIF = r.price;
    });

    const legacyRecords = Object.values(recordsByDate).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const latest = legacyRecords.length > 0 ? legacyRecords[0] : null;
    const previous = legacyRecords.length > 1 ? legacyRecords[1] : null;
    const todayRecord = legacyRecords.find(r => r.date === dateStr) || null;

    const validLocalRecord = legacyRecords.find(r => r.dubaiLocalPrice !== null);
    const validIntRecord = legacyRecords.find(r => r.internationalFOB !== null && r.internationalCIF !== null);

    let dayOverDayLocalChange: number | null = null;
    const pastLocalRecords = legacyRecords.filter(r => r.dubaiLocalPrice != null && r.date < dateStr);
    if (todayRecord && todayRecord.dubaiLocalPrice != null && pastLocalRecords.length > 0) {
      const priorLocal = pastLocalRecords[0].dubaiLocalPrice!;
      const diff = todayRecord.dubaiLocalPrice - priorLocal;
      dayOverDayLocalChange = Number(((diff / priorLocal) * 100).toFixed(2));
    }

    let dayOverDayIntChange: number | null = null;
    const pastIntRecords = legacyRecords.filter(r => r.internationalCIF != null && r.date < dateStr);
    if (todayRecord && todayRecord.internationalCIF != null && pastIntRecords.length > 0) {
      const priorCif = pastIntRecords[0].internationalCIF!;
      const diff = todayRecord.internationalCIF - priorCif;
      dayOverDayIntChange = Number(((diff / priorCif) * 100).toFixed(2));
    }

    let regionalSpreadPct: number | null = null;
    if (validLocalRecord?.dubaiLocalPrice != null && validIntRecord?.internationalCIF != null) {
      const lPrice = validLocalRecord.dubaiLocalPrice;
      const cPrice = validIntRecord.internationalCIF;
      if (cPrice > 0) regionalSpreadPct = Number(((lPrice - cPrice) / cPrice * 100).toFixed(1));
    }

    const sortedAsc = [...legacyRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sparklineLocal = sortedAsc.map(r => r.dubaiLocalPrice).filter((v): v is number => v !== null);
    const sparklineFOB = sortedAsc.map(r => r.internationalFOB).filter((v): v is number => v !== null);
    const sparklineCIF = sortedAsc.map(r => r.internationalCIF).filter((v): v is number => v !== null);

    return {
      item,
      latest,
      previous,
      todayRecord,
      lastRecordedLocal: { value: validLocalRecord?.dubaiLocalPrice ?? null, date: validLocalRecord?.date ?? null },
      lastRecordedInt: { fob: validIntRecord?.internationalFOB ?? null, cif: validIntRecord?.internationalCIF ?? null, date: validIntRecord?.date ?? null },
      sparklineLocal,
      sparklineFOB,
      sparklineCIF,
      dayOverDayLocalChange,
      dayOverDayIntChange,
      regionalSpreadPct,
      priorLocalPrice: pastLocalRecords.length > 0 ? (pastLocalRecords[0].dubaiLocalPrice ?? null) : null,
      priorIntCifPrice: pastIntRecords.length > 0 ? (pastIntRecords[0].internationalCIF ?? null) : null,
    };
  });
}

export async function saveDailyRates(newRecords: any[]): Promise<void> {
  for (const record of newRecords) {
    await api.post('/market/prices', {
      material_id: Number(record.itemId),
      date: record.date,
      price: record.price,
      market: record.market,
      price_type: record.price_type,
      currency: record.currency,
    });
  }
}

export async function buildBrandedExportPayload(_startDate: string, _endDate: string, scopeLabel: string) {
  return { scope: scopeLabel, dates: [] };
}

export async function getPriceHistory(itemId: string, _range: string = 'all'): Promise<PriceRecord[]> {
  const allRecords = await fetchPriceRecords();
  let itemRecords = allRecords.filter(r => r.itemId === itemId);
  
  // Group into legacy structure
  const recordsByDate: Record<string, PriceRecord> = {};
  itemRecords.forEach(r => {
    if (!recordsByDate[r.date]) {
      recordsByDate[r.date] = { id: r.date, itemId, date: r.date, dubaiLocalPrice: null, internationalFOB: null, internationalCIF: null };
    }
    if (r.market === 'DXB' && r.price_type === 'LOC') recordsByDate[r.date].dubaiLocalPrice = r.price;
    if (r.market === 'INT' && r.price_type === 'FOB') recordsByDate[r.date].internationalFOB = r.price;
    if (r.market === 'INT' && r.price_type === 'CIF') recordsByDate[r.date].internationalCIF = r.price;
  });

  return Object.values(recordsByDate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
