import { useAuthStore } from '@/store/authStore';

export const SUPABASE_URL = import.meta.env.VITE_SALES_APP_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SALES_APP_SUPABASE_ANON_KEY;

let BOOT: any = null;
let BOOT_PROMISE: Promise<any> | null = null;

async function sbSelect(table: string, cols: string) {
  const token = useAuthStore.getState().token;
  if (!token) throw new Error('no signed-in token in this session');
  
  const DIM_PAGE = 1000;
  const out: any[] = [];
  
  let from = 0;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${cols}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: 'count=exact',
        'Range-Unit': 'items',
        Range: `${from}-${from + DIM_PAGE - 1}`
      }
    });
    
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}${res.status === 404 ? ' (table not created yet)' : ''}`);
    }
    
    const rows = await res.json();
    for (const r of rows) out.push(r);
    
    const totalStr = res.headers.get('content-range') || '';
    const total = parseInt(totalStr.split('/')[1] || '-1', 10);
    
    from += DIM_PAGE;
    if (total >= 0 ? from >= total : rows.length < DIM_PAGE) return out;
  }
}

function clean(v: any, fallback = '') {
  const s = v == null ? '' : String(v).trim();
  return s || fallback;
}

function mapsFromDim(rows: any[]) {
  const areas: any = {}, sareas: any = {};
  const slot = (m: any, k: string, cross: string) => m[k] || (m[k] = {
    customerIds: [], customerCount: 0, matched: 0, unmatched: 0,
    [cross]: [], direct: 0, van: 0, directIds: [], vanIds: []
  });
  const cross = (s: any, key: string, v: string) => { if (v && s[key].indexOf(v) < 0) s[key].push(v); };
  
  for (const r of rows) {
    const id = +r.customer_id;
    const a = clean(r.area, '(unassigned)').toUpperCase();
    const sa = clean(r.salesman_area, 'Others').toUpperCase();
    const key = r.channel === 'KEY';
    
    for (const [m, k, ck, , ov] of [[areas, a, 'salesmanAreas', sareas, sa], [sareas, sa, 'rawAreas', areas, a]]) {
      const s = slot(m, k as string, ck as string);
      s.customerIds.push(id); s.customerCount++; s.matched++;
      if (key) { s.direct++; s.directIds.push(id); } else { s.van++; s.vanIds.push(id); }
      cross(s, ck as string, ov as string);
    }
  }
  return { areas, salesmanAreas: sareas };
}

function mergeAreaFile(v: any, file: any) {
  const known = new Set<number>();
  for (const m of [v.areas, v.salesmanAreas]) {
    for (const k in m) {
      for (const id of m[k].customerIds) known.add(+id);
    }
  }
  
  const added = new Set<number>();
  for (const [dst, src, cross] of [
    [v.areas, file.areas || {}, 'salesmanAreas'],
    [v.salesmanAreas, file.salesmanAreas || {}, 'rawAreas']
  ]) {
    for (const k in src as any) {
      const s = (src as any)[k];
      const ids = (s.customerIds || []).map(Number).filter((id: number) => !known.has(id));
      if (!ids.length) continue;
      
      const t = (dst as any)[k] || ((dst as any)[k] = {
        customerIds: [], customerCount: 0, matched: 0, unmatched: 0,
        [cross as string]: (s[cross as string] || []).slice(), direct: 0, van: 0, directIds: [], vanIds: []
      });
      const keySet = new Set((s.directIds || []).map(Number));
      const vanSet = new Set((s.vanIds || []).map(Number));
      
      for (const id of ids) {
        t.customerIds.push(id); t.customerCount++; t.matched++; added.add(id);
        if (keySet.has(id)) { t.direct++; t.directIds.push(id); }
        else if (vanSet.has(id)) { t.van++; t.vanIds.push(id); }
      }
    }
  }
  return v;
}

async function loadAreaDim() {
  try {
    const rows = await sbSelect('ng_customer_dim', 'customer_id,area,salesman_area,channel');
    if (!rows.length) throw new Error('table is empty');
    const m = mapsFromDim(rows);
    
    try {
      const res = await fetch('/sales-app/area_customers.json');
      if (res.ok) {
         const file = await res.json();
         mergeAreaFile(m, file);
      }
    } catch(e) {}
    
    return m;
  } catch (err) {
    console.warn('Failed to load from ng_customer_dim, falling back to JSON:', err);
    try {
      const res = await fetch('/sales-app/area_customers.json');
      if (res.ok) return await res.json();
    } catch(e) {}
    return null;
  }
}

async function loadItemDim() {
  try {
    const rows = await sbSelect('ng_item_name', 'item_code,name,product');
    if (!rows.length) throw new Error('table is empty');
    const names: Record<string, string> = {};
    const products: Record<string, string> = {};
    for (const r of rows) {
      names[r.item_code] = r.name;
      if (r.product) products[r.item_code] = r.product;
    }
    const m = { names, products };
    
    try {
      const res = await fetch('/sales-app/item_names.json');
      if (res.ok) {
         const file = await res.json();
         for (const c in (file.names || {})) if (!(c in m.names)) m.names[c] = file.names[c];
         for (const c in (file.products || {})) if (!(c in m.products)) m.products[c] = file.products[c];
      }
    } catch(e) {}
    
    return m;
  } catch (err) {
    console.warn('Failed to load from ng_item_name, falling back to JSON:', err);
    try {
      const res = await fetch('/sales-app/item_names.json');
      if (res.ok) return await res.json();
    } catch(e) {}
    return null;
  }
}

export async function rpc(fn: string, args: any = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase credentials missing. Check VITE_SALES_APP_SUPABASE_URL and KEY in .env');
  }
  
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  });
  
  if (!res.ok) {
    let msg = ""; 
    try { 
      msg = (await res.text()).slice(0, 300); 
    } catch (e) {}
    throw new Error(`Data service error (${res.status}). ${msg}`);
  }
  
  return res.json();
}

export async function loadBootstrap() {
  if (BOOT) return BOOT;
  if (BOOT_PROMISE) return BOOT_PROMISE;
  
  BOOT_PROMISE = (async () => {
    const areaP = loadAreaDim();
    const nameP = loadItemDim();
    
    const b = (await rpc("ng2_bootstrap")) || {};
    if (!b.skus) throw new Error("No published data yet in Sales DB.");
    
    const nm = await nameP;
    if (nm && nm.names) {
      for (const code in nm.names) {
        if (b.skus[code]) b.skus[code][0] = nm.names[code];
      }
    }
    
    const ac = await areaP;
    if (!ac || !ac.areas || !ac.salesmanAreas) {
      console.warn("area_customers.json is missing or invalid");
    }
    
    // Sort and shape catalogue
    const catalogue = Object.entries(b.skus || {}).sort((x, y) => x[0].localeCompare(y[0]))
      .map(([code, att]: any) => ({
        code, 
        desc: att[0] || code, 
        product: att[1] || "Other", 
        cat: att[2] || "OTHER ITEMS",
        active: att[4] === 0 ? 0 : 1
      }));
      
    const result = {
      ...b,
      catalogue,
      areas: ac?.areas || {},
      salesmanAreas: ac?.salesmanAreas || {}
    };
    
    BOOT = result;
    return result;
  })().catch(err => { 
    BOOT_PROMISE = null; 
    throw err; 
  });
  
  return BOOT_PROMISE;
}

export async function fetchDashboardView(args: any) {
  return await rpc("ng2_dashboard", args);
}
