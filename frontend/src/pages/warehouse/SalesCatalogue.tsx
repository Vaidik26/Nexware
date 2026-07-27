import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Plus, Search, Download, Trash2, Edit2 } from 'lucide-react';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { PageLoader } from '@/components/ui/PageLoader';
import { ActionRestrictedModal } from '@/components/ui/ActionRestrictedModal';
import { getErrorMessage, getCachedData, setCachedData } from '@/lib/utils';
import api from '@/lib/api';

const itemSchema = z.object({
  item_number: z.string().min(1, 'Item number is required'),
  item_name: z.string().min(1, 'Item name is required'),
  barcode: z.string().min(1, 'Barcode is required'),
});

type ItemForm = z.infer<typeof itemSchema>;

export default function SalesCatalogue() {
  const cached = getCachedData<any[]>('sales_catalogue');
  const [items, setItems] = useState<any[]>(cached || []);
  const [isLoading, setIsLoading] = useState(!cached);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [restrictedMsg, setRestrictedMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<ItemForm>({
    resolver: zodResolver(itemSchema)
  });

  const fetchCatalogue = async (quiet = false) => {
    try {
      if (!quiet) setIsLoading(true);
      const res = await api.get('/catalogue');
      const data = res.data || [];
      setItems(data);
      setCachedData('sales_catalogue', data);
    } catch (error: any) {
      if (!quiet) toast.error(getErrorMessage(error, 'Failed to connect to catalogue repository'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogue(!!cached);
  }, []);

  const filteredItems = items.filter(item => 
    (item.item_name || item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (item.item_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.barcode || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setValue('item_number', item.item_number);
    setValue('item_name', item.item_name || item.name || '');
    setValue('barcode', item.barcode);
    setIsEditModalOpen(true);
  };

  const closeModals = () => {
    setIsAddModalOpen(false);
    setIsEditModalOpen(false);
    setEditingItem(null);
    reset();
  };

  const onSubmit = async (data: ItemForm) => {
    try {
      setIsSubmitting(true);
      const payload = {
        item_number: data.item_number,
        item_name: data.item_name,
        barcode: data.barcode,
        unit: editingItem?.unit || 'PCS',
      };

      if (isEditModalOpen && editingItem) {
        await api.put(`/catalogue/${editingItem.id}`, payload);
        toast.success('Item Master updated! Changes propagated across active operational tasks.');
      } else {
        await api.post('/catalogue', payload);
        toast.success('Catalogue item registered successfully');
      }
      
      closeModals();
      fetchCatalogue(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Failed to save item to catalogue'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this SKU from active sales catalogue?')) return;
    try {
      await api.delete(`/catalogue/${id}`);
      const updated = items.filter(i => i.id !== id);
      setItems(updated);
      setCachedData('sales_catalogue', updated);
      toast.success('Item removed successfully');
    } catch (err: any) {
      const detail = err?.response?.data?.detail || getErrorMessage(err, 'Failed to remove item');
      if (err?.response?.status === 400 || err?.response?.status === 409 || typeof detail === 'string' && detail.toLowerCase().includes('cannot delete')) {
        setRestrictedMsg(detail);
      } else {
        toast.error(detail);
      }
    }
  };

  const exportExcel = async () => {
    if (items.length === 0) {
      toast.error('No catalogue records to export');
      return;
    }
    const headers = ['Item Number,Item Name,Barcode\n'];
    const rows = items.map(
      (item) => `"${item.item_number}","${(item.item_name || item.name || '').replace(/"/g, '""')}","${item.barcode}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + headers.concat(rows.join('\n'));
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'NexWare_Sales_Catalogue.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Exported Sales Catalogue');
  };

  const columns = [
    { header: 'Item Number / SKU', accessor: 'item_number' as const, className: 'font-semibold text-primary' },
    { header: 'Item Name / Product', accessor: (r: any) => r.item_name || r.name || '-' },
    { header: 'Barcode / UPC Code', accessor: 'barcode' as const, className: 'font-mono text-xs font-semibold bg-slate-100 px-2 py-1 rounded w-fit' },
    { 
      header: 'Actions', 
      accessor: (row: any) => (
        <div className="flex gap-1.5 items-center">
          <Button variant="ghost" size="sm" onClick={() => openEditModal(row)} className="text-blue-600 hover:bg-blue-50/80 p-1.5" title="Edit Item Master">
            <Edit2 className="w-4 h-4" /> <span className="text-xs ml-1 font-semibold">Edit</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)} className="text-error hover:bg-error/10 p-1.5" title="Delete Item">
            <Trash2 className="w-4 h-4" /> <span className="text-xs ml-1 font-semibold">Delete</span>
          </Button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Sales Item Catalogue</h1>
          <p className="text-on-surface-variant mt-1">Centralized SKU inventory directory for LPO processing and automated picklist generation</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={exportExcel}>
            <Download className="w-4 h-4 mr-2 text-secondary" />
            Export CSV
          </Button>
          <Button onClick={() => { reset(); setEditingItem(null); setIsAddModalOpen(true); }} className="shadow-md">
            <Plus className="w-4 h-4 mr-2" />
            Add Catalogue Item
          </Button>
        </div>
      </div>

      {isLoading ? (
        <PageLoader 
          message="Indexing Warehouse Sales Catalogue..." 
          subtitle="Synchronizing SKU item identifiers, barcode matrices, and repository indices" 
        />
      ) : (
        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex max-w-md w-full relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by item name, SKU code, or barcode..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-outline-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <span className="text-xs font-semibold text-on-surface-variant bg-surface px-3.5 py-2 rounded-xl border border-outline-variant">
              Active Catalogue Size: <strong className="text-primary font-bold">{items.length} SKUs</strong>
            </span>
          </div>

          <Table
            data={filteredItems}
            columns={columns}
            keyExtractor={(item) => String(item.id)}
          />
        </div>
      )}

      <Modal isOpen={isAddModalOpen || isEditModalOpen} onClose={closeModals} title={isEditModalOpen ? "Edit Item Master & Reflect Live" : "Register New Catalogue SKU"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Item Number / SKU Code" placeholder="e.g. ITM-1001" {...register('item_number')} error={errors.item_number?.message} />
          <Input label="Item Name / Title" placeholder="e.g. Premium Steel Wire" {...register('item_name')} error={errors.item_name?.message} />
          <Input label="Barcode / UPC Identifier" placeholder="e.g. 6294003002695" {...register('barcode')} error={errors.barcode?.message} />
          
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-outline-variant">
            <Button variant="secondary" onClick={closeModals} type="button">Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>{isEditModalOpen ? "Save & Propagate Live" : "Register Item"}</Button>
          </div>
        </form>
      </Modal>

      <ActionRestrictedModal
        isOpen={!!restrictedMsg}
        onClose={() => setRestrictedMsg(null)}
        message={restrictedMsg}
      />
    </div>
  );
}
