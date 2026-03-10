import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import TablesPage from "@/pages/TablesPage";
import TableManagementPage from "@/pages/TableManagementPage";
import TableOrderPage from "@/pages/TableOrderPage";
import CashierPage from "@/pages/CashierPage";
import KitchenStationPage from "@/pages/KitchenStationPage";
import ProductsPage from "@/pages/ProductsPage";
import PrintersPage from "@/pages/PrintersPage";
import PrintAgentPage from "@/pages/PrintAgentPage";
import ReportsPage from "@/pages/ReportsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<TablesPage />} />
            <Route path="/mesas/gerenciar" element={<TableManagementPage />} />
            <Route path="/mesas/:tableId/pedido" element={<TableOrderPage />} />
            <Route path="/cozinha" element={<KitchenStationPage />} />
            <Route path="/caixa" element={<CashierPage />} />
            <Route path="/produtos" element={<ProductsPage />} />
            <Route path="/impressoras" element={<PrintersPage />} />
            <Route path="/relatorios" element={<ReportsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
