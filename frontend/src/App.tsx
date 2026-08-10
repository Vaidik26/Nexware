import React, { Component, ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Toaster } from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';

import LoginPage from '@/pages/auth/LoginPage';
import MarketDashboard from '@/pages/dashboard/MarketDashboard';
import SalesCatalogue from '@/pages/warehouse/SalesCatalogue';
import OrderUpload from '@/pages/warehouse/OrderUpload';
import CreateOrder from '@/pages/warehouse/CreateOrder';
import PickLists from '@/pages/warehouse/PickLists';
import RawMaterials from '@/pages/market/RawMaterials';
import PriceManagement from '@/pages/market/PriceManagement';
import MarketOverview from '@/pages/market/MarketOverview';
import UserManagement from '@/pages/admin/UserManagement';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React UI Error:', error, errorInfo);
  }

  private handleRecovery = () => {
    // Clear potentially corrupted local cache causing render crash
    try {
      localStorage.removeItem('nexware_live_materials_cache_v2');
      localStorage.removeItem('nexware_live_prices_cache_v2');
      localStorage.removeItem('nexware_live_last_updated_v2');
    } catch (e) {
      console.error(e);
    }
    window.location.href = '/dashboard';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-slate-100">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold border border-red-500/30">
              ⚠️
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Application Recovery Mode</h2>
              <p className="text-sm text-slate-400 mt-2">
                We encountered an unexpected display rendering hiccup. Your underlying data remains safe and intact.
              </p>
            </div>
            {this.state.error && (
              <div className="p-3 bg-slate-900/80 rounded-xl text-left font-mono text-xs text-red-300 overflow-x-auto border border-slate-700 max-h-32">
                {this.state.error.message || this.state.error.toString()}
              </div>
            )}
            <button
              onClick={this.handleRecovery}
              className="w-full py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2"
            >
              <span>🔄 Reload & Reset View</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<MarketDashboard />} />
            <Route path="warehouse/catalogue" element={<SalesCatalogue />} />
            <Route path="warehouse/upload" element={<OrderUpload />} />
            <Route path="warehouse/create-order" element={<CreateOrder />} />
            <Route path="warehouse/picking" element={<Navigate to="/warehouse/picklists" replace />} />
            <Route path="warehouse/picklists" element={<PickLists />} />
            <Route path="warehouse/verification" element={<Navigate to="/warehouse/picklists" replace />} />
            <Route path="market/materials" element={<RawMaterials />} />
            <Route path="market/prices" element={<PriceManagement />} />
            <Route path="market/overview" element={<MarketOverview />} />
            <Route path="market/dubai" element={<Navigate to="/market/prices" replace />} />
            <Route path="market/international" element={<Navigate to="/market/prices" replace />} />
            <Route path="market/history" element={<Navigate to="/market/overview" replace />} />
            <Route path="admin/users" element={<UserManagement />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
