export interface Item {
  id: string;
  sku?: string;
  slNo: number;
  particulars: string;
  bagCtnWeight: number | null;
  weightUnit?: string;
  category: string;
  market_type: string;
}

export interface CapturedPrice {
  id: number;
  material_id: number;
  date: string;
  local_price_aed: number | null;
  local_price_omr: number | null;
  supplier_dubai?: string;
  supplier_oman?: string;
  supplier_int?: string;
  fob_price: number | null;
  cif_price: number | null;
  created_at?: string;
}

export interface LatestPriceSummary {
  item: Item;
  target_price: CapturedPrice | null;
  last_price: CapturedPrice | null;
}

import api from '@/lib/api';

// Helper to format Date to YYYY-MM-DD
function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export async function getLatestPrices(targetDate?: string): Promise<LatestPriceSummary[]> {
  const activeDateStr = targetDate || toDateString(new Date());
  try {
    const res = await api.get(`/market/prices/latest?date_target=${activeDateStr}`);
    const data = res.data || [];
    return data.map((d: any, idx: number) => ({
      item: {
        id: String(d.material.id),
        sku: d.material.material_code,
        slNo: idx + 1,
        particulars: d.material.material_name,
        bagCtnWeight: d.material.bag_carton_weight,
        weightUnit: d.material.weight_unit,
        category: d.material.category,
        market_type: d.material.market_type
      },
      target_price: d.target_price,
      last_price: d.last_price
    }));
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function saveDailyRates(newRecords: any[]): Promise<void> {
  for (const record of newRecords) {
    await api.post('/market/prices', {
      material_id: Number(record.itemId),
      date: record.date,
      local_price_aed: record.local_price_aed !== undefined ? record.local_price_aed : null,
        local_price_omr: record.local_price_omr !== undefined ? record.local_price_omr : null,
        supplier_dubai: record.supplier_dubai || null,
        supplier_oman: record.supplier_oman || null,
        fob_price: record.fob_price !== undefined ? record.fob_price : null,
        cif_price: record.cif_price !== undefined ? record.cif_price : null,
    }).catch(e => console.error(e));
  }
}

export async function buildBrandedExportPayload(startDate: string, endDate: string, scopeLabel: string) {
  console.log(startDate, endDate);
  return { scope: scopeLabel, dates: [] };
}

export interface PriceRecord {
  id: string;
  itemId: string;
  date: string;
  dubaiLocalPrice: number | null;
  internationalFOB: number | null;
  internationalCIF: number | null;
}

export async function getPriceHistory(itemId: string, _range: string /* unused */): Promise<PriceRecord[]> {
  try {
    const res = await api.get(`/market/prices?material_id=${itemId}`);
    return (res.data || []).map((r: any) => ({
      id: String(r.id),
      itemId: String(r.material_id),
      date: r.date,
      dubaiLocalPrice: r.local_price,
      internationalFOB: r.fob_price,
      internationalCIF: r.cif_price,
    }));
  } catch {
    return [];
  }
}

export async function getItems(): Promise<Item[]> {
  try {
    const res = await api.get('/market/materials');
    return (res.data || []).map((m: any, idx: number) => ({
      id: String(m.id),
      sku: m.material_code,
      slNo: idx + 1,
      particulars: m.material_name,
      bagCtnWeight: m.bag_carton_weight,
      weightUnit: m.weight_unit,
      category: m.category,
      market_type: m.market_type
    }));
  } catch {
    return [];
  }
}


export async function importPriceExcel(file: File, targetDate: string, abortSignal?: AbortSignal): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await api.post(`/market/prices/import-excel?date_target=${targetDate}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    signal: abortSignal,
  });
  return res.data;
}

export async function importDailyRatesExcel(file: File, targetDate: string, signal?: AbortSignal): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await api.post(`/market/prices/import-excel?date_target=${targetDate}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    signal
  });
  return res.data;
}
