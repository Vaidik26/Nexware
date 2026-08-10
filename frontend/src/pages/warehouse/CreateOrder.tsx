import React, { useState, useEffect } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Plus, Trash2, Users, Search, AlertCircle, ShoppingCart } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { getErrorMessage } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';

export default function CreateOrder() {
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [pickers, setPickers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  
  const [customerName, setCustomerName] = useState('');
  const [orderNumber, setOrderNumber] = useState(`MANUAL-${Math.floor(1000 + Math.random() * 9000)}`);
  
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<{barcode: string, error: string}[]>([]);
  
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  
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

  const filteredCatalogue = catalogue.filter(c => 
    c.item_name.toLowerCase().includes(search.toLowerCase()) || 
    c.barcode.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 10); // show top 10 results

  const addItem = (catItem: any) => {
    if (orderItems.some(i => i.barcode === catItem.barcode)) {
      toast.error('Item already in order. Please adjust its quantity instead.');
      return;
    }
    
    setOrderItems([...orderItems, {
      ...catItem,
      requested_quantity: 1
    }]);
    setValidationErrors([]); // clear errors on edit
  };

  const removeItem = (barcode: string) => {
    setOrderItems(orderItems.filter(i => i.barcode !== barcode));
    setValidationErrors(validationErrors.filter(e => e.barcode !== barcode));
  };

  const updateQuantity = (barcode: string, qty: number) => {
    if (qty < 1) qty = 1;
    setOrderItems(orderItems.map(i => i.barcode === barcode ? { ...i, requested_quantity: qty } : i));
    setValidationErrors([]); // clear errors on edit
  };

  const handleConfirmAssignment = async (pickerId: number, pickerName: string) => {
    if (orderItems.length === 0) {
      toast.error('Cannot submit an empty order.');
      return;
    }

    if (!customerName.trim()) {
      toast.error('Please enter a customer name.');
      setIsAssignModalOpen(false);
      return;
    }

    setIsProcessing(true);
    setAssigningId(pickerId);
    try {
      const payload = {
        order_number: orderNumber,
        customer_name: customerName,
        items: orderItems.map((i) => ({
          barcode: i.barcode || 'N/A',
          product_name: i.item_name,
          quantity: i.requested_quantity || 1,
          unit: 'PCS',
        })),
      };

      await api.post(`/picklists/direct-assign/${pickerId}`, payload);
      
      toast.success(`Order #${orderNumber} created and assigned to Picker (${pickerName})!`);
      setIsAssignModalOpen(false);
      navigate('/warehouse/picklists');
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.detail?.errors) {
        setValidationErrors(err.response.data.detail.errors);
        toast.error(err.response.data.detail.message || 'Inventory validation failed. Please review errors on the items.');
        setIsAssignModalOpen(false);
      } else {
        toast.error(getErrorMessage(err, 'Could not assign picklist to selected operational staff'));
      }
    } finally {
      setIsProcessing(false);
      setAssigningId(null);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2.5">
          <span>Create Manual Order</span>
          <span className="bg-primary/10 text-primary border border-primary/20 text-xs px-2.5 py-1 rounded-full font-extrabold">
            Direct Assignment
          </span>
        </h1>
        <p className="text-on-surface-variant mt-1">Create sales orders manually and assign them directly to warehouse pickers.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Order Form & Items */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant shadow-sm space-y-4">
            <h3 className="font-extrabold text-on-surface text-lg">Order Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">Customer Name</label>
                <input 
                  type="text" 
                  value={customerName}
                  onChange={(e) => { setCustomerName(e.target.value); setValidationErrors([]); }}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface font-semibold"
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">Order Number</label>
                <input 
                  type="text" 
                  value={orderNumber}
                  onChange={(e) => { setOrderNumber(e.target.value); setValidationErrors([]); }}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface-container/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface font-semibold"
                  placeholder="Order ID"
                />
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant shadow-sm overflow-hidden">
            <div className="bg-primary/5 p-5 border-b border-outline-variant flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-on-surface font-black text-base">
                <ShoppingCart className="w-5 h-5 text-primary" />
                <span>Order Items</span>
              </div>
              <span className="bg-primary text-white px-3.5 py-1 rounded-full text-xs font-black">
                {orderItems.length} Items
              </span>
            </div>
            
            <div className="p-0">
              {orderItems.length === 0 ? (
                <div className="py-12 text-center text-slate-500 font-semibold flex flex-col items-center">
                  <ShoppingCart className="w-12 h-12 text-slate-300 mb-3" />
                  No items added to this order yet.<br/>Search the catalogue on the right to add items.
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-container/50 text-on-surface-variant text-xs uppercase font-extrabold border-b border-outline-variant">
                    <tr>
                      <th className="py-3 px-4 w-32">Barcode</th>
                      <th className="py-3 px-4">Item Name</th>
                      <th className="py-3 px-4 text-center w-28">Available</th>
                      <th className="py-3 px-4 text-center w-32">Requested</th>
                      <th className="py-3 px-4 text-right w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/60">
                    {orderItems.map((item) => (
                      <React.Fragment key={item.barcode}>
                        <tr className="hover:bg-slate-50 transition-colors">
                          <td className="py-4 px-4 font-mono font-bold text-slate-600">{item.barcode}</td>
                          <td className="py-4 px-4 font-bold text-on-surface">{item.item_name}</td>
                          <td className="py-4 px-4 text-center font-bold text-emerald-600">{item.available_quantity}</td>
                          <td className="py-4 px-4 text-center">
                            <input 
                              type="number"
                              min="1"
                              value={item.requested_quantity}
                              onChange={(e) => updateQuantity(item.barcode, parseInt(e.target.value) || 1)}
                              className="w-full text-center px-2 py-1.5 rounded-lg border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/50 font-black text-lg bg-white"
                            />
                          </td>
                          <td className="py-4 px-4 text-right">
                            <button 
                              onClick={() => removeItem(item.barcode)}
                              className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        {validationErrors.find(e => e.barcode === item.barcode) && (
                          <tr className="bg-rose-50/50">
                            <td colSpan={5} className="py-3 px-4 border-l-4 border-rose-500">
                              <div className="flex items-center gap-2 text-rose-700 text-sm font-bold">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {validationErrors.find(e => e.barcode === item.barcode)?.error}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            {orderItems.length > 0 && (
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
            )}
          </div>
        </div>

        {/* Right Column: Catalogue Search */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-surface-container-lowest p-5 rounded-3xl border border-outline-variant shadow-sm h-[600px] flex flex-col">
            <h3 className="font-extrabold text-on-surface text-base mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-primary" />
              Search Catalogue
            </h3>
            
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or barcode..."
              className="w-full px-4 py-3 mb-4 rounded-xl border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium"
            />
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {filteredCatalogue.map(item => (
                <div key={item.barcode} className="p-3 rounded-xl border border-outline-variant hover:border-primary/40 bg-white group transition-all flex flex-col gap-2">
                  <div>
                    <div className="font-bold text-sm text-slate-800 line-clamp-2">{item.item_name}</div>
                    <div className="font-mono text-xs text-slate-500 mt-0.5">{item.barcode}</div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Stock: {item.available_quantity}
                    </span>
                    <button 
                      onClick={() => addItem(item)}
                      className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors"
                    >
                      <Plus className="w-4 h-4 font-bold" />
                    </button>
                  </div>
                </div>
              ))}
              {filteredCatalogue.length === 0 && (
                <div className="text-center text-slate-500 text-sm mt-10">No items found.</div>
              )}
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
    </div>
  );
}
