import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { RoleGuard } from "@/components/auth/RoleGuard";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Batches from "./pages/Batches";
import Calls from "./pages/Calls";
import Settings from "./pages/Settings";
import MediTask from "./pages/MediTask";
import AIAnalytics from "./pages/AIAnalytics";
import AITasks from "./pages/AITasks";
import ClinicalVerification from "./pages/ClinicalVerification";
import CaldicottDashboard from "./pages/CaldicottDashboard";
import UserManagement from "./pages/UserManagement";
import Unauthorized from "./pages/Unauthorized";
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
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/calls" element={<Calls />} />
              <Route path="/batches" element={<Batches />} />
              <Route path="/patients" element={<Patients />} />
              <Route path="/meditask" element={<MediTask />} />
              <Route path="/clinical-verification" element={<ClinicalVerification />} />
              <Route path="/ai-analytics" element={<AIAnalytics />} />
              <Route path="/ai-tasks" element={<AITasks />} />
              <Route path="/user-management" element={<UserManagement />} />
              <Route path="/caldicott" element={<CaldicottDashboard />} />
              <Route path="/profile" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
