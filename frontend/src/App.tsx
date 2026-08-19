import React, { Component, ErrorInfo, ReactNode, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout from '@/components/layout/AppLayout';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

// Lazy loaded routes for Code Splitting
const LoginPage = React.lazy(() => import('@/pages/auth/LoginPage'));
const MarketDashboard = React.lazy(() => import('@/pages/dashboard/MarketDashboard'));
const SalesCatalogue = React.lazy(() => import('@/pages/warehouse/SalesCatalogue'));
const OrderUpload = React.lazy(() => import('@/pages/warehouse/OrderUpload'));
const PickLists = React.lazy(() => import('@/pages/warehouse/PickLists'));
const PickListDetails = React.lazy(() => import('@/pages/warehouse/PickListDetails'));
const LpoManagement = React.lazy(() => import('@/pages/warehouse/LpoManagement'));
const LpoDetails = React.lazy(() => import('@/pages/warehouse/LpoDetails'));
const RawMaterials = React.lazy(() => import('@/pages/market/RawMaterials'));
const PriceManagement = React.lazy(() => import('@/pages/market/PriceManagement'));
const MarketOverview = React.lazy(() => import('@/pages/market/MarketOverview'));
const UserManagement = React.lazy(() => import('@/pages/admin/UserManagement'));
const CustomerMaster = React.lazy(() => import('@/pages/admin/CustomerMaster'));
const DeliveryManifest = React.lazy(() => import('@/pages/delivery/DeliveryManifest'));
const VehicleLoading = React.lazy(() => import('@/pages/delivery/VehicleLoading'));

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

// Global suspense fallback loader
const PageLoader = () => (
  <div className="flex h-screen items-center justify-center bg-slate-50">
    <div className="flex flex-col items-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600"></div>
      <p className="text-sm font-semibold text-slate-500">Loading module...</p>
    </div>
  </div>
);

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Toaster position="top-right" />
          <Suspense fallback={<PageLoader />}>
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
                <Route path="warehouse/lpos" element={<LpoManagement />} />
                <Route path="warehouse/lpos/:id" element={<LpoDetails />} />
                <Route path="warehouse/upload" element={<OrderUpload />} />
                <Route path="warehouse/picking" element={<Navigate to="/warehouse/picklists" replace />} />
                <Route path="warehouse/picklists" element={<PickLists />} />
                <Route path="warehouse/picklists/:id" element={<PickListDetails />} />
                <Route path="warehouse/verification" element={<Navigate to="/warehouse/picklists" replace />} />
                <Route path="delivery/manifest" element={<DeliveryManifest />} />
                <Route path="delivery/loading/:id" element={<VehicleLoading />} />
                <Route path="market/materials" element={<RawMaterials />} />
                <Route path="market/prices" element={<PriceManagement />} />
                <Route path="market/overview" element={<MarketOverview />} />
                <Route path="market/dubai" element={<Navigate to="/market/prices" replace />} />
                <Route path="market/international" element={<Navigate to="/market/prices" replace />} />
                <Route path="market/history" element={<Navigate to="/market/overview" replace />} />
                <Route path="admin/users" element={<UserManagement />} />
                <Route path="admin/customers" element={<CustomerMaster />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
