import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Shield, Pencil, PackageSearch, Briefcase, LineChart } from 'lucide-react';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { ActionRestrictedModal } from '@/components/ui/ActionRestrictedModal';
import { PageLoader } from '@/components/ui/PageLoader';
import { getErrorMessage } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import {
  AccessGrantEditor,
  AccessCatalog,
  GrantDraft,
} from '@/components/admin/AccessGrantEditor';
import { ALL_AREAS, DashboardRole, ROLE_MODULES, channelFor, grantLabel } from '@/lib/access';
import api from '@/lib/api';

/**
 * The `users` table was split into four tables, one per persona, and they no
 * longer share a column set. A single form with a role dropdown would have to
 * show fields that do not exist for the selected role, so each persona gets its
 * own tab driven by the config below — one entry per backend route group.
 *
 * `fields` mirrors the Pydantic *Create/*Update schemas exactly. Anything not
 * listed here is not a column on that table.
 */
type FieldDef = {
  key: string;
  label: string;
  type?: 'text' | 'email' | 'tel' | 'password';
  placeholder?: string;
  required?: boolean;
  /** Sent on create but never on update (the backend has no such field there). */
  createOnly?: boolean;
};

type Persona = {
  id: string;
  label: string;
  /** Route group — /admins, /pickers, /sales, /dashboard-users. */
  endpoint: string;
  icon: typeof Shield;
  blurb: string;
  /** The column shown as the login identifier. */
  identifierKey: 'email' | 'username';
  /** The column shown as the display name. */
  nameKey: 'full_name' | 'display_name';
  /** Pickers alone carry a floor-availability flag. */
  hasAvailability?: boolean;
  /**
   * Dashboard viewers alone carry a role and per-user grants; the other three
   * personas' access is implied by the table they live in. Only this persona
   * gets the role/module/territory editor.
   */
  hasAccessGrants?: boolean;
  fields: FieldDef[];
  extraColumns?: { header: string; accessor: (row: any) => any }[];
};

const PERSONAS: Persona[] = [
  {
    id: 'admins',
    label: 'Admins',
    endpoint: '/admins',
    icon: Shield,
    blurb: 'Full access to the web portal and every administrative action.',
    identifierKey: 'email',
    nameKey: 'full_name',
    fields: [
      { key: 'full_name', label: 'Full Name', placeholder: 'John Doe', required: true },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'admin@nexware.com', required: true },
    ],
  },
  {
    id: 'pickers',
    label: 'Pickers',
    endpoint: '/pickers',
    icon: PackageSearch,
    blurb: 'Warehouse floor staff using the mobile picking app.',
    identifierKey: 'username',
    nameKey: 'full_name',
    hasAvailability: true,
    fields: [
      { key: 'full_name', label: 'Full Name', placeholder: 'John Doe', required: true },
      { key: 'username', label: 'Username', placeholder: 'john.doe', required: true },
    ],
  },
  {
    id: 'sales',
    label: 'Sales Reps',
    endpoint: '/sales',
    icon: Briefcase,
    blurb: 'Field reps raising LPOs from the mobile app.',
    identifierKey: 'username',
    nameKey: 'display_name',
    fields: [
      { key: 'display_name', label: 'Display Name', placeholder: 'John Doe', required: true },
      { key: 'username', label: 'Username', placeholder: 'john.doe', required: true },
    ],
    extraColumns: [
      {
        header: 'Last Login',
        accessor: (r: any) =>
          r.last_login_at ? new Date(r.last_login_at).toLocaleString() : '—',
      },
    ],
  },
  {
    id: 'dashboard-users',
    label: 'Dashboard Viewers',
    endpoint: '/dashboard-users',
    icon: LineChart,
    blurb:
      'Portal access is set per account. The role determines which modules open; supervisor areas and channel can be configured for Sales Users and Managers.',
    identifierKey: 'email',
    nameKey: 'full_name',
    hasAccessGrants: true,
    fields: [
      { key: 'full_name', label: 'Full Name', placeholder: 'John Doe', required: true },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'viewer@nexware.com', required: true },
    ],
  },
];

/** A new account starts on SALES, which opens Sales Dashboard. */
const BLANK_GRANT: GrantDraft = { role: 'SALES', areas: [], channel: null };

const PASSWORD_FIELD: FieldDef = {
  key: 'password',
  label: 'Password',
  type: 'password',
  placeholder: '••••••••',
};

function blankForm(persona: Persona): Record<string, string> {
  const form: Record<string, string> = { password: '' };
  persona.fields.forEach((f) => (form[f.key] = ''));
  return form;
}

