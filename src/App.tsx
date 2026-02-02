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
import Export from "./pages/Export";
import Settings from "./pages/Settings";
import QOFReports from "./pages/QOFReports";
import MediTask from "./pages/MediTask";
import AIAnalytics from "./pages/AIAnalytics";
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
              {/* Dashboard - accessible to all authenticated users */}
              <Route path="/dashboard" element={<Dashboard />} />
              
              {/* Calls features - Nurse, Care Home Doctor, GP, Admin, Caldicott */}
              <Route path="/calls" element={
                <RoleGuard allowedRoles={['nurse', 'care_home_doctor', 'gp', 'admin', 'caldicott_guardian']}>
                  <Calls />
                </RoleGuard>
              } />
              <Route path="/batches" element={
                <RoleGuard allowedRoles={['nurse', 'care_home_doctor', 'gp', 'admin', 'caldicott_guardian']}>
                  <Batches />
                </RoleGuard>
              } />
              
              {/* Care Home Management - Care Home Doctor, GP, Admin, Caldicott */}
              <Route path="/patients" element={
                <RoleGuard allowedRoles={['care_home_doctor', 'gp', 'admin', 'caldicott_guardian']}>
                  <Patients />
                </RoleGuard>
              } />
              <Route path="/meditask" element={
                <RoleGuard allowedRoles={['care_home_doctor', 'gp', 'admin', 'caldicott_guardian']}>
                  <MediTask />
                </RoleGuard>
              } />
              <Route path="/clinical-verification" element={
                <RoleGuard allowedRoles={['care_home_doctor', 'gp', 'admin', 'caldicott_guardian']}>
                  <ClinicalVerification />
                </RoleGuard>
              } />
              
              {/* Admin only features */}
              <Route path="/ai-analytics" element={
                <RoleGuard allowedRoles={['admin', 'caldicott_guardian']}>
                  <AIAnalytics />
                </RoleGuard>
              } />
              <Route path="/export" element={
                <RoleGuard allowedRoles={['admin', 'caldicott_guardian']}>
                  <Export />
                </RoleGuard>
              } />
              <Route path="/qof-reports" element={
                <RoleGuard allowedRoles={['admin', 'caldicott_guardian']}>
                  <QOFReports />
                </RoleGuard>
              } />
              <Route path="/user-management" element={
                <RoleGuard allowedRoles={['admin', 'caldicott_guardian']}>
                  <UserManagement />
                </RoleGuard>
              } />
              
              {/* Caldicott Guardian only */}
              <Route path="/caldicott" element={
                <RoleGuard allowedRoles={['caldicott_guardian']}>
                  <CaldicottDashboard />
                </RoleGuard>
              } />
              
              {/* Profile - accessible to all */}
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
