import { useState, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
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
import ReportsPage from "@/pages/ReportsPage";
import CustomerSalesPage from "@/pages/CustomerSalesPage";
import UsersPage from "@/pages/UsersPage";
import NotFound from "@/pages/NotFound";
import WaiterLayout from "@/pages/waiter/WaiterLayout";
import WaiterLoginPage from "@/pages/waiter/WaiterLoginPage";
import WaiterTablesPage from "@/pages/waiter/WaiterTablesPage";
import WaiterOrderPage from "@/pages/waiter/WaiterOrderPage";
import WaiterOrdersPage from "@/pages/waiter/WaiterOrdersPage";
import WaiterProfilePage from "@/pages/waiter/WaiterProfilePage";
import SelfServicePage from "@/pages/self-service/SelfServicePage";
import { Loader2 } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import PWAUpdatePrompt from "@/components/PWAUpdatePrompt";
import { ScrollToTop } from "@/components/ScrollToTop";
import SplashScreen from "@/components/SplashScreen";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashFinished = useCallback(() => setShowSplash(false), []);

  if (loading) {
    return <LoadingScreen mode="full" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      {showSplash && <SplashScreen onFinished={handleSplashFinished} />}
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<TablesPage />} />
          <Route path="/mesas/gerenciar" element={<TableManagementPage />} />
          <Route path="/mesas/:tableId/pedido" element={<TableOrderPage />} />
          <Route path="/cozinha" element={<KitchenStationPage />} />
          <Route path="/caixa" element={<CashierPage />} />
          <Route path="/controle-caixa" element={<CashRegisterPage />} />
          <Route path="/produtos" element={<ProductsPage />} />
          <Route path="/impressoras" element={<PrintersPage />} />
          <Route path="/impressoras/agente" element={<PrintAgentPage />} />
          <Route path="/relatorios" element={<ReportsPage />} />
          <Route path="/clientes" element={<CustomerSalesPage />} />
          <Route path="/usuarios" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
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
          <Routes>
            <Route path="/login" element={<AuthRoute />} />
            {/* Waiter mobile mode */}
            {/* Self-service (public, no auth) */}
            <Route path="/autoatendimento/:tableId" element={<SelfServicePage />} />
            <Route path="/garcom/login" element={<WaiterLoginPage />} />
            <Route path="/garcom" element={<WaiterLayout />}>
              <Route index element={<WaiterTablesPage />} />
              <Route path="mesa/:tableId" element={<WaiterOrderPage />} />
              <Route path="pedidos" element={<WaiterOrdersPage />} />
              <Route path="perfil" element={<WaiterProfilePage />} />
            </Route>
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
