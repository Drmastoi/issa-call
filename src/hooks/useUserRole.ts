import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type AppRole = 'staff' | 'admin' | 'caldicott_guardian';

interface UserRoles {
  roles: AppRole[];
  isCaldicottGuardian: boolean;
  isAdmin: boolean;
  loading: boolean;
}

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
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching user roles:', error);
          setRoles([]);
        } else {
          setRoles((data || []).map(r => r.role as AppRole));
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

  return {
    roles,
    isCaldicottGuardian: roles.includes('caldicott_guardian'),
    isAdmin: roles.includes('admin'),
    loading,
  };
}
