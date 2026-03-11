import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppSidebar } from './AppSidebar';
import { AIChatAgent } from '@/components/chat/AIChatAgent';
import { GlobalPatientSearch } from './GlobalPatientSearch';
import { useIsFetching } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const { user, loading } = useAuth();
  const isFetching = useIsFetching();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Global loading bar */}
        <div className={cn(
          "h-0.5 bg-primary transition-all duration-500 shrink-0",
          isFetching ? "opacity-100 w-full animate-pulse" : "opacity-0 w-0"
        )} />
        {/* Top bar with global search */}
        <header className="h-12 flex items-center justify-end px-4 border-b border-border bg-background shrink-0">
          <GlobalPatientSearch />
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <AIChatAgent />
    </div>
  );
}
