import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import ProductPicker from "./pages/ProductPicker";
import Index from "./pages/Index";
import EnergyManager from "./pages/EnergyManager";
import MonthlyImport from "./pages/MonthlyImport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Link to="/data-import" className="data-source-link fixed bottom-5 right-5 z-50 rounded-full bg-[#147d78] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#116c67]">Monthly data staging</Link>
        <Link to="/" className="fixed bottom-5 left-5 z-50 rounded-full border border-[#b9d4c8] bg-white px-4 py-3 text-sm font-semibold text-[#286d61] shadow-lg hover:bg-[#f0f7f2]">All workspaces</Link>
        <Routes>
          <Route path="/" element={<ProductPicker />} />
          <Route path="/government" element={<Index />} />
          <Route path="/energy-manager" element={<EnergyManager />} />
          <Route path="/data-import" element={<MonthlyImport />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
