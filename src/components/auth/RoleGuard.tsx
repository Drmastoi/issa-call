import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserRole, AppRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: AppRole[];
  fallback?: string;
}

/**
 * Route guard that checks if the user has one of the allowed roles.
 * Redirects to fallback path (default: /dashboard) if unauthorized.
 */
export function RoleGuard({ children, allowedRoles, fallback = '/unauthorized' }: RoleGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const { roles, loading: rolesLoading } = useUserRole();

  // Show loading state while checking auth and roles
  if (authLoading || rolesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If not authenticated, redirect to auth
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user has any of the allowed roles
  const hasAccess = roles.some(role => allowedRoles.includes(role));

  if (!hasAccess) {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
