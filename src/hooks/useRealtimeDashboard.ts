import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to subscribe to realtime updates for dashboard data.
 * Automatically invalidates relevant queries when data changes.
 */
export function useRealtimeDashboard() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to calls table changes
    const callsChannel = supabase
      .channel('dashboard-calls')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls',
        },
        () => {
          // Invalidate call-related queries
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          queryClient.invalidateQueries({ queryKey: ['recent-calls'] });
        }
      )
      .subscribe();

    // Subscribe to call_batches table changes
    const batchesChannel = supabase
      .channel('dashboard-batches')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_batches',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          queryClient.invalidateQueries({ queryKey: ['upcoming-batches'] });
        }
      )
      .subscribe();

    // Subscribe to patients table changes
    const patientsChannel = supabase
      .channel('dashboard-patients')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patients',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }
      )
      .subscribe();

    // Subscribe to health_alerts table changes
    const alertsChannel = supabase
      .channel('dashboard-alerts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'health_alerts',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['health-alerts'] });
          queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
        }
      )
      .subscribe();

    // Subscribe to meditask_tasks table changes
    const tasksChannel = supabase
      .channel('dashboard-tasks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meditask_tasks',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['meditask-widget'] });
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(callsChannel);
      supabase.removeChannel(batchesChannel);
      supabase.removeChannel(patientsChannel);
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(tasksChannel);
    };
  }, [queryClient]);
}
