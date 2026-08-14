export const downloadPicklistPDF = (lpo: any) => {
  if (!lpo) return;
  const rows = (lpo.items || []).map((item: any, i: number) => `
    <tr>
      <td>${i + 1}</td>
      <td style="font-weight:bold">${(item.bin_location || 'N/A').toUpperCase()}</td>
      <td>${item.is_full_carton ? 'Full Carton' : 'Loose'}</td>
      <td>${item.barcode}</td>
      <td><strong>${item.product_name}</strong></td>
      <td><strong>${item.quantity}</strong></td>
      <td>${item.unit || 'PCS'}</td>
      <td style="width:60px; text-align:center;">[ &nbsp; ]</td>
    </tr>`);
  const html = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Picklist - ${lpo.order_number || lpo.lpo_number}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
      h2 { margin-bottom: 4px; }
      .meta { color: #555; margin-bottom: 16px; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #003527; color: white; padding: 8px 10px; text-align: left; font-size: 11px; }
      td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
      tr:nth-child(even) td { background: #f9fafb; }
      .footer { margin-top: 24px; font-size: 10px; color: #888; border-top: 1px solid #ddd; padding-top: 8px; }
      @media print { body { margin: 10px; } }
    </style></head><body>
    <h2>Picklist — ${lpo.order_number || lpo.lpo_number}</h2>
    <div class="meta">
      Customer: <strong>${lpo.customer_name}</strong> &nbsp;|&nbsp;
      Date: <strong>${new Date().toLocaleDateString()}</strong> &nbsp;|&nbsp;
      Items: <strong>${lpo.items?.length || 0}</strong>
    </div>
    <table>
      <thead><tr><th>#</th><th>Bin Loc</th><th>Pkg</th><th>Barcode</th><th>Product Name</th><th>Qty</th><th>Unit</th><th>Picked ✓</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    <div class="footer">NexWare — Noor Ghazal General Trading LLC &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</div>
    </body></html>`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
};

export const downloadPicklistExcel = (lpo: any) => {
  if (!lpo) return;
  const headers = ['#', 'Bin Loc', 'Pkg', 'Barcode', 'Product Name', 'Quantity', 'Unit', 'Picked'];
  const rows = (lpo.items || []).map((item: any, i: number) => [
    i + 1, (item.bin_location || 'N/A').toUpperCase(), item.is_full_carton ? 'Full Carton' : 'Loose', item.barcode, item.product_name, item.quantity, item.unit || 'PCS', ''
  ]);
  const csvContent = [headers, ...rows]
    .map((r: any) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Picklist-${lpo.order_number || lpo.lpo_number}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
