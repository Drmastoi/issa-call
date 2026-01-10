import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type EntityType = 'patient' | 'batch' | 'call' | 'user' | 'export';

export function useAuditLog() {
  const { user } = useAuth();

  const logAction = async (
    action: string,
    entityType: EntityType,
    entityId?: string,
    details?: Record<string, unknown>
  ) => {
    if (!user) return;

    try {
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details: details as never,
      });
    } catch (error) {
      console.error('Failed to log audit action:', error);
    }
  };

  return { logAction };
}
