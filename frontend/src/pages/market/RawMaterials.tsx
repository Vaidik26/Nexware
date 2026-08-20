import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Plus, Trash2, RefreshCw, Package, Tag, Scale, Search } from 'lucide-react';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { PageLoader } from '@/components/ui/PageLoader';
import { ActionRestrictedModal } from '@/components/ui/ActionRestrictedModal';
import { getErrorMessage, getCachedData, setCachedData } from '@/lib/utils';
import api from '@/lib/api';

const materialSchema = z.object({
  material_code: z.string().min(1, 'SKU / Commodity Index Code is required'),
  material_name: z.string().min(1, 'Item Name is required'),
  bag_carton_weight: z.number().positive('Bag/Carton weight must be greater than 0'),
  weight_unit: z.string().default('kg'),
  category: z.string().min(1, 'Category is required'),
  market_type: z.enum(['DXB', 'INT', 'BOTH']).default('BOTH'),
});

type MaterialForm = z.infer<typeof materialSchema>;

export default function RawMaterials() {
  const cached = getCachedData<any[]>('nexware_live_raw_materials_index');
  const [materials, setMaterials] = useState<any[]>(cached || []);
  const [isLoading, setIsLoading] = useState(!cached);

  const [activeEditId, setActiveEditId] = useState<number | null>(null);
  
  const handleEdit = (item: any) => {
    setActiveEditId(item.id);
    reset({
      material_code: item.material_code || item.sku,
      material_name: item.material_name || item.name,
      bag_carton_weight: item.bag_carton_weight || item.weight || 10,
      weight_unit: item.weight_unit || item.unit || 'kg',
      category: item.category || 'Uncategorized',
      market_type: item.market_type || 'BOTH',
    });
    setIsAddModalOpen(true);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [restrictedMsg, setRestrictedMsg] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<MaterialForm>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      bag_carton_weight: 10,
      weight_unit: 'kg',
      category: 'Uncategorized',
      market_type: 'BOTH',
    }
  });

  const fetchMaterials = async (quiet = false) => {
    try {
      if (!quiet) setIsLoading(true);
      const res = await api.get('/market/materials');
      const data = res.data || [];
      setMaterials(Array.isArray(data) ? data : []);
      setCachedData('nexware_live_raw_materials_index', Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (!quiet) toast.error(getErrorMessage(err, 'Failed to retrieve raw materials repository'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials(!!cached);
  }, []);

  const filteredMaterials = materials.filter(m =>
    (m.material_name || m.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.material_code || '').toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));

  const onSubmit = async (data: MaterialForm) => {
    try {
      setIsSubmitting(true);
      const payload = {
        material_code: data.material_code,
        material_name: data.material_name,
        bag_carton_weight: data.bag_carton_weight,
        weight_unit: data.weight_unit || 'kg',
        category: data.category,
        market_type: data.market_type,
      };
      const res = await api.post('/market/materials', payload);
      const created = res.data;
      
      const updated = [...materials, created || { id: Date.now(), ...payload }];
      setMaterials(updated);
      setCachedData('nexware_live_raw_materials_index', updated);
      
      toast.success('Commodity registered successfully');
      setIsAddModalOpen(false);
      reset();
      fetchMaterials(true);
    } catch (err: any) {
      toast.error(getErrorMessage(err, 'Could not register commodity specification'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string | number) => {
    if (!confirm('Permanently remove this commodity from market pricing tracking?')) return;
    try {
      await api.delete(`/market/materials/${id}`);
      const updated = materials.filter(m => m.id !== id && String(m.id) !== String(id));
      setMaterials(updated);
      setCachedData('nexware_live_raw_materials_index', updated);
      toast.success('Material removed successfully');
    } catch (err: any) {
      const detail = err?.response?.data?.detail || getErrorMessage(err, 'Could not remove commodity item');
      if (err?.response?.status === 400 || err?.response?.status === 409 || typeof detail === 'string' && detail.toLowerCase().includes('cannot delete')) {
        setRestrictedMsg(detail);
      } else {
        toast.error(detail);
      }
    }
  };

  const columns = [
    { 
      header: 'S.No', 
      accessor: (_: any, idx?: number) => <span className="font-mono text-xs text-slate-500 font-medium">{(idx ?? 0) + 1}</span>,
      className: 'w-16 text-center'
    },
    { 
      header: 'SKU / Index Code', 
      accessor: 'material_code' as const, 
      className: 'font-semibold text-primary' 
    },
    { 
      header: 'Commodity Item Name', 
      accessor: (r: any) => r.material_name || r.name || '-', 
      className: 'font-semibold text-on-surface' 
    },
    { 
      header: 'Category', 
      accessor: 'category' as const, 
      className: 'font-semibold text-slate-600 text-sm' 
    },
    { 
      header: 'Market', 
      accessor: (r: any) => (
        <span className={`inline-flex items-center gap-1 font-mono text-xs font-bold px-2 py-0.5 rounded ${
          r.market_type === 'DXB' ? 'bg-orange-100 text-orange-700' : 
          r.market_type === 'INT' ? 'bg-emerald-100 text-emerald-700' : 
          'bg-blue-100 text-blue-700'
        }`}>
          {r.market_type || 'BOTH'}
        </span>
      ), 
      className: 'w-24 text-center' 
    },
    { 
      header: 'Bag / Ctn Weight', 
      accessor: (r: any) => (
        <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold bg-slate-100 px-2.5 py-1 rounded border border-slate-200 text-slate-700">
          <Scale className="w-3.5 h-3.5 text-slate-500" />
          <span>{r.bag_carton_weight || r.weight || '10'} {r.weight_unit || r.unit || 'kg'}</span>
        </span>
      ), 
      className: 'w-48' 
    },
          {
        header: 'Actions',
        accessor: (row: any) => (
          <div className="flex gap-2 items-center">
            <Button variant="ghost" size="sm" onClick={() => handleEdit(row)} className="text-blue-600 hover:bg-blue-600/10" title="Edit Commodity">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)} className="text-error hover:bg-error/10" title="Delete Commodity">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ),
        className: 'w-24 text-center'
      },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Raw Material Item Master</h1>
          <p className="text-on-surface-variant mt-1 text-sm">Define master SKUs, commodity titles, and standard Bag / Carton packaging weights for daily market valuation</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => fetchMaterials(false)} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2 text-primary" /> Refresh
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="shadow-md">
            <Plus className="w-4 h-4 mr-2" /> Register Commodity
          </Button>
        </div>
      </div>

      {isLoading ? (
        <PageLoader
          message="Loading Commodity Master..."
          subtitle="Connecting to database repository"
        />
      ) : (
        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex max-w-md w-full relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by commodity name or SKU code..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-xl border border-outline-variant focus:outline-none focus:border-primary text-sm transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <span className="text-xs font-semibold text-on-surface-variant bg-surface px-3.5 py-2 rounded-xl border border-outline-variant flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" />
              Registered Commodities: <strong className="text-primary font-bold">{materials.length} SKUs</strong>
            </span>
          </div>

          {materials.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-outline-variant/60 rounded-2xl bg-slate-50/50">
              <Package className="w-10 h-10 mx-auto text-slate-400 mb-3" />
              <h3 className="font-bold text-on-surface text-base">No Commodities Registered</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
                Register your commodity items (SKU, Title, and Bag/Ctn Weight) to begin daily capturing of Dubai Local and International CIF/FOB valuations.
              </p>
              <Button onClick={() => setIsAddModalOpen(true)} className="shadow-md text-sm">
                <Plus className="w-4 h-4 mr-2" /> Register First Commodity
              </Button>
            </div>
          ) : (
            <Table data={filteredMaterials} columns={columns} keyExtractor={(r) => String(r.id)} />
          )}
        </div>
      )}

      <Modal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); setActiveEditId(null); reset(); }} title={activeEditId ? "Edit Commodity Benchmark" : "Register New Commodity Benchmark"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input 
            label="Commodity Index Code / SKU" 
            placeholder="e.g. COMM-ALUM-99 or SKU-100" 
            {...register('material_code')} 
            error={errors.material_code?.message} 
          />
          <Input 
            label="Commodity Title / Material Name" 
            placeholder="e.g. Black Pepper Grade A / Pure Aluminum Ingots" 
            {...register('material_name')} 
            error={errors.material_name?.message} 
          />
          

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Category</label>
              <select
                {...register('category')}
                className={`w-full px-3 py-2 bg-white rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${
                  errors.category ? 'border-error' : 'border-slate-200'
                }`}
              >
                <option value="Spices">Spices</option>
                <option value="Nuts & Dry Fruits">Nuts & Dry Fruits</option>
                <option value="Lentils & Pulses">Lentils & Pulses</option>
                <option value="Grains">Grains</option>
              </select>
              {errors.category && <span className="text-xs text-error">{errors.category.message}</span>}
            </div>


          <div>
            <label className="text-sm font-medium text-on-surface-variant mb-1.5 block">
              Market Type
            </label>
            <select
              {...register('market_type')}
              className="w-full px-3 py-2.5 bg-surface rounded-xl border border-outline-variant font-medium text-sm focus:outline-none focus:border-primary text-on-surface"
            >
              <option value="BOTH">Both (Dubai & International)</option>
              <option value="DXB">Dubai Only</option>
              <option value="INT">International Only</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant mb-1.5 block">
              Standard Bag / Carton Weight & Unit
            </label>
            <div className="flex items-center gap-2.5">
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 10 or 500"
                {...register('bag_carton_weight', { valueAsNumber: true })}
                className="flex-1 px-3.5 py-2.5 bg-surface rounded-xl border border-outline-variant font-medium text-sm focus:outline-none focus:border-primary text-on-surface"
              />
              <select
                {...register('weight_unit')}
                className="w-28 px-3 py-2.5 bg-slate-50 rounded-xl border border-outline-variant font-semibold text-sm text-slate-700 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer shadow-xs"
              >
                <option value="kg">KG</option>
                <option value="g">Gram (g)</option>
              </select>
            </div>
            {errors.bag_carton_weight && <p className="text-xs font-semibold text-red-600 mt-1">{errors.bag_carton_weight.message}</p>}
          </div>
          
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-outline-variant">
            <Button variant="secondary" onClick={() => { setIsAddModalOpen(false); setActiveEditId(null); reset(); }} type="button">Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Register Commodity</Button>
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
