import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUpload } from '@/components/ui/FileUpload';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CheckCircle2, AlertCircle, Download, FileText, Sparkles, Users, ArrowRight, RefreshCw, Printer } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { PageLoader } from '@/components/ui/PageLoader';
import { getErrorMessage } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';

interface PickItem {
  si: number;
  barcode: string;
  itemNumber?: string;
  itemName: string;
  quantity: number;
  inCatalogue: boolean;
  exceptionReason?: string;
}

export default function OrderUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [pickers, setPickers] = useState<any[]>([]);
  
  const [results, setResults] = useState<{
    orderId?: number;
    orderNumber: string;
    customerName: string;
    items: PickItem[];
  } | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const navigate = useNavigate();

  // Load Sales Catalogue & Active Pickers on mount
  useEffect(() => {
    const fetchPrereqs = async () => {
      try {
        const [catRes, usersRes] = await Promise.all([
          api.get('/catalogue').catch(() => ({ data: [] })),
          api.get('/users').catch(() => ({ data: [] })),
        ]);
        setCatalogue(catRes.data || []);
        setPickers((usersRes.data || []).filter((u: any) => u.role === 'picker'));
      } catch {
        // Silent fallback
      }
    };
    fetchPrereqs();
  }, []);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF documents are supported for barcode extraction.');
      return;
    }

    setIsUploading(true);
    setProgress(30);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setProgress(65);
      const res = await api.post('/orders/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProgress(100);
      setIsUploading(false);

      const data = res.data || {};
      const extracted = data.extracted_data || {};
      const rawItems = extracted.items || data.items || [];
      
      // Re-fetch latest catalogue from API to ensure dependable matching against any recently imported SKUs
      const catRes = await api.get('/catalogue').catch(() => ({ data: catalogue }));
      const currentCatalogue: any[] = catRes.data || catalogue || [];
      if (catRes.data) setCatalogue(catRes.data);

      const cleanBc = (val: any) => String(val || '').trim().replace(/\.0+$/, '');
      const combinedItems: PickItem[] = [];

      // Extract every item from PDF and apply Comprehensive Exception Scenarios Matrix
      rawItems.forEach((itm: any, index: number) => {
        const extractedBarcode = cleanBc(itm.barcode);
        const isMissingBarcode = itm.has_missing_barcode || !extractedBarcode || extractedBarcode === '' || extractedBarcode.toLowerCase() === 'n/a' || extractedBarcode.toLowerCase() === 'none';

        const rawQty = Number(itm.quantity);
        const isMissingQty = itm.has_missing_quantity || itm.quantity === undefined || itm.quantity === null || String(itm.quantity).trim() === '' || isNaN(rawQty) || rawQty <= 0;
        const qty = isMissingQty ? 1 : rawQty;
        
        const catalogueMatch = !isMissingBarcode ? currentCatalogue.find(
          (c) => cleanBc(c.barcode) === extractedBarcode || cleanBc(c.item_number) === extractedBarcode || (itm.description && cleanBc(c.item_name).toLowerCase() === cleanBc(itm.description).toLowerCase())
        ) : null;

        if (isMissingBarcode) {
          // Edge Case 2: Missing / Empty Barcode in PDF Table Row
          combinedItems.push({
            si: index + 1,
            barcode: 'NO-BARCODE-IN-LPO',
            itemNumber: 'EXCEPTION-BC',
            itemName: itm.description || 'Unlisted Commodity Item (Missing Barcode)',
            quantity: qty,
            inCatalogue: false,
            exceptionReason: 'Missing / Empty Barcode in PDF Table Row (Item description exists, but client forgot to print barcode in LPO)',
          });
        } else if (!catalogueMatch) {
          // Edge Case 1: Barcode Value Not Present in System Catalogue
          combinedItems.push({
            si: index + 1,
            barcode: extractedBarcode,
            itemNumber: 'EXCEPTION-CAT',
            itemName: itm.description || `Unlisted Commodity Item (${extractedBarcode})`,
            quantity: qty,
            inCatalogue: false,
            exceptionReason: 'Barcode Value Not Present in System Catalogue (Supplier introduced a new promotional code or packaging size)',
          });
        } else if (isMissingQty) {
          // Edge Case 3: Barcode Present with No Quantity
          combinedItems.push({
            si: index + 1,
            barcode: catalogueMatch.barcode || extractedBarcode,
            itemNumber: catalogueMatch.item_number || `SKU-${index + 1}`,
            itemName: catalogueMatch.item_name || catalogueMatch.name || itm.description || 'Verified Catalogue SKU',
            quantity: 1,
            inCatalogue: false,
            exceptionReason: 'Barcode Present with No Quantity (Client listed item code, but quantity field is blank or non-numeric — defaulted to 1.0 & flagged for review)',
          });
        } else {
          // Normal validated Floor SKU
          combinedItems.push({
            si: index + 1,
            barcode: catalogueMatch.barcode || extractedBarcode,
            itemNumber: catalogueMatch.item_number || `SKU-${index + 1}`,
            itemName: catalogueMatch.item_name || catalogueMatch.name || itm.description || 'Verified Catalogue SKU',
            quantity: qty,
            inCatalogue: true,
          });
        }
      });

      setResults({
        orderId: data.id,
        orderNumber: extracted.order_number || data.order_number || `LPO-${Math.floor(1000 + Math.random() * 9000)}`,
        customerName: extracted.customer_name || data.customer_name || 'General Order',
        items: combinedItems,
      });

      toast.success('LPO document parsed! All barcodes extracted ready for Pick List generation.');
    } catch (err: any) {
      setIsUploading(false);
      setProgress(0);
      toast.error(getErrorMessage(err, 'Failed to extract barcodes from LPO PDF'));
    }
  };

  // Download jaw-dropping branded native Excel (.xlsx) spreadsheet via backend style engine with pre-adjusted column widths & zero scientific notation
  const downloadPicklistExcel = async () => {
    if (!results || results.items.length === 0) {
      toast.error('No extracted items available to export.');
      return;
    }

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const fileName = `picklist_${timestamp}.xlsx`;

    try {
      const verifiedItems = results.items.filter((item) => item.inCatalogue);
      if (verifiedItems.length === 0) {
        toast.error('Error: Cannot export Excel picklist. No verified items matched the active system catalogue. Unmatched exceptions cannot be exported for picking.', { id: 'excel-export' });
        return;
      }

      toast.loading('Generating branded Excel spreadsheet (.xlsx)...', { id: 'excel-export' });
      // Export ONLY verified SKUs present in the master system catalogue to the floor picklist Excel
      const payload = verifiedItems.map((item) => ({
        barcode: item.barcode || 'N/A',
        product_name: item.itemName,
        quantity: item.quantity || 1,
        unit: 'PCS',
      }));
      
      const res = await api.post('/picklists/export-preview-excel', payload, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(`Downloaded Branded Excel: ${fileName}`, { id: 'excel-export' });
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to export branded Excel spreadsheet.'), { id: 'excel-export' });
    }
  };

  // Instant browser PDF / Print generation matching exact pick list layout with picklist_date_time filename and no signature footers
  const downloadPicklistPDF = () => {
    if (!results || results.items.length === 0) {
      toast.error('No extracted items available to print.');
      return;
    }
    
    const verifiedItems = results.items.filter((item) => item.inCatalogue);
    if (verifiedItems.length === 0) {
      toast.error('Error: Cannot generate PDF picklist. No verified items matched the system catalogue. Unmatched exceptions cannot be printed for warehouse floor picking.');
      return;
    }

    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const fileName = `picklist_${timestamp}`;

    // Include ONLY verified catalogue items in PDF print out for warehouse floor operations
    const rowsHtml = verifiedItems
      .map(
        (item, idx) => `
        <tr>
          <td style="text-align: center; padding: 8px; border: 1px solid #333;">${idx + 1}</td>
          <td style="text-align: center; padding: 8px; font-family: monospace; font-weight: bold; border: 1px solid #333;">${item.barcode || 'N/A'}</td>
          <td style="padding: 8px; font-weight: bold; border: 1px solid #333;">${item.itemName}</td>
          <td style="text-align: center; padding: 8px; font-weight: bold; border: 1px solid #333; font-size: 16px;">${item.quantity || 1}</td>
          <td style="text-align: center; padding: 8px; border: 1px solid #333;">[ &nbsp; &nbsp; ]</td>
          <td style="text-align: center; padding: 8px; border: 1px solid #333;">[ &nbsp; &nbsp; ]</td>
        </tr>`
      )
      .join('');

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      toast.error('Pop-ups blocked by browser. Please allow pop-ups to generate PDF.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${fileName}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #111; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #154c34; padding-bottom: 15px; margin-bottom: 25px; }
          .logo { font-size: 26px; font-weight: 900; color: #154c34; letter-spacing: -0.5px; }
          .meta { text-align: right; font-size: 14px; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #154c34; color: #fff; text-transform: uppercase; font-size: 12px; padding: 10px; border: 1px solid #154c34; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">NexWare Enterprise OS</div>
            <div style="font-size: 16px; font-weight: bold; margin-top: 4px; color: #555;">WAREHOUSE FLOOR PICK LIST</div>
          </div>
          <div class="meta">
            <div><b>Date Generated:</b> ${now.toLocaleDateString()}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 5%;">SI</th>
              <th style="width: 25%;">Item Code (Barcode)</th>
              <th style="width: 40%;">Description / Product Title</th>
              <th style="width: 10%;">Quantity</th>
              <th style="width: 10%;">Checked</th>
              <th style="width: 10%;">Picked</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
    toast.success(`Generated ${fileName}.pdf for instant printing!`);
  };

  // Reset screen to upload another order immediately
  const handleProcessAnother = () => {
    setResults(null);
    setProgress(0);
  };

  // Assign ONLY verified catalogue items to selected picker staff directly from memory!
  const handleConfirmAssignment = async (pickerId: number, pickerName: string) => {
    if (!results || results.items.length === 0) {
      toast.error('No extracted items available to assign.');
      return;
    }
    const verifiedItems = results.items.filter((i) => i.inCatalogue);
    if (verifiedItems.length === 0) {
      toast.error('Error: Cannot assign order to mobile terminal. No verified items matched the active system catalogue. Unmatched exceptions cannot be pushed to mobile pickers.');
      return;
    }

    setIsProcessing(true);
    setAssigningId(pickerId);
    try {
      const payload = {
        order_number: results.orderNumber,
        customer_name: results.customerName,
        items: verifiedItems.map((i) => ({
          barcode: i.barcode || 'N/A',
          product_name: i.itemName,
          quantity: i.quantity || 1,
          unit: 'PCS',
        })),
      };

      await api.post(`/picklists/direct-assign/${pickerId}`, payload);
      
      toast.success(`Order #${results.orderNumber} assigned directly to Picker (${pickerName})! Only verified catalogue SKUs pushed to terminal.`);
      setIsAssignModalOpen(false);
      navigate('/warehouse/picklists');
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not assign picklist to selected operational staff'));
    } finally {
      setIsProcessing(false);
      setAssigningId(null);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2.5">
            <span>Order Upload & Barcode Extraction</span>
            <span className="bg-primary/10 text-primary border border-primary/20 text-xs px-2.5 py-1 rounded-full font-extrabold">
              PDF Engine
            </span>
          </h1>
          <p className="text-on-surface-variant mt-1">Upload Client LPO PDF documents to extract all SKU barcodes, verify against catalogue, and generate pick lists</p>
        </div>
        {/* Note: Removed duplicate top-right download button per user instruction. All download actions are cleanly localized in the status bar below! */}
      </div>

      {isUploading ? (
        <PageLoader
          message="Extracting Barcodes & Quantities from LPO PDF Document..."
          subtitle="Scanning numerical barcode patterns and cross-referencing with warehouse catalogue SKUs"
        />
      ) : (
        <div className="bg-surface-container-lowest p-8 rounded-3xl border border-outline-variant shadow-sm">
          <FileUpload
            onFileSelect={handleUpload}
            accept={{ 'application/pdf': ['.pdf'] }}
            isUploading={isUploading}
            progress={progress}
            helperText="Supports Client LPO PDF Documents up to 10MB (Universal Barcode Extraction)"
          />
        </div>
      )}

      <AnimatePresence>
        {results && !isUploading && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Executive Status Bar with SINGLE Set of Download Buttons (Excel & PDF) */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-6 rounded-3xl border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-md">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-extrabold text-white text-xl">Order #{results.orderNumber}</div>
                  <div className="text-emerald-300/90 text-sm font-medium">Partner Customer: {results.customerName}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold text-xs px-3.5 py-2 rounded-xl">
                  {results.items.filter(i => i.inCatalogue).length} Verified SKUs
                </span>
                {results.items.filter(i => !i.inCatalogue).length > 0 && (
                  <span className="bg-amber-500/20 border border-amber-400/40 text-amber-300 font-bold text-xs px-3.5 py-2 rounded-xl">
                    + {results.items.filter(i => !i.inCatalogue).length} Exceptions (Excluded from Picklists & App)
                  </span>
                )}
                <Button
                  onClick={downloadPicklistExcel}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow-sm flex items-center gap-1.5 py-2 px-4"
                >
                  <Download className="w-4 h-4" /> Download Excel (.XLS)
                </Button>
                <Button
                  onClick={downloadPicklistPDF}
                  size="sm"
                  className="bg-rose-600 hover:bg-rose-500 text-white font-extrabold shadow-sm flex items-center gap-1.5 py-2 px-4"
                >
                  <Printer className="w-4 h-4" /> Download PDF (.PDF)
                </Button>
              </div>
            </div>

            {/* Table 1: Verified SKUs Ready for Floor Pick List Operations */}
            <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant shadow-sm overflow-hidden flex flex-col">
              <div className="bg-emerald-900/10 p-5 border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-on-surface font-black text-base">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  <span>Verified Pick List SKUs (Ready for Warehouse Floor)</span>
                  <span className="text-xs text-slate-500 font-semibold">(Standard items matched against master system catalogue)</span>
                </div>
                <span className="bg-emerald-600 text-white px-3.5 py-1 rounded-full text-xs font-black">
                  {results.items.filter(i => i.inCatalogue).length} Verified Items
                </span>
              </div>
              
              <div className="p-5 overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-container text-on-surface-variant border-b border-outline-variant text-xs uppercase font-extrabold">
                    <tr>
                      <th className="py-3.5 px-4 rounded-tl-xl text-center w-14">SI</th>
                      <th className="py-3.5 px-4 w-56">Item Code (Barcode)</th>
                      <th className="py-3.5 px-4">Description / Product Title</th>
                      <th className="py-3.5 px-4 text-center w-40">Catalogue Verification</th>
                      <th className="py-3.5 px-4 text-right rounded-tr-xl w-32">Floor Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/60">
                    {results.items.filter(i => i.inCatalogue).map((item, idx) => (
                      <tr key={item.si} className="hover:bg-emerald-50/40 transition-colors">
                        <td className="py-4 px-4 font-black text-slate-500 text-center">{idx + 1}</td>
                        <td className="py-4 px-4 font-mono font-black text-emerald-800 text-base">{item.barcode}</td>
                        <td className="py-4 px-4 font-bold text-on-surface">
                          <div>{item.itemName}</div>
                          <div className="text-xs text-emerald-600/80 font-bold">{item.itemNumber}</div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-black border border-emerald-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Verified SKU
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right font-black text-slate-900 text-lg">{item.quantity || 1}</td>
                      </tr>
                    ))}
                    {results.items.filter(i => i.inCatalogue).length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500 font-semibold">No verified catalogue SKUs found in this document. Check exceptions below.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: Excluded Exceptions (Unlisted in Catalogue or Missing Barcode) */}
            {results.items.filter(i => !i.inCatalogue).length > 0 && (
              <div className="bg-surface-container-lowest rounded-3xl border border-amber-300 shadow-sm overflow-hidden flex flex-col">
                <div className="bg-amber-50 p-5 border-b border-amber-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-amber-950 font-black text-base">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    <span>Catalogue & Barcode Exceptions (Excluded from Floor Picklists & Mobile App)</span>
                    <span className="text-xs text-amber-800/80 font-semibold">(These unlisted or missing barcode items are quarantined here for administrative review and will NOT be added to warehouse floor picklists or pushed to picker mobile terminals)</span>
                  </div>
                  <span className="bg-amber-600 text-white px-3.5 py-1 rounded-full text-xs font-black">
                    {results.items.filter(i => !i.inCatalogue).length} Exceptions
                  </span>
                </div>
                
                <div className="p-5 overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-amber-100/50 text-amber-900 border-b border-amber-200 text-xs uppercase font-extrabold">
                      <tr>
                        <th className="py-3.5 px-4 rounded-tl-xl text-center w-16">PDF Row</th>
                        <th className="py-3.5 px-4 w-56">Extracted Barcode</th>
                        <th className="py-3.5 px-4">Extracted Description</th>
                        <th className="py-3.5 px-4 w-32 text-right">Quantity</th>
                        <th className="py-3.5 px-4 rounded-tr-xl">Root Cause / Rejection Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-200/50">
                      {results.items.filter(i => !i.inCatalogue).map((item) => (
                        <tr key={item.si} className="hover:bg-amber-50/50 transition-colors">
                          <td className="py-4 px-4 font-black text-slate-500 text-center">{item.si}</td>
                          <td className="py-4 px-4 font-mono font-black text-rose-700 text-sm">{item.barcode}</td>
                          <td className="py-4 px-4 font-bold text-slate-800">
                            {item.itemName}
                            <span className="text-xs text-rose-800 font-bold block mt-0.5">Excluded from picker mobile app & warehouse floor reports</span>
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-slate-700">{item.quantity || 1}</td>
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 text-rose-900 text-xs font-black border border-rose-500/30 shadow-2xs">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              {item.exceptionReason || 'Barcode not registered in system catalogue'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* User Choice Routing Controls: Process Another vs Assign to Picker */}
            <div className="bg-surface-container-low p-6 rounded-3xl border border-outline-variant shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div>
                <h4 className="font-extrabold text-on-surface text-base">Warehouse Routing Control</h4>
                <p className="text-xs text-on-surface-variant font-semibold mt-0.5">
                  Download the formatted picklists above, assign immediately to floor workers when ready, or generate another order.
                </p>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleProcessAnother}
                  className="font-extrabold text-sm bg-white hover:bg-slate-100 border-slate-300 text-slate-800 shadow-2xs"
                >
                  <RefreshCw className="w-4 h-4 mr-2 text-primary" />
                  <span>Generate Another Order</span>
                </Button>

                <Button
                  size="lg"
                  onClick={() => setIsAssignModalOpen(true)}
                  disabled={results.items.filter(i => i.inCatalogue).length === 0}
                  className="bg-primary hover:bg-primary/90 text-white font-black text-sm px-6 shadow-md"
                >
                  <Users className="w-4 h-4 mr-2" />
                  <span>Assign to Picker</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Staff Assignment Modal */}
      <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title={`Assign Order #${results?.orderNumber} to Mobile Picker`}>
        <div className="space-y-5">
          <p className="text-sm font-semibold text-on-surface-variant">
            Select an active mobile warehouse terminal or operator to push this task:
          </p>
          <div className="grid grid-cols-1 gap-3 max-h-72 overflow-y-auto pr-1">
            {pickers.map((picker) => (
              <button
                key={picker.id}
                type="button"
                onClick={() => handleConfirmAssignment(picker.id, picker.full_name || picker.email)}
                disabled={isProcessing}
                className={`flex items-center justify-between gap-4 p-4 rounded-2xl border transition-all text-left shadow-2xs group ${
                  assigningId === picker.id
                    ? 'border-primary bg-primary/10 opacity-90'
                    : isProcessing
                    ? 'border-outline-variant opacity-50 cursor-not-allowed'
                    : 'border-outline-variant hover:border-primary hover:bg-primary/5'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-primary-container text-white flex items-center justify-center font-black text-lg group-hover:scale-105 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-extrabold text-on-surface text-sm">{picker.full_name || picker.email}</div>
                    <div className="text-xs text-on-surface-variant font-bold capitalize mt-0.5">{picker.role} Account — Available on Floor</div>
                  </div>
                </div>
                <span className={`text-xs px-3.5 py-2 rounded-xl font-extrabold shadow-sm transition-colors ${
                  assigningId === picker.id
                    ? 'bg-primary text-white animate-pulse'
                    : 'bg-primary text-white group-hover:bg-primary/90'
                }`}>
                  {assigningId === picker.id ? 'Pushing...' : 'Push Task Now →'}
                </span>
              </button>
            ))}
            {pickers.length === 0 && (
              <div className="text-center py-10 text-amber-700 text-sm font-bold bg-amber-50 rounded-2xl border border-amber-200">
                No active picker staff detected.
              </div>
            )}
          </div>
          <div className="flex justify-end pt-3 border-t border-outline-variant">
            <Button variant="secondary" onClick={() => setIsAssignModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
