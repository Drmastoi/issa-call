import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Hook for logging patient data access for ICO/CQC Regulation 17 compliance.
 * Tracks when staff view, edit, export, or delete patient data.
 */
export function usePatientAccessLog() {
  const { user } = useAuth();

  const logAccess = useCallback(async (
    patientId: string,
    accessType: 'view' | 'edit' | 'export' | 'delete',
    accessedFields?: string[]
  ) => {
    if (!user?.id || !patientId) return;

    try {
      await supabase.rpc('log_patient_access', {
        p_patient_id: patientId,
        p_user_id: user.id,
        p_access_type: accessType,
        p_accessed_fields: accessedFields || null,
        p_ip_address: null, // Browser can't reliably get IP
        p_user_agent: navigator.userAgent,
      });
    } catch (error) {
      // Don't block the user if logging fails, but log to console
      console.warn('Failed to log patient access:', error);
    }
  }, [user?.id]);

  const logPatientView = useCallback((patientId: string, fields?: string[]) => {
    return logAccess(patientId, 'view', fields);
  }, [logAccess]);

  const logPatientEdit = useCallback((patientId: string, fields?: string[]) => {
    return logAccess(patientId, 'edit', fields);
  }, [logAccess]);

  const logPatientExport = useCallback((patientId: string) => {
    return logAccess(patientId, 'export', ['all']);
  }, [logAccess]);

  const logPatientDelete = useCallback((patientId: string) => {
    return logAccess(patientId, 'delete', ['all']);
  }, [logAccess]);

  return {
    logAccess,
    logPatientView,
    logPatientEdit,
    logPatientExport,
    logPatientDelete,
  };
}
