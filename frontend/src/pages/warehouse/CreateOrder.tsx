import React, { useState, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Plus, Trash2, Users, AlertCircle, ShoppingCart, QrCode, Search, ChevronDown } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { getErrorMessage } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';

export default function CreateOrder() {
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [pickers, setPickers] = useState<any[]>([]);
  
  const [customerName, setCustomerName] = useState('');
  const [orderNumber, setOrderNumber] = useState(`MANUAL-${Math.floor(1000 + Math.random() * 9000)}`);
  
  // orderRows will hold the inline table data
  const [orderRows, setOrderRows] = useState<any[]>([{ id: Date.now(), catItem: null, requested_quantity: 1 }]);
  
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  
  const [isLpoModalOpen, setIsLpoModalOpen] = useState(false);
  const [lpoScannerData, setLpoScannerData] = useState('');
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPrereqs = async () => {
      try {
        const [catRes, usersRes] = await Promise.all([
          api.get('/catalogue'),
          api.get('/users'),
        ]);
        setCatalogue(catRes.data || []);
        setPickers((usersRes.data || []).filter((u: any) => u.role === 'picker'));
      } catch (err) {
        toast.error('Failed to load catalogue or users');
      }
    };
    fetchPrereqs();
  }, []);

  const handleLpoScan = (scannedData: string) => {
    try {
      const parsed = JSON.parse(scannedData);
      if (parsed.type === "LPO" && Array.isArray(parsed.items)) {
        setCustomerName(parsed.customer || '');
        setOrderNumber(parsed.order || '');
        
        const newRows = parsed.items.map((pi: any) => {
          const catItem = catalogue.find(c => c.barcode === pi.b) || {
            item_name: "Unknown Item",
            barcode: pi.b,
            available_quantity: 0
          };
          return {
            id: Math.random(),
            catItem: catItem,
            requested_quantity: pi.q
          };
        });
        
        setOrderRows(newRows.length > 0 ? newRows : [{ id: Date.now(), catItem: null, requested_quantity: 1 }]);
        setIsLpoModalOpen(false);
        setLpoScannerData('');
        toast.success(`Successfully imported LPO with ${newRows.length} items`);
      } else {
        toast.error('Invalid LPO QR format');
      }
    } catch (e) {
      toast.error('Failed to parse LPO QR Code data');
    }
  };

  const addRow = () => {
    setOrderRows([...orderRows, { id: Date.now(), catItem: null, requested_quantity: 1 }]);
  };

  const removeRow = (id: number) => {
    const newRows = orderRows.filter(r => r.id !== id);
    setOrderRows(newRows.length > 0 ? newRows : [{ id: Date.now(), catItem: null, requested_quantity: 1 }]);
  };

  const updateRowQuantity = (id: number, qty: number) => {
    if (qty < 1) qty = 1;
    setOrderRows(orderRows.map(r => r.id === id ? { ...r, requested_quantity: qty } : r));
  };

  const selectRowItem = (id: number, catItem: any) => {
    if (orderRows.some(r => r.id !== id && r.catItem?.barcode === catItem.barcode)) {
      toast.error('Item already added in another row.');
      return;
    }
    setOrderRows(orderRows.map(r => r.id === id ? { ...r, catItem: catItem, error: null } : r));
  };

  const handleConfirmAssignment = async (pickerId: number, pickerName: string) => {
    if (!customerName.trim()) {
      toast.error('Please enter a customer name.');
      setIsAssignModalOpen(false);
      return;
    }

    const validRows = orderRows.filter(r => r.catItem !== null);
    if (validRows.length === 0) {
      toast.error('Cannot submit an empty order. Please select at least one item.');
      setIsAssignModalOpen(false);
      return;
    }

    let hasErrors = false;
    const validatedRows = orderRows.map(r => {
      if (!r.catItem) return r;
      if (r.requested_quantity > r.catItem.available_quantity) {
        hasErrors = true;
        return { ...r, error: `Quantity exceeds available stock (${r.catItem.available_quantity})` };
      }
      return { ...r, error: null };
    });

    if (orderRows.some(r => !r.catItem)) {
      toast.error('Blank line items are not allowed. Please remove empty rows or select an item.');
      setIsAssignModalOpen(false);
      return;
    }

    if (hasErrors) {
      setOrderRows(validatedRows);
      toast.error('Inventory validation failed. Please check quantities.');
      setIsAssignModalOpen(false);
      return;
    }

    setIsProcessing(true);
    setAssigningId(pickerId);
    try {
      const payload = {
        order_number: orderNumber,
        customer_name: customerName,
        items: validRows.map((r) => ({
          barcode: r.catItem.barcode,
          product_name: r.catItem.item_name,
          quantity: r.requested_quantity || 1,
          unit: 'PCS',
        })),
      };

      await api.post(`/picklists/direct-assign/${pickerId}`, payload);
      
      toast.success(`Order #${orderNumber} created and assigned to Picker (${pickerName})!`);
      setIsAssignModalOpen(false);
      navigate('/warehouse/picklists');
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not assign picklist to selected operational staff'));
      setIsAssignModalOpen(false);
    } finally {
      setIsProcessing(false);
      setAssigningId(null);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2.5">
            <span>Create Manual Order</span>
            <span className="bg-primary/10 text-primary border border-primary/20 text-xs px-2.5 py-1 rounded-full font-extrabold">
              Direct Assignment
            </span>
          </h1>
          <p className="text-on-surface-variant mt-1">Create sales orders manually and assign them directly to warehouse pickers.</p>
        </div>
        <Button onClick={() => setIsLpoModalOpen(true)} variant="secondary" className="border-primary text-primary">
          <QrCode className="w-4 h-4 mr-2" />
          Scan External LPO
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="space-y-6">
          <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant shadow-sm space-y-4">
            <h3 className="font-extrabold text-on-surface text-lg">Order Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">Customer Name</label>
                <input 
                  type="text" 
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface font-semibold"
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">Order Number</label>
                <input 
                  type="text" 
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-container/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface font-semibold"
                  placeholder="Order ID"
                />
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant shadow-sm overflow-visible">
            <div className="bg-primary/5 p-5 border-b border-outline-variant flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-on-surface font-black text-base">
                <ShoppingCart className="w-5 h-5 text-primary" />
                <span>Active Shipment Line Items</span>
              </div>
              <span className="text-on-surface-variant text-xs font-semibold">
                Inline editing enabled (modify SKU & quantities directly)
              </span>
            </div>
            
            <div className="p-0 overflow-visible">
              <table className="w-full text-sm text-left relative z-10">
                <thead className="bg-surface-container/50 text-on-surface-variant text-xs uppercase font-extrabold border-b border-outline-variant">
                  <tr>
                    <th className="py-4 px-6 w-[45%]">Product / SKU Select</th>
                    <th className="py-4 px-6 text-center w-[15%]">Available Stock</th>
                    <th className="py-4 px-6 text-center w-[25%]">Quantity (Units)</th>
                    <th className="py-4 px-6 text-right w-[15%]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60">
                  {orderRows.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-6 relative">
                          <ItemSelect 
                            catalogue={catalogue} 
                            selectedItem={row.catItem}
                            onSelect={(item) => selectRowItem(row.id, item)}
                          />
                        </td>
                        <td className="py-4 px-6 text-center">
                           <span className={`font-bold ${row.catItem && row.catItem.available_quantity > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                             {row.catItem ? `${row.catItem.available_quantity} PCS` : '-'}
                           </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex items-center justify-center">
                            <button 
                              onClick={() => updateRowQuantity(row.id, row.requested_quantity - 1)}
                              className="w-8 h-8 rounded-l-lg border border-outline-variant bg-surface-container flex items-center justify-center hover:bg-slate-200"
                              disabled={!row.catItem}
                            >
                              -
                            </button>
                            <input 
                              type="number"
                              min="1"
                              value={row.requested_quantity}
                              onChange={(e) => updateRowQuantity(row.id, parseInt(e.target.value) || 1)}
                              className="w-16 text-center h-8 border-y border-outline-variant focus:outline-none focus:ring-1 focus:ring-primary/50 font-black text-sm bg-white"
                              disabled={!row.catItem}
                            />
                            <button 
                              onClick={() => updateRowQuantity(row.id, row.requested_quantity + 1)}
                              className="w-8 h-8 rounded-r-lg border border-outline-variant bg-surface-container flex items-center justify-center hover:bg-slate-200"
                              disabled={!row.catItem}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button 
                            onClick={() => removeRow(row.id)}
                            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                      {row.error && (
                        <tr className="bg-rose-50/50">
                          <td colSpan={4} className="py-3 px-6 border-l-4 border-rose-500">
                            <div className="flex items-center gap-2 text-rose-700 text-sm font-bold">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              {row.error}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div className="p-4 border-t border-outline-variant flex items-center justify-between bg-surface relative z-0">
                <Button variant="secondary" onClick={addRow} className="border-primary/20 text-primary bg-primary/5 hover:bg-primary/10">
                  <Plus className="w-4 h-4 mr-2" /> Add Another Order Line Row
                </Button>
                <div className="text-sm font-semibold text-slate-500">
                  {orderRows.filter(r => r.catItem).length} line item(s) configured
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-surface-container-low border-t border-outline-variant flex justify-end">
              <Button
                size="lg"
                onClick={() => setIsAssignModalOpen(true)}
                className="bg-primary hover:bg-primary/90 text-white font-black px-8 shadow-md"
              >
                <Users className="w-5 h-5 mr-2" />
                Assign to Picker
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title={`Assign Order #${orderNumber} to Mobile Picker`}>
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

      <Modal isOpen={isLpoModalOpen} onClose={() => { setIsLpoModalOpen(false); setLpoScannerData(''); }} title="Scan External LPO">
        <div className="space-y-4">
          <p className="text-sm font-semibold text-on-surface-variant">
            Please focus the input below and scan the LPO QR code using a 2D Barcode Scanner. The data will be instantly parsed to create an order.
          </p>
          <input
            type="text"
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface font-semibold"
            placeholder="Awaiting scanner input..."
            value={lpoScannerData}
            onChange={(e) => {
              setLpoScannerData(e.target.value);
              handleLpoScan(e.target.value);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}

function ItemSelect({ catalogue, selectedItem, onSelect }: { catalogue: any[], selectedItem: any, onSelect: (item: any) => void }) {
  const [query, setQuery] = useState(selectedItem ? selectedItem.item_name : '');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selectedItem ? selectedItem.item_name : '');
  }, [selectedItem]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const filtered = catalogue.filter(c => 
    c.item_name.toLowerCase().includes(query.toLowerCase()) || 
    c.barcode.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50);

  return (
    <div ref={wrapperRef} className="w-full text-left z-50">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          type="text"
          className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-semibold text-on-surface bg-surface"
          placeholder="Search product or SKU..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </div>
      </div>
      
      {isOpen && (
        <div className="absolute left-0 mt-1 w-[350px] bg-white rounded-xl shadow-xl border border-outline-variant max-h-60 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map(item => (
              <div 
                key={item.barcode}
                className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-outline-variant/50 last:border-0"
                onClick={() => {
                  onSelect(item);
                  setQuery(item.item_name);
                  setIsOpen(false);
                }}
              >
                <div className="font-bold text-sm text-slate-800">{item.item_name}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono text-xs text-slate-500">{item.barcode}</span>
                  <span className="text-xs font-bold text-emerald-600">Stock: {item.available_quantity}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">No products found</div>
          )}
        </div>
      )}
    </div>
  );
}
