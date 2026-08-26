export const SUPABASE_URL = import.meta.env.VITE_SALES_APP_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SALES_APP_SUPABASE_ANON_KEY;

let BOOT: any = null;
let BOOT_PROMISE: Promise<any> | null = null;

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
    const areaP = fetch("/sales-app/area_customers.json").then(r => r.ok ? r.json() : null).catch(() => null);
    const nameP = fetch("/sales-app/item_names.json").then(r => r.ok ? r.json() : null).catch(() => null);
    
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