export default function UserManagement() {
  const currentUser = useAuthStore((s) => s.user);
  const currentAccess = useAuthStore((s) => s.access);

  const visiblePersonas = useMemo(() => {
    return currentAccess?.user_type === 'admin'
      ? PERSONAS
      : PERSONAS.filter(p => p.id === 'dashboard-users');
  }, [currentAccess]);

  const [activeTab, setActiveTab] = useState(visiblePersonas[0]?.id || 'dashboard-users');
  
  useEffect(() => {
    if (!visiblePersonas.find(p => p.id === activeTab)) {
      setActiveTab(visiblePersonas[0]?.id || 'dashboard-users');
    }
  }, [visiblePersonas, activeTab]);

  const persona = useMemo(
    () => visiblePersonas.find((p) => p.id === activeTab) ?? visiblePersonas[0],
    [activeTab, visiblePersonas]
  );

  const [rowCache, setRowCache] = useState<Record<string, any[]>>({});
  const [loadingTabs, setLoadingTabs] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [restrictedMsg, setRestrictedMsg] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [grant, setGrant] = useState<GrantDraft>(BLANK_GRANT);
  const [catalog, setCatalog] = useState<AccessCatalog | null>(null);

  // Derive current tab rows and loading state from cache
  const rows = rowCache[persona?.id ?? ''] ?? [];
  const isLoading = loadingTabs[persona?.id ?? ''] ?? true;

  // The roles, modules and channels this build enforces. Read from the server
  // rather than declared here so the pickers cannot offer a value the database
  // would refuse.
  useEffect(() => {
    api
      .get('/access/catalog')
      .then((res) => setCatalog(res.data))
      .catch(() => setCatalog(null));
  }, []);

  const fetchRows = async (target: Persona, silent = false) => {
    if (!silent) {
      setLoadingTabs((prev) => ({ ...prev, [target.id]: true }));
    }
    try {
      const res = await api.get(target.endpoint, { bypassCache: true } as any);
      let data = res.data || [];

      // A Sales Manager can only view Sales Users in the dashboard users table
      if (currentAccess?.user_type === 'dashboard' && currentAccess?.role === 'MANAGER' && target.id === 'dashboard-users') {
        data = data.filter((r: any) => r.role === 'SALES');
      }

      setRowCache((prev) => ({ ...prev, [target.id]: data }));
      setCounts((prev) => ({ ...prev, [target.id]: data.length }));
    } catch (error) {
      if (!silent) {
        toast.error(getErrorMessage(error, `Failed to load ${target.label.toLowerCase()}`));
        setRowCache((prev) => ({ ...prev, [target.id]: [] }));
      }
    } finally {
      setLoadingTabs((prev) => ({ ...prev, [target.id]: false }));
    }
  };

  useEffect(() => {
    if (persona) {
      // If we already have cached data, show it immediately and refresh silently
      if (rowCache[persona.id]) {
        fetchRows(persona, true);
      } else {
        fetchRows(persona, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona?.id]);

  // Pre-fetch all visible tabs once on mount so badges are populated
  useEffect(() => {
    visiblePersonas.forEach((p) => {
      if (!rowCache[p.id]) {
        fetchRows(p, false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateModal = () => {
    setIsEditMode(false);
    setEditingId(null);
    setFormData(blankForm(persona));
    setGrant(BLANK_GRANT);
    setIsModalOpen(true);
  };

  const openEditModal = (row: any) => {
    setIsEditMode(true);
    setEditingId(row.id);
    const form: Record<string, string> = { password: '' };
    persona.fields.forEach((f) => (form[f.key] = row[f.key] ?? ''));
    setFormData(form);

    if (persona.hasAccessGrants) {
      const areas: string[] = row.explicit_areas ? row.areas ?? [] : [];
      const channel = areas.length ? channelFor(row, areas[0]) : null;
      setGrant({
        role: (row.role as DashboardRole) ?? 'SALES',
        areas,
        channel,
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setEditingId(null);
    setFormData(blankForm(persona));
    setGrant(BLANK_GRANT);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const missing = persona.fields
      .filter((f) => f.required && !String(formData[f.key] ?? '').trim())
      .map((f) => f.label);
    if (missing.length) {
      toast.error(`Required: ${missing.join(', ')}`);
      return;
    }
    if (!isEditMode && !formData.password) {
      toast.error('Password is required for a new account');
      return;
    }

    const payload: Record<string, any> = {};
    persona.fields.forEach((f) => {
      if (isEditMode && f.createOnly) return;
      const value = String(formData[f.key] ?? '').trim();
      // Optional fields are omitted when blank so a PATCH does not overwrite a
      // stored value with an empty string.
      if (value || f.required) payload[f.key] = value;
    });
    if (formData.password) payload.password = formData.password;

    if (persona.hasAccessGrants) {
      payload.role = grant.role;
      // Always sent. An omitted list means "leave that half alone" to the API,
      // which would make it impossible to clear areas or put the account back
      // on role defaults — and this form shows the WHOLE grant.
      payload.areas = grant.areas;
      payload.channel = grant.channel;
    }

    try {
      setIsSubmitting(true);
      if (isEditMode && editingId) {
        await api.patch(`${persona.endpoint}/${editingId}`, payload);
        toast.success('Account updated');
      } else {
        await api.post(persona.endpoint, payload);
        toast.success('Account created');
      }
      closeModal();
      fetchRows(persona, true);
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Failed to save account'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (row: any) => {
    const name = row[persona.nameKey] || row[persona.identifierKey];
    if (!confirm(`Delete the account for ${name}?`)) return;
    try {
      await api.delete(`${persona.endpoint}/${row.id}`);
      toast.success('Account deleted');
      setRowCache((prev) => ({
        ...prev,
        [persona.id]: (prev[persona.id] ?? []).filter((r) => r.id !== row.id),
      }));
      setCounts((prev) => ({ ...prev, [persona.id]: (prev[persona.id] ?? 1) - 1 }));
    } catch (error: any) {
      const detail =
        error?.response?.data?.detail || getErrorMessage(error, 'Failed to delete account');
      const status = error?.response?.status;
      // The backend refuses deletes that would orphan work (a picker with live
      // jobs) or lock you out (deleting yourself). Those are explained, not shouted.
      if (
        status === 400 ||
        status === 409 ||
        (typeof detail === 'string' && detail.toLowerCase().includes('cannot delete'))
      ) {
        setRestrictedMsg(detail);
      } else {
        toast.error(detail);
      }
    }
  };

  const handleToggleAvailability = async (row: any) => {
    try {
      const next = !row.is_available;
      await api.patch(`${persona.endpoint}/${row.id}/status?is_available=${next}`);
      toast.success(
        `${row[persona.nameKey]} marked ${next ? 'Online (Available)' : 'Offline'}`
      );
      setRowCache((prev) => ({
        ...prev,
        [persona.id]: (prev[persona.id] ?? []).map((r) =>
          r.id === row.id ? { ...r, is_available: next } : r
        ),
      }));
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Failed to update availability'));
    }
  };

  const handleToggleActive = async (row: any) => {
    try {
      const next = !row.is_active;
      await api.patch(`${persona.endpoint}/${row.id}`, { is_active: next });
      toast.success(
        `${row[persona.nameKey]} account ${next ? 'enabled' : 'disabled'}`
      );
      setRowCache((prev) => ({
        ...prev,
        [persona.id]: (prev[persona.id] ?? []).map((r) =>
          r.id === row.id ? { ...r, is_active: next } : r
        ),
      }));
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Failed to update account status'));
    }
  };

  const columns = useMemo(() => {
    const base: { header: string; accessor: (row: any, index: number) => any; className?: string }[] = [
      { header: '#', accessor: (_r: any, i: number) => `#${i + 1}` },
      {
        header: persona.nameKey === 'display_name' ? 'Display Name' : 'Full Name',
        accessor: (r: any) => r[persona.nameKey] || '—',
      },
      {
        header: persona.identifierKey === 'email' ? 'Email' : 'Username',
        accessor: (r: any) => r[persona.identifierKey] || '—',
      },
    ];

    // Employee ID / phone are meaningful only for sales reps.
    persona.fields
      .filter((f) => !['full_name', 'display_name', 'email', 'username'].includes(f.key))
      .forEach((f) =>
        base.push({ header: f.label, accessor: (r: any) => r[f.key] || '—' })
      );

    // What each account EFFECTIVELY holds, and whether that came from its role
    // or from a grant. Both matter: "SALES_DASH (role default)" and
    // "SALES_DASH (granted)" are the same access and different rows to edit.
    if (persona.hasAccessGrants) {
      base.push({
        header: 'Role',
        accessor: (r: any) => (
          <span className="rounded-full bg-surface-container px-2.5 py-1 text-xs font-bold text-on-surface">
            {r.role ?? '—'}
          </span>
        ),
      });
      base.push({
        header: 'Modules',
        accessor: (r: any) => {
          const mods = ROLE_MODULES[r.role as DashboardRole] ?? [];
          return (
            <div className="max-w-[220px] text-xs text-on-surface">
              {mods.length ? mods.join(', ') : <em className="text-on-surface-variant">opens nothing</em>}
            </div>
          );
        },
      });
      base.push({
        header: 'Supervisor area · channel',
        accessor: (r: any) => {
          const areas: string[] = r.areas ?? [];
          return (
            <div className="max-w-[280px] text-xs">
              <span className="text-on-surface">
                {areas.length
                  ? areas
                      .map((a) => (a === ALL_AREAS ? a : grantLabel(a, channelFor(r, a))))
                      .join(', ')
                  : <em className="text-on-surface-variant">
                      {r.role === 'MANAGER' ? 'every area' : r.role === 'PROCUREMENT_MANAGER' ? 'n/a' : 'none'}
                    </em>}
              </span>
            </div>
          );
        },
      });
    }

    (persona.extraColumns || []).forEach((c) => base.push(c));

    if (persona.hasAvailability) {
      base.push({
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
            <span
              className={`w-2 h-2 rounded-full mr-1.5 ${
                r.is_available ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            {r.is_available ? 'Online (Available)' : 'Offline'}
          </button>
        ),
      });
    }

    base.push({
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
          <span
            className={`w-2 h-2 rounded-full mr-1.5 ${r.is_active ? 'bg-blue-500' : 'bg-red-500'}`}
          />
          {r.is_active ? 'Active (Enabled)' : 'Disabled'}
        </button>
      ),
    });

    const isManager = currentAccess?.user_type === 'dashboard' && currentAccess?.role === 'MANAGER';

    if (!isManager) {
      base.push({
        header: 'Actions',
        accessor: (r: any) => {
          // Deleting the signed-in admin is rejected by the backend; hiding the
          // button avoids offering an action that always fails.
          const isSelf =
            persona.id === 'admins' && String(r.id) === String(currentUser?.id ?? '');
          return (
            <div className="flex space-x-2">
              <Button
                variant="secondary"
                size="sm"
                className="text-primary border-primary/20 hover:bg-primary/5 px-2"
                onClick={() => openEditModal(r)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              {!isSelf && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-error border-error/20 hover:bg-error/5 px-2"
                  onClick={() => handleDelete(r)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          );
        },
      });
    }

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona, rows, currentUser?.id, currentAccess]);

  const modalFields = isEditMode
    ? [...persona.fields, { ...PASSWORD_FIELD, label: 'New Password (leave blank to keep current)' }]
    : [...persona.fields, { ...PASSWORD_FIELD, required: true }];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">User Management</h1>
          <p className="text-on-surface-variant mt-1">
            Accounts are managed per type — each has its own credentials and fields.
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-2" /> Add {persona.label.replace(/s$/, '')}
        </Button>
      </div>

      {/* ── Persona tabs ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-b border-outline-variant pb-px">
        {visiblePersonas.map((p) => {
          const Icon = p.icon;
          const isActive = p.id === persona.id;
          return (
            <button
              key={p.id}
              onClick={() => setActiveTab(p.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
                isActive
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <Icon className="w-4 h-4" />
              {p.label}
              {counts[p.id] !== undefined && (
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                    isActive ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {counts[p.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-on-surface-variant -mt-3">{persona.blurb}</p>

      {isLoading ? (
        <PageLoader
          message="Loading Directory..."
          subtitle={`Fetching ${persona.label.toLowerCase()}`}
        />
      ) : rows.length === 0 ? (
        <div className="bg-surface-container-lowest p-12 rounded-2xl border border-outline-variant shadow-sm text-center">
          <persona.icon className="w-10 h-10 mx-auto text-on-surface-variant/40" />
          <p className="mt-3 font-semibold text-on-surface">No {persona.label.toLowerCase()} yet</p>
          <p className="text-sm text-on-surface-variant mt-1">{persona.blurb}</p>
        </div>
      ) : (
        <div className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant shadow-sm">
          <Table data={rows} columns={columns} keyExtractor={(r: any) => String(r.id)} />
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={`${isEditMode ? 'Edit' : 'Create'} ${persona.label.replace(/s$/, '')}`}
        maxWidth={persona.hasAccessGrants ? '4xl' : 'md'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-full">
          <div className={persona.hasAccessGrants ? "grid grid-cols-1 md:grid-cols-2 gap-6" : "space-y-4"}>
            {/* Left side: Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Account Details</h3>
              {modalFields.map((f) => (
                <Input
                  key={f.key}
                  label={f.label}
                  type={f.type || 'text'}
                  placeholder={f.placeholder}
                  value={formData[f.key] ?? ''}
                  onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                  required={f.required}
                />
              ))}
            </div>

            {/* Right side: Access Grant */}
            {persona.hasAccessGrants && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Access & Permissions</h3>
                <AccessGrantEditor
                  catalog={catalog}
                  value={grant}
                  onChange={setGrant}
                  lockSelf={
                    isEditMode &&
                    currentUser?.user_type === 'dashboard' &&
                    String(editingId) === String(currentUser?.id ?? '')
                  }
                  assignableRoles={
                    currentUser?.user_type === 'dashboard' && currentAccess?.role === 'MANAGER'
                      ? ['SALES']
                      : undefined
                  }
                />
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-6 mt-auto border-t border-outline-variant/50">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {isEditMode ? 'Save Changes' : 'Create Account'}
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
