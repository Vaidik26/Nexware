import { useState, useEffect } from 'react';
import { Plus, Trash2, Shield, User, Pencil } from 'lucide-react';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { ActionRestrictedModal } from '@/components/ui/ActionRestrictedModal';
import { getErrorMessage } from '@/lib/utils';
import api from '@/lib/api';

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [restrictedMsg, setRestrictedMsg] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'picker',
  });

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/users');
      setUsers(res.data || []);
    } catch (error) {
      toast.error('Failed to load user accounts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.full_name || (!isEditMode && !formData.password)) {
      toast.error('Required fields missing');
      return;
    }
    
    // For edit mode, don't send empty password
    const payload = { ...formData };
    if (isEditMode && !payload.password) {
      delete (payload as any).password;
    }

    try {
      setIsSubmitting(true);
      if (isEditMode && editingUserId) {
        await api.patch(`/users/${editingUserId}`, payload);
        toast.success('User account updated successfully');
      } else {
        await api.post('/users', payload);
        toast.success('User account created successfully');
      }
      closeModal();
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to save account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (user: any) => {
    setIsEditMode(true);
    setEditingUserId(user.id);
    setFormData({
      email: user.email || '',
      full_name: user.full_name || '',
      password: '',
      role: user.role || 'picker',
    });
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setIsEditMode(false);
    setEditingUserId(null);
    setFormData({ email: '', full_name: '', password: '', role: 'picker' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingUserId(null);
    setFormData({ email: '', full_name: '', password: '', role: 'picker' });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this account?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('Account deleted');
      setUsers(users.filter((u) => u.id !== id));
    } catch (error: any) {
      const detail = error?.response?.data?.detail || getErrorMessage(error, 'Failed to delete account');
      if (error?.response?.status === 400 || error?.response?.status === 409 || typeof detail === 'string' && detail.toLowerCase().includes('cannot delete')) {
        setRestrictedMsg(detail);
      } else {
        toast.error(detail);
      }
    }
  };

  const handleToggleAvailability = async (user: any) => {
    try {
      const newStatus = !user.is_available;
      await api.patch(`/users/${user.id}/status?is_available=${newStatus}`);
      toast.success(`${user.full_name || user.email} marked as ${newStatus ? 'Online (Available)' : 'Offline (Unavailable)'}`);
      setUsers(users.map((u) => u.id === user.id ? { ...u, is_available: newStatus } : u));
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Failed to update availability'));
    }
  };

  const handleToggleActive = async (user: any) => {
    try {
      const newStatus = !user.is_active;
      await api.patch(`/users/${user.id}`, { is_active: newStatus });
      toast.success(`${user.full_name || user.email} account ${newStatus ? 'enabled' : 'disabled'}`);
      setUsers(users.map((u) => u.id === user.id ? { ...u, is_active: newStatus } : u));
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Failed to update account status'));
    }
  };

  const columns = [
    { header: 'ID', accessor: (r: any) => `#${r.id}` },
    { header: 'Full Name', accessor: 'full_name' as const },
    { header: 'Email / Username', accessor: 'email' as const },
    {
      header: 'Role',
      accessor: (r: any) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-container/20 text-primary uppercase">
          {r.role === 'admin' ? <Shield className="w-3 h-3 mr-1" /> : <User className="w-3 h-3 mr-1" />}
          {r.role === 'lpo' || r.role === 'sales_person' ? 'Sales Person' : r.role.replace('_', ' ')}
        </span>
      ),
    },
    {
      header: 'Floor Availability',
      accessor: (r: any) => (
        <button
          onClick={() => handleToggleAvailability(r)}
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold transition-all shadow-xs ${
            r.is_available
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
              : 'bg-slate-100 text-slate-600 border border-slate-300 hover:bg-slate-200'
          }`}
        >
          <span className={`w-2 h-2 rounded-full mr-1.5 ${r.is_available ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
          {r.is_available ? 'Online (Available)' : 'Offline'}
        </button>
      ),
    },
    {
      header: 'Account Status',
      accessor: (r: any) => (
        <button
          onClick={() => handleToggleActive(r)}
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold transition-all shadow-xs ${
            r.is_active
              ? 'bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-200'
              : 'bg-red-100 text-red-800 border border-red-300 hover:bg-red-200'
          }`}
        >
          <span className={`w-2 h-2 rounded-full mr-1.5 ${r.is_active ? 'bg-blue-500' : 'bg-red-500'}`} />
          {r.is_active ? 'Active (Enabled)' : 'Disabled'}
        </button>
      ),
    },
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
          <h1 className="text-2xl font-bold text-on-surface">User & Picker Management</h1>
          <p className="text-on-surface-variant mt-1">Manage accounts and login credentials</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" /> Add Picker / Account
        </Button>
      </div>

      <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm">
        <Table data={users} columns={columns} keyExtractor={(r) => r.id} isLoading={isLoading} />
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={isEditMode ? "Edit Account" : "Create New Account"}>
        <form onSubmit={handleSubmitUser} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="John Doe"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            required
          />
          <Input
            label="Email or Username"
            type="text"
            placeholder="picker@nexware.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <Input
            label={isEditMode ? "New Password (leave blank to keep current)" : "Password"}
            type="password"
            placeholder="••••••••"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required={!isEditMode}
          />
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">Role</label>
            <select
              className="w-full h-10 px-3 rounded-lg border border-outline-variant bg-surface text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="picker">Picker (Mobile Access)</option>
              <option value="admin">Admin (Web Dashboard Access)</option>
              <option value="sales_person">Sales Person</option>
            </select>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {isEditMode ? "Save Changes" : "Create Account"}
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
