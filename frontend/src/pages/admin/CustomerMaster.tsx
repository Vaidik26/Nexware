import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { ActionRestrictedModal } from '@/components/ui/ActionRestrictedModal';
import { PageLoader } from '@/components/ui/PageLoader';
import { getErrorMessage } from '@/lib/utils';
import api from '@/lib/api';

export default function CustomerMaster() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [restrictedMsg, setRestrictedMsg] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    customer_code: '',
  });

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/customers');
      setCustomers(res.data || []);
    } catch (error) {
      toast.error('Failed to load customers');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleSubmitCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.customer_code) {
      toast.error('Required fields missing');
      return;
    }
    
    try {
      setIsSubmitting(true);
      if (isEditMode && editingCustomerId) {
        await api.put(`/customers/${editingCustomerId}`, formData);
        toast.success('Customer updated successfully');
      } else {
        await api.post('/customers', formData);
        toast.success('Customer created successfully');
      }
      closeModal();
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (customer: any) => {
    setIsEditMode(true);
    setEditingCustomerId(customer.id);
    setFormData({
      name: customer.name || '',
      customer_code: customer.customer_code || '',
    });
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setIsEditMode(false);
    setEditingCustomerId(null);
    setFormData({ name: '', customer_code: '' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingCustomerId(null);
    setFormData({ name: '', customer_code: '' });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    try {
      await api.delete(`/customers/${id}`);
      toast.success('Customer deleted');
      setCustomers(customers.filter((c) => c.id !== id));
    } catch (error: any) {
      const detail = error?.response?.data?.detail || getErrorMessage(error, 'Failed to delete customer');
      if (error?.response?.status === 400 || error?.response?.status === 409 || (typeof detail === 'string' && detail.toLowerCase().includes('cannot delete'))) {
        setRestrictedMsg(detail);
      } else {
        toast.error(detail);
      }
    }
  };

  const columns = [
    { header: 'ID', accessor: (r: any) => `#${r.id}` },
    { header: 'Customer Code', accessor: 'customer_code' as const },
    { header: 'Customer Name', accessor: 'name' as const },
    {
      header: 'Actions',
      accessor: (r: any) => (
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            size="sm"
            className="text-primary border-primary/20 hover:bg-primary/5 px-2"
            onClick={() => openEditModal(r)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="text-error border-error/20 hover:bg-error/5 px-2"
            onClick={() => handleDelete(r.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Customer Master</h1>
          <p className="text-on-surface-variant mt-1">Manage partner customers and codes</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" /> Add Customer
        </Button>
      </div>

      {isLoading ? (
        <PageLoader message="Loading Customers..." subtitle="Fetching customer master directory" />
      ) : (
        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm">
          <Table data={customers} columns={columns} keyExtractor={(r) => r.id} />
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title={isEditMode ? "Edit Customer" : "Create New Customer"}>
        <form onSubmit={handleSubmitCustomer} className="space-y-4">
          <Input
            label="Customer Code"
            placeholder="e.g. CUST001"
            value={formData.customer_code}
            onChange={(e) => setFormData({ ...formData, customer_code: e.target.value })}
            required
          />
          <Input
            label="Customer Name"
            type="text"
            placeholder="e.g. Acme Corp"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {isEditMode ? "Save Changes" : "Create Customer"}
            </Button>
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
