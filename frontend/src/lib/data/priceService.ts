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
  currency: string;
  local_price: number | null;
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
      currency: record.currency,
      local_price: record.local_price !== undefined ? record.local_price : null,
      fob_price: record.fob_price !== undefined ? record.fob_price : null,
      cif_price: record.cif_price !== undefined ? record.cif_price : null,
    }).catch(e => console.error(e));
  }
}

export async function buildBrandedExportPayload(startDate: string, endDate: string, scopeLabel: string) {
  // Mock for now to prevent compilation errors
  return { scope: scopeLabel, dates: [] };
}
