import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface HealthAlert {
  id: string;
  patient_id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metrics: Record<string, unknown>;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
  patients?: {
    first_name: string;
    last_name: string;
    nhs_number: string;
  };
}

export interface DashboardInsights {
  due_for_annual: number;
  critical_alerts: number;
  warning_alerts: number;
  bp_coverage: { recorded: number; total: number };
  smoking_coverage: { recorded: number; total: number };
  bmi_coverage: { recorded: number; total: number };
  call_completion_rate: number;
  trend_insights: string[];
}

export function useHealthAlerts(options?: { severity?: string; acknowledged?: boolean }) {
  return useQuery({
    queryKey: ['health-alerts', options],
    queryFn: async () => {
      let query = supabase
        .from('health_alerts')
        .select(`
          *,
          patients:patient_id (name, phone_number, nhs_number)
        `)
        .order('created_at', { ascending: false });

      if (options?.severity) {
        query = query.eq('severity', options.severity);
      }

      if (options?.acknowledged === false) {
        query = query.is('acknowledged_at', null);
      } else if (options?.acknowledged === true) {
        query = query.not('acknowledged_at', 'is', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Transform data to match expected interface
      return (data || []).map(item => ({
        ...item,
        severity: item.severity as 'info' | 'warning' | 'critical',
        patients: item.patients ? {
          first_name: (item.patients as any).name?.split(' ')[0] || '',
          last_name: (item.patients as any).name?.split(' ').slice(1).join(' ') || '',
          nhs_number: (item.patients as any).nhs_number || ''
        } : undefined
      })) as HealthAlert[];
    }
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('health_alerts')
        .update({ 
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user?.id 
        })
        .eq('id', alertId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-insights'] });
      toast({ title: "Alert acknowledged" });
    },
    onError: (error) => {
      toast({ title: "Failed to acknowledge alert", description: error.message, variant: "destructive" });
    }
  });
}

export function useDashboardInsights() {
  return useQuery({
    queryKey: ['dashboard-insights'],
    queryFn: async () => {
      const response = await supabase.functions.invoke('ai-health-analysis', {
        body: { mode: 'dashboard-insights' }
      });

      if (response.error) throw response.error;
      return response.data as DashboardInsights;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

export function useRunAnalysis() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { mode: 'analyze-patient' | 'analyze-all' | 'summarize-call'; patient_id?: string; call_id?: string }) => {
      const response = await supabase.functions.invoke('ai-health-analysis', {
        body: params
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['health-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-insights'] });
      
      if (variables.mode === 'analyze-all') {
        toast({ title: "Analysis Complete", description: `Generated ${data.total_alerts} alerts` });
      } else if (variables.mode === 'summarize-call') {
        queryClient.invalidateQueries({ queryKey: ['ai-summaries'] });
        toast({ title: "Summary Generated" });
      }
    },
    onError: (error) => {
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
    }
  });
}

export function useAISummary(callId: string | undefined) {
  return useQuery({
    queryKey: ['ai-summaries', callId],
    queryFn: async () => {
      if (!callId) return null;
      
      const { data, error } = await supabase
        .from('ai_summaries')
        .select('*')
        .eq('call_id', callId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!callId
  });
}
