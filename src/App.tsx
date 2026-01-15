import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Batches from "./pages/Batches";
import Calls from "./pages/Calls";
import Export from "./pages/Export";
import Settings from "./pages/Settings";
import QOFReports from "./pages/QOFReports";
import MediTask from "./pages/MediTask";
import AIAnalytics from "./pages/AIAnalytics";
import ClinicalVerification from "./pages/ClinicalVerification";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/ai-analytics" element={<AIAnalytics />} />
              <Route path="/patients" element={<Patients />} />
              <Route path="/batches" element={<Batches />} />
              <Route path="/calls" element={<Calls />} />
              <Route path="/export" element={<Export />} />
              <Route path="/profile" element={<Settings />} />
              <Route path="/qof-reports" element={<QOFReports />} />
              <Route path="/meditask" element={<MediTask />} />
              <Route path="/clinical-verification" element={<ClinicalVerification />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
