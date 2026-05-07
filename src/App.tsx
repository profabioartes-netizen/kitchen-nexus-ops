import { useState, useCallback, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import { AppLayout } from "@/components/AppLayout";
import AuthPage from "@/pages/AuthPage";
import TablesPage from "@/pages/TablesPage";
import TableManagementPage from "@/pages/TableManagementPage";
import TableOrderPage from "@/pages/TableOrderPage";
import CashierPage from "@/pages/CashierPage";
import CashRegisterPage from "@/pages/CashRegisterPage";
import KitchenStationPage from "@/pages/KitchenStationPage";
import ProductsPage from "@/pages/ProductsPage";
import PrintersPage from "@/pages/PrintersPage";
import PrintAgentPage from "@/pages/PrintAgentPage";
import PrinterHelpPage from "@/pages/PrinterHelpPage";
import PrintReceiptPage from "@/pages/print/PrintReceiptPage";
import ReportsPage from "@/pages/ReportsPage";
import SalesPage from "@/pages/SalesPage";
import UsersPage from "@/pages/UsersPage";
import SettingsPage from "@/pages/SettingsPage";
import TenantLoginPage from "@/pages/TenantLoginPage";
import NotFound from "@/pages/NotFound";
import WaiterLayout from "@/pages/waiter/WaiterLayout";
import WaiterLoginPage from "@/pages/waiter/WaiterLoginPage";
import WaiterTablesPage from "@/pages/waiter/WaiterTablesPage";
import WaiterOrderPage from "@/pages/waiter/WaiterOrderPage";
import WaiterOrdersPage from "@/pages/waiter/WaiterOrdersPage";
import WaiterProfilePage from "@/pages/waiter/WaiterProfilePage";
import AccountingLoginPage from "@/pages/accounting/AccountingLoginPage";
import AccountingLayout from "@/pages/accounting/AccountingLayout";
import AccountingDashboard from "@/pages/accounting/AccountingDashboard";
import AccountingSalesPage from "@/pages/accounting/AccountingSalesPage";
import AdminPlatformLayout from "@/pages/admin-platform/AdminPlatformLayout";
import AdminPlatformTenantsPage from "@/pages/admin-platform/AdminPlatformTenantsPage";
import AdminPlatformUsersPage from "@/pages/admin-platform/AdminPlatformUsersPage";
import ImpersonateTenantPage from "@/pages/admin-platform/ImpersonateTenantPage";
import TenantSuspendedScreen from "@/components/TenantSuspendedScreen";
import LoadingScreen from "@/components/LoadingScreen";
import PWAUpdatePrompt from "@/components/PWAUpdatePrompt";
import { ScrollToTop } from "@/components/ScrollToTop";
import SplashScreen from "@/components/SplashScreen";

const queryClient = new QueryClient();

const isStandalonePWA = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const [clearing, setClearing] = useState(false);
  const handleSplashFinished = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    // If a contabilidade user session leaks into the operational PWA, sign them out
    if (!loading && user && profile?.role === "contabilidade" && isStandalonePWA() && !clearing) {
      setClearing(true);
      signOut().finally(() => setClearing(false));
    }
  }, [loading, user, profile, clearing, signOut]);

  if (loading || clearing) {
    return <LoadingScreen mode="full" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (profile?.role === "contabilidade" && !isStandalonePWA()) {
    return <Navigate to="/contabilidade" replace />;
  }

  return (
    <>
      {showSplash && <SplashScreen onFinished={handleSplashFinished} />}
      <TenantGate>{children}</TenantGate>
    </>
  );
}

function TenantGate({ children }: { children: ReactNode }) {
  const { tenant, isSuperAdmin, loading } = useTenant();
  if (loading) return <LoadingScreen mode="full" />;
  // Super admin sem tenant vinculado: redireciona para painel da plataforma
  if (isSuperAdmin && !tenant) return <Navigate to="/admin-platform" replace />;
  if (tenant && tenant.status === "suspenso") return <TenantSuspendedScreen />;
  if (tenant && tenant.status === "cancelado") return <TenantSuspendedScreen />;
  return <>{children}</>;
}

function BlockWaiter({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  if (profile?.role === "waiter") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AuthRoute() {
  const { user, profile, loading, signOut } = useAuth();
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    // If a contabilidade user has an active session on the operational login page,
    // sign them out automatically so the operator can log in fresh.
    if (!loading && user && profile?.role === "contabilidade" && !clearing) {
      setClearing(true);
      signOut().finally(() => setClearing(false));
    }
  }, [loading, user, profile, clearing, signOut]);

  if (loading || clearing) return null;
  if (user && profile?.role !== "contabilidade") return <Navigate to="/" replace />;
  return <AuthPage />;
}

// eslint-disable-next-line react-refresh/only-export-components
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <PWAUpdatePrompt />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <AuthProvider>
          <TenantProvider>
          <Routes>
            <Route path="/login" element={<AuthRoute />} />

            {/* Impressão silenciosa (kiosk-printing friendly) — sem layout */}
            <Route path="/print/receipt/:id" element={<PrintReceiptPage />} />
            <Route path="/print/order/:id" element={<PrintReceiptPage />} />

            {/* Waiter mobile mode */}
            <Route path="/garcom/login" element={<WaiterLoginPage />} />
            <Route path="/garcom" element={<WaiterLayout />}>
              <Route index element={<WaiterTablesPage />} />
              <Route path="mesa/:tableId" element={<WaiterOrderPage />} />
              <Route path="pedidos" element={<WaiterOrdersPage />} />
              <Route path="perfil" element={<WaiterProfilePage />} />
            </Route>

            {/* Accounting panel */}
            <Route path="/contabilidade/login" element={<AccountingLoginPage />} />
            <Route path="/contabilidade" element={<AccountingLayout />}>
              <Route index element={<AccountingDashboard />} />
              <Route path="vendas" element={<AccountingSalesPage />} />
            </Route>

            {/* Admin-only routes */}
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<TablesPage />} />
              <Route path="/mesas/gerenciar" element={<TableManagementPage />} />
              <Route path="/mesas/:tableId/pedido" element={<TableOrderPage />} />
              <Route path="/cozinha" element={<KitchenStationPage />} />
              <Route path="/caixa" element={<CashierPage />} />
              <Route path="/controle-caixa" element={<CashRegisterPage />} />
              <Route path="/produtos" element={<ProductsPage />} />
              <Route path="/impressoras" element={<PrintersPage />} />
              <Route path="/impressoras/agente" element={<PrintAgentPage />} />
              <Route path="/impressoras/ajuda" element={<PrinterHelpPage />} />
              <Route path="/relatorios" element={<ReportsPage />} />
              <Route path="/vendas" element={<SalesPage />} />
              <Route path="/usuarios" element={<UsersPage />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
            </Route>

            {/* Super Admin Platform */}
            <Route path="/admin-platform" element={<AdminPlatformLayout />}>
              <Route index element={<AdminPlatformTenantsPage />} />
              <Route path="usuarios" element={<AdminPlatformUsersPage />} />
            </Route>

            {/* Super Admin -> impersonate tenant (auto-login no PDV do estabelecimento).
                Fora do RequireAuth/TenantGate para conseguir gravar o tenant impersonado
                ANTES da checagem que redirecionaria o super_admin para /admin-platform. */}
            <Route path="/__impersonate" element={<ImpersonateTenantPage />} />

            {/* Tenant personalized login by slug — keep LAST before 404 */}
            <Route path="/:slug" element={<TenantLoginPage />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
