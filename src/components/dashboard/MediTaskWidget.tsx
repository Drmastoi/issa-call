import { Link } from 'react-router-dom';
import { ClipboardList, ArrowRight, ListChecks, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

export function MediTaskWidget() {
  const { data: taskStats, isLoading } = useQuery({
    queryKey: ['meditask-stats'],
    queryFn: async () => {
      const [pending, inProgress, urgent, completed] = await Promise.all([
        supabase
          .from('meditask_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('meditask_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'in_progress'),
        supabase
          .from('meditask_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('priority', 'urgent')
          .neq('status', 'completed'),
        supabase
          .from('meditask_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed'),
      ]);

      const total = (pending.count ?? 0) + (inProgress.count ?? 0) + (completed.count ?? 0);
      const completionRate = total > 0 ? Math.round(((completed.count ?? 0) / total) * 100) : 0;

      return {
        pending: pending.count ?? 0,
        inProgress: inProgress.count ?? 0,
        urgent: urgent.count ?? 0,
        completed: completed.count ?? 0,
        completionRate,
      };
    },
  });

  return (
    <Card className="h-full shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">MediTask</CardTitle>
            <p className="text-xs text-muted-foreground">Task Management</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Completion Progress */}
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Completion Rate</span>
              <span className="text-sm font-bold">{taskStats?.completionRate ?? 0}%</span>
            </div>
            <Progress value={taskStats?.completionRate ?? 0} className="h-2" />
          </div>
        )}

        {/* Task Stats */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary/70 transition-colors">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Pending</span>
              </div>
              <span className="text-lg font-bold">{taskStats?.pending ?? 0}</span>
            </div>
            
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-warning/10 hover:bg-warning/20 transition-colors">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                <span className="text-sm">In Progress</span>
              </div>
              <span className="text-lg font-bold text-warning">{taskStats?.inProgress ?? 0}</span>
            </div>
            
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm">Urgent</span>
              </div>
              <span className="text-lg font-bold text-destructive">{taskStats?.urgent ?? 0}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-success/10 hover:bg-success/20 transition-colors">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm">Completed</span>
              </div>
              <span className="text-lg font-bold text-success">{taskStats?.completed ?? 0}</span>
            </div>
          </div>
        )}

        <Button asChild className="w-full">
          <Link to="/meditask">
            Open MediTask <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}