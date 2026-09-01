import { useMemo } from 'react';

export function useDimensionCascade(filters: any, bootData: any) {
  // --- 1. CHANNEL DIMENSION CASCADE (Top-Down Narrowing) ---

  // SArea options: filtered by channel
  const sAreaOptions = useMemo(() => {
    if (!bootData?.salesmanAreas) return [];
    let entries = Object.entries(bootData.salesmanAreas);
    if (filters.channel === 'key') entries = entries.filter(([, data]: any) => data.direct > 0);
    if (filters.channel === 'van') entries = entries.filter(([, data]: any) => data.van > 0);
    
    return entries.map(([name]) => ({ value: name, label: name })).sort((a, b) => a.label.localeCompare(b.label));
  }, [bootData?.salesmanAreas, filters.channel]);

  // Area options: filtered by sareas (if selected) OR channel
  const areaOptions = useMemo(() => {
    if (!bootData?.areas) return [];
    let entries = Object.entries(bootData.areas);
    
    // Narrow by sarea
    if (filters.sareas && filters.sareas.size > 0) {
      const allowedAreas = new Set<string>();
      filters.sareas.forEach((s: string) => {
        const sData = bootData.salesmanAreas?.[s];
        if (sData?.rawAreas) {
          sData.rawAreas.forEach((a: string) => allowedAreas.add(a));
        }
      });
      entries = entries.filter(([name]) => allowedAreas.has(name));
    }
    
    // Narrow by channel
    if (filters.channel === 'key') entries = entries.filter(([, data]: any) => data.direct > 0);
    if (filters.channel === 'van') entries = entries.filter(([, data]: any) => data.van > 0);
    
    return entries.map(([name]) => ({ value: name, label: name })).sort((a, b) => a.label.localeCompare(b.label));
  }, [bootData?.areas, bootData?.salesmanAreas, filters.sareas, filters.channel]);

  // Customer options: filtered by areas (if selected) OR sareas (if selected) OR channel
  const customerOptions = useMemo(() => {
    if (!bootData?.custs) return [];
    
    const allIds = new Set(Object.keys(bootData.custs));
    let validIds = new Set(allIds);

    // Narrow by Area
    if (filters.areas && filters.areas.size > 0) {
      const areaCusts = new Set<string>();
      filters.areas.forEach((a: string) => {
        bootData.areas?.[a]?.customerIds?.forEach((id: number) => areaCusts.add(String(id)));
      });
      validIds = new Set([...validIds].filter(id => areaCusts.has(id)));
    } 
    // Narrow by SArea
    else if (filters.sareas && filters.sareas.size > 0) {
      const sareaCusts = new Set<string>();
      filters.sareas.forEach((s: string) => {
        bootData.salesmanAreas?.[s]?.customerIds?.forEach((id: number) => sareaCusts.add(String(id)));
      });
      validIds = new Set([...validIds].filter(id => sareaCusts.has(id)));
    }

    // Narrow by Channel
    if (filters.channel === 'key' || filters.channel === 'van') {
       // A bit tricky because bootData.custs doesn't have channel per customer directly,
       // but we can look at the areas they belong to, or rely on `currentData.custIds` if we want.
       // Actually, bootData.areas has `directIds` and `vanIds`. Let's build a global set of key/van customers.
       const chanCusts = new Set<string>();
       Object.values(bootData.areas || {}).forEach((aData: any) => {
          if (filters.channel === 'key' && aData.directIds) aData.directIds.forEach((id: number) => chanCusts.add(String(id)));
          if (filters.channel === 'van' && aData.vanIds) aData.vanIds.forEach((id: number) => chanCusts.add(String(id)));
       });
       validIds = new Set([...validIds].filter(id => chanCusts.has(id)));
    }

    // Narrow by what's actually in scope for this user (currentData.custIds)
    // Wait, currentData.custIds is filtered by ALL filters, including products! We only want to filter by territory scope, 
    // but the territory scope is inherently handled because bootData.custs is scoped by backend.
    // We will just return the validIds.
    return [...validIds].map(id => ({ value: id, label: `${id} - ${bootData.custs[id]}` })).sort((a, b) => a.label.localeCompare(b.label));
  }, [bootData?.custs, bootData?.areas, bootData?.salesmanAreas, filters.areas, filters.sareas, filters.channel]);


  // --- 2. PRODUCT DIMENSION CASCADE (Top-Down Narrowing) ---

  const catalogue = bootData?.catalogue || [];

  const categoryOptions = useMemo(() => {
    const cats = new Set<string>();
    catalogue.forEach((c: any) => cats.add(c.cat));
    return Array.from(cats).map(c => ({ value: c, label: c })).sort((a, b) => a.label.localeCompare(b.label));
  }, [catalogue]);

  const productOptions = useMemo(() => {
    let valid = catalogue;
    if (filters.categories && filters.categories.size > 0) {
      valid = valid.filter((c: any) => filters.categories.has(c.cat));
    }
    const prods = new Set<string>();
    valid.forEach((c: any) => prods.add(c.product));
    return Array.from(prods).map(p => ({ value: p, label: p })).sort((a, b) => a.label.localeCompare(b.label));
  }, [catalogue, filters.categories]);

  const skuOptions = useMemo(() => {
    let valid = catalogue;
    if (filters.products && filters.products.size > 0) {
      valid = valid.filter((c: any) => filters.products.has(c.product));
    } else if (filters.categories && filters.categories.size > 0) {
      valid = valid.filter((c: any) => filters.categories.has(c.cat));
    }
    return valid.map((c: any) => ({ value: c.code, label: `${c.code} - ${c.desc}` })).sort((a: any, b: any) => a.label.localeCompare(b.label));
  }, [catalogue, filters.products, filters.categories]);

  return {
    sAreaOptions,
    areaOptions,
    customerOptions,
    categoryOptions,
    productOptions,
    skuOptions
  };
}

