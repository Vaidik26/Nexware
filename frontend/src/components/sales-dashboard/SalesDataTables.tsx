import { useState, useMemo } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { clsx } from 'clsx';

const formatNum = (v: number, isKg = false) => {
  if (!v) return '—';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: isKg ? 0 : 2
  }).format(v);
};

export default function SalesDataTables({ data, bootData, filters, onFilterChange }: { data: any, bootData: any, filters: any, onFilterChange: any }) {
  const [maximizedTable, setMaximizedTable] = useState<string | null>(null);

  if (!data || !bootData) return null;

  // Process raw SKU data from the RPC response and catalogue
  const processedSkus = useMemo(() => {
    if (!data.skus || !bootData.catalogue) return [];
    
    // catalogue is an array of {code, desc, product, cat, active}
    const catMap = new Map(bootData.catalogue.map((c: any) => [c.code, c]));

    return data.skus.map((s: any) => {
      const code = String(s[0]);
      const meta: any = catMap.get(code) || { product: 'Other', cat: 'OTHER ITEMS', desc: code };
      return {
        code,
        desc: meta.desc,
        product: meta.product,
        cat: meta.cat,
        gross: Number(s[1]) || 0,
        returns: Number(s[2]) || 0,
        net: (Number(s[1]) || 0) - (Number(s[2]) || 0),
        kg: Number(s[3]) || 0,
        qty: Number(s[4]) || 0
      };
    });
  }, [data.skus, bootData.catalogue]);

  // Aggregate for Category
  const categoryData = useMemo(() => {
    const map = new Map();
    processedSkus.forEach((s: any) => {
      if (!map.has(s.cat)) map.set(s.cat, { name: s.cat, gross: 0, net: 0, returns: 0, kg: 0 });
      const curr = map.get(s.cat);
      curr.gross += s.gross;
      curr.net += s.net;
      curr.returns += s.returns;
      curr.kg += s.kg;
    });
    return Array.from(map.values()).sort((a: any, b: any) => b.gross - a.gross);
  }, [processedSkus]);

  // Aggregate for Product
  const productData = useMemo(() => {
    const map = new Map();
    processedSkus.forEach((s: any) => {
      if (!map.has(s.product)) map.set(s.product, { name: s.product, gross: 0, net: 0, returns: 0, kg: 0 });
      const curr = map.get(s.product);
      curr.gross += s.gross;
      curr.net += s.net;
      curr.returns += s.returns;
      curr.kg += s.kg;
    });
    return Array.from(map.values()).sort((a: any, b: any) => b.gross - a.gross);
  }, [processedSkus]);

  const SimpleTable = ({ title, columns, rowData, onRowClick, interactive = false, isRowSelected }: { title: string, columns: any[], rowData: any[], onRowClick?: (row: any) => void, interactive?: boolean, isRowSelected?: (row: any) => boolean }) => {
    const isMax = maximizedTable === title;
    const [search, setSearch] = useState('');

    const filteredRows = useMemo(() => {
      if (!search) return rowData;
      const lowerSearch = search.toLowerCase();
      return rowData.filter((row: any) => 
        columns.some(col => {
          const val = row[col.key];
          return val && String(val).toLowerCase().includes(lowerSearch);
        })
      );
    }, [search, rowData, columns]);

    return (
      <div className={clsx(
        "bg-white flex flex-col transition-all duration-300",
        isMax 
          ? "fixed inset-4 z-50 rounded-2xl shadow-2xl border-2 border-primary overflow-hidden" 
          : "border border-slate-200 rounded-xl shadow-sm h-96 relative"
      )}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 gap-4">
          <h2 className="text-sm font-bold text-slate-900 whitespace-nowrap">{title}</h2>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <input
              type="text"
              placeholder="Search in table..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs border border-slate-300 rounded px-2 py-1 outline-none focus:border-primary w-full max-w-[200px]"
            />
            <button 
              onClick={() => setMaximizedTable(isMax ? null : title)}
              className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
              title={isMax ? "Restore" : "View Full Screen"}
            >
              {isMax ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="overflow-auto flex-1 p-0">
          <table className="w-full min-w-[700px] text-xs text-left">
            <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
              <tr>
                {columns.map((c, i) => (
                  <th key={i} className={clsx("p-3 font-semibold text-slate-600 whitespace-nowrap", c.align === 'right' && 'text-right')}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center p-8 text-slate-400">No data found</td>
                </tr>
                ) : filteredRows.map((row, i) => {
                  const selected = isRowSelected ? isRowSelected(row) : false;
                  return (
                  <tr 
                    key={i} 
                    onClick={() => onRowClick && onRowClick(row)}
                    className={clsx(
                      "border-b border-slate-100 transition-all",
                      interactive ? "cursor-pointer" : "hover:bg-slate-50",
                      interactive && !selected && "hover:bg-primary/5 active:bg-primary/10",
                      selected && "bg-primary/10 border-l-2 border-l-primary"
                    )}
                    title={interactive ? (selected ? "Click to deselect" : "Click to filter") : ""}
                  >
                  {columns.map((c, j) => (
                    <td key={j} className={clsx("p-3 text-slate-700 whitespace-nowrap", c.align === 'right' && 'text-right', c.bold && 'font-semibold')}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                  </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
      {maximizedTable && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm" onClick={() => setMaximizedTable(null)} />
      )}
      <div className="grid grid-cols-1 gap-4 mt-4">
        <SimpleTable 
          title="Category" 
          columns={[
            { header: 'Category', key: 'name', bold: true },
            { header: 'Gross', key: 'gross', align: 'right', render: (r: any) => formatNum(r.gross) },
            { header: 'Net', key: 'net', align: 'right', render: (r: any) => formatNum(r.net) },
            { header: 'Returns', key: 'returns', align: 'right', render: (r: any) => formatNum(r.returns) },
            { header: 'Volume (kg)', key: 'kg', align: 'right', render: (r: any) => formatNum(r.kg, true) },
          ]}
          rowData={categoryData}
          interactive={true}
          isRowSelected={(row) => filters.categories?.has(row.name)}
          onRowClick={(row) => {
            const catName = row.name;
            const newCats = new Set(filters.categories || []);
            if (newCats.has(catName)) {
              newCats.delete(catName);
            } else {
              newCats.add(catName);
            }
            onFilterChange({ ...filters, categories: newCats });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
        <SimpleTable 
          title="Product" 
          columns={[
            { header: 'Product', key: 'name', bold: true },
            { header: 'Gross', key: 'gross', align: 'right', render: (r: any) => formatNum(r.gross) },
            { header: 'Net', key: 'net', align: 'right', render: (r: any) => formatNum(r.net) },
            { header: 'Returns', key: 'returns', align: 'right', render: (r: any) => formatNum(r.returns) },
            { header: 'Volume (kg)', key: 'kg', align: 'right', render: (r: any) => formatNum(r.kg, true) },
          ]}
          rowData={productData}
          interactive={true}
          isRowSelected={(row) => filters.products?.has(row.name)}
          onRowClick={(row) => {
            const newProds = new Set(filters.products || []);
            if (newProds.has(row.name)) {
              newProds.delete(row.name);
            } else {
              newProds.add(row.name);
            }
            // Bottom-up: auto-check parent category
            const parentCat = bootData.catalogue?.find((c: any) => c.product === row.name)?.cat;
            const newCats = new Set(filters.categories || []);
            if (newProds.size > 0 && parentCat) newCats.add(parentCat);
            onFilterChange({ ...filters, products: newProds, categories: newCats });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
        <SimpleTable 
          title="SKU Detail" 
          columns={[
            { header: 'Code', key: 'code', bold: true },
            { header: 'Description', key: 'desc' },
            { header: 'Gross', key: 'gross', align: 'right', render: (r: any) => formatNum(r.gross) },
            { header: 'Net', key: 'net', align: 'right', render: (r: any) => formatNum(r.net) },
            { header: 'Returns', key: 'returns', align: 'right', render: (r: any) => formatNum(r.returns) },
            { header: 'Volume (kg)', key: 'kg', align: 'right', render: (r: any) => formatNum(r.kg, true) },
            { header: 'Qty', key: 'qty', align: 'right', render: (r: any) => formatNum(r.qty, true) },
          ]}
          rowData={[...processedSkus].sort((a, b) => b.gross - a.gross)}
          interactive={true}
          isRowSelected={(row) => filters.skus?.has(row.code)}
          onRowClick={(row) => {
            const newSkus = new Set(filters.skus || []);
            if (newSkus.has(row.code)) {
              newSkus.delete(row.code);
            } else {
              newSkus.add(row.code);
            }
            // Bottom-up: auto-check parent product & category
            const meta = bootData.catalogue?.find((c: any) => c.code === row.code);
            const newProds = new Set(filters.products || []);
            const newCats = new Set(filters.categories || []);
            if (newSkus.size > 0 && meta) {
              newProds.add(meta.product);
              newCats.add(meta.cat);
            }
            onFilterChange({ ...filters, skus: newSkus, products: newProds, categories: newCats });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
        <SimpleTable 
          title="Customers (Top N)" 
          columns={[
            { header: 'ID', key: '0', bold: true },
            { header: 'Name', key: '1' },
            { header: 'Gross', key: '2', align: 'right', render: (r: any) => formatNum(r[2]) },
            { header: 'Net', key: '4', align: 'right', render: (r: any) => formatNum((r[2] || 0) - (r[3] || 0)) },
            { header: 'Returns', key: '3', align: 'right', render: (r: any) => formatNum(r[2] - r[3]) },
            { header: 'Volume (kg)', key: '4', align: 'right', render: (r: any) => formatNum(r[4], true) },
          ]}
          rowData={data.custs || []}
          interactive={true}
          isRowSelected={(row) => filters.customers?.has(String(row[0]))}
          onRowClick={(row) => {
            const custId = String(row[0]);
            const newCusts = new Set(filters.customers || []);
            if (newCusts.has(custId)) {
              newCusts.delete(custId);
            } else {
              newCusts.add(custId);
            }
            onFilterChange({ ...filters, customers: newCusts });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
    </>
  );
}
