import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type AppRole = 'staff' | 'nurse' | 'care_home_doctor' | 'gp' | 'admin' | 'caldicott_guardian';

interface UserRoles {
  roles: AppRole[];
  isNurse: boolean;
  isCareHomeDoctor: boolean;
  isGP: boolean;
  isAdmin: boolean;
  isCaldicottGuardian: boolean;
  loading: boolean;
  // Helper to check if user has any of the specified roles
  hasAnyRole: (checkRoles: AppRole[]) => boolean;
}

// Role hierarchy for access control
export const ROLE_ACCESS = {
  // Pages accessible by each role
  nurse: ['/dashboard', '/calls', '/batches', '/profile'],
  care_home_doctor: ['/dashboard', '/calls', '/batches', '/patients', '/meditask', '/clinical-verification', '/profile'],
  gp: ['/dashboard', '/calls', '/batches', '/patients', '/meditask', '/clinical-verification', '/profile'],
  admin: ['/dashboard', '/calls', '/batches', '/patients', '/meditask', '/clinical-verification', '/ai-analytics', '/export', '/qof-reports', '/profile', '/user-management'],
  caldicott_guardian: ['/dashboard', '/calls', '/batches', '/patients', '/meditask', '/clinical-verification', '/ai-analytics', '/export', '/qof-reports', '/profile', '/caldicott', '/user-management'],
  staff: ['/dashboard', '/profile'],
} as const;

/**
 * Hook to get the current user's roles from the user_roles table.
 * Uses secure server-side role checking.
 */
export function useUserRole(): UserRoles {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRoles() {
      if (!user?.id) {
        setRoles([]);
        setLoading(false);
        return;
      }

      try {
        // Use any cast since user_roles may not be in generated types yet
        const { data, error } = await (supabase as any)
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching user roles:', error);
          setRoles([]);
        } else {
          setRoles((data || []).map((r: { role: string }) => r.role as AppRole));
        }
      } catch (err) {
        console.error('Error fetching user roles:', err);
        setRoles([]);
      } finally {
        setLoading(false);
      }
    }

    fetchRoles();
  }, [user?.id]);

  const hasAnyRole = (checkRoles: AppRole[]) => {
    return roles.some(role => checkRoles.includes(role));
  };

  return {
    roles,
    isNurse: roles.includes('nurse'),
    isCareHomeDoctor: roles.includes('care_home_doctor'),
    isGP: roles.includes('gp'),
    isAdmin: roles.includes('admin'),
    isCaldicottGuardian: roles.includes('caldicott_guardian'),
    loading,
    hasAnyRole,
  };
}