export function autoCheckBottomUp(
  changedKey: string, 
  newSet: Set<string>, 
  currentFilters: any, 
  bootData: any
) {
  const next = { ...currentFilters, [changedKey]: newSet };

  // --- CHANNEL DIMENSION AUTO-CHECK ---
  if (changedKey === 'customers' && newSet.size > 0) {
    // Check Areas for these customers
    const autoAreas = new Set(currentFilters.areas || []);
    const autoSareas = new Set(currentFilters.sareas || []);
    
    newSet.forEach(custIdStr => {
      const custId = Number(custIdStr);
      Object.entries(bootData?.areas || {}).forEach(([aName, aData]: any) => {
        if (aData.customerIds?.includes(custId)) {
          autoAreas.add(aName);
        }
      });
      Object.entries(bootData?.salesmanAreas || {}).forEach(([sName, sData]: any) => {
        if (sData.customerIds?.includes(custId)) {
          autoSareas.add(sName);
        }
      });
    });
    next.areas = autoAreas;
    next.sareas = autoSareas;
  }

  if (changedKey === 'areas' && newSet.size > 0) {
    const autoSareas = new Set(currentFilters.sareas || []);
    newSet.forEach(aName => {
      bootData?.areas?.[aName]?.salesmanAreas?.forEach((sName: string) => autoSareas.add(sName));
    });
    next.sareas = autoSareas;
  }

  // --- PRODUCT DIMENSION AUTO-CHECK ---
  if (changedKey === 'skus' && newSet.size > 0) {
    const autoProds = new Set(currentFilters.products || []);
    const autoCats = new Set(currentFilters.categories || []);
    
    const catMap = new Map(); // code -> { product, cat }
    bootData?.catalogue?.forEach((c: any) => catMap.set(c.code, c));

    newSet.forEach(code => {
      const meta = catMap.get(code);
      if (meta) {
        autoProds.add(meta.product);
        autoCats.add(meta.cat);
      }
    });
    next.products = autoProds;
    next.categories = autoCats;
  }

  if (changedKey === 'products' && newSet.size > 0) {
    const autoCats = new Set(currentFilters.categories || []);
    const prodToCat = new Map(); // product -> cat
    bootData?.catalogue?.forEach((c: any) => {
      if (!prodToCat.has(c.product)) prodToCat.set(c.product, c.cat);
    });

    newSet.forEach(prod => {
      const cat = prodToCat.get(prod);
      if (cat) autoCats.add(cat);
    });
    next.categories = autoCats;
  }

  return next;
}
