import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Zap, ClipboardCheck, ListTodo, AlertTriangle, 
  AlertCircle, BarChart3 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

export function CommandStrip() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['command-strip-counts'],
    queryFn: async () => {
      const [pendingVerify, openTasks, criticalAlerts, warningAlerts] = await Promise.all([
        supabase
          .from('call_responses')
          .select('id', { count: 'exact', head: true })
          .eq('verification_status', 'pending'),
        supabase
          .from('meditask_tasks')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'in_progress']),
        supabase
          .from('health_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('severity', 'critical')
          .is('acknowledged_at', null),
        supabase
          .from('health_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('severity', 'warning')
          .is('acknowledged_at', null),
      ]);

      return {
        pendingVerify: pendingVerify.count ?? 0,
        openTasks: openTasks.count ?? 0,
        criticalAlerts: criticalAlerts.count ?? 0,
        warningAlerts: warningAlerts.count ?? 0,
      };
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border/50">
      <Button
        size="sm"
        variant="default"
        className="gap-1.5 h-8 text-xs"
        onClick={() => navigate('/ai-analytics')}
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Run Analysis
      </Button>

      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 h-8 text-xs"
        onClick={() => navigate('/clinical-verification')}
      >
        <ClipboardCheck className="h-3.5 w-3.5" />
        Verify
        {(data?.pendingVerify ?? 0) > 0 && (
          <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
            {data?.pendingVerify}
          </Badge>
        )}
      </Button>

      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 h-8 text-xs"
        onClick={() => navigate('/ai-tasks')}
      >
        <ListTodo className="h-3.5 w-3.5" />
        Tasks
        {(data?.openTasks ?? 0) > 0 && (
          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
            {data?.openTasks}
          </Badge>
        )}
      </Button>

      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 h-8 text-xs"
        onClick={() => navigate('/meditask')}
      >
        <Zap className="h-3.5 w-3.5" />
        MediTask
      </Button>

      <div className="ml-auto flex items-center gap-2">
        {(data?.criticalAlerts ?? 0) > 0 && (
          <div className="flex items-center gap-1 text-xs text-destructive font-medium">
            <AlertCircle className="h-3.5 w-3.5" />
            {data?.criticalAlerts} Critical
          </div>
        )}
        {(data?.warningAlerts ?? 0) > 0 && (
          <div className="flex items-center gap-1 text-xs text-warning font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {data?.warningAlerts} Warning
          </div>
        )}
        {(data?.criticalAlerts ?? 0) === 0 && (data?.warningAlerts ?? 0) === 0 && (
          <span className="text-xs text-muted-foreground">No active alerts</span>
        )}
      </div>
    </div>
  );
}
