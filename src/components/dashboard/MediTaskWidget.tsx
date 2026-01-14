import { Link } from 'react-router-dom';
import { ClipboardList, ArrowRight, ListChecks, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

export function MediTaskWidget() {
  const { data: taskStats, isLoading } = useQuery({
    queryKey: ['meditask-stats'],
    queryFn: async () => {
      const [pending, inProgress, urgent] = await Promise.all([
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
      ]);

      return {
        pending: pending.count ?? 0,
        inProgress: inProgress.count ?? 0,
        urgent: urgent.count ?? 0,
      };
    },
  });

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">MediTask</CardTitle>
              <CardDescription>Care Home Task Management</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Task Stats */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center p-3 bg-secondary/50 rounded-lg">
              <ListChecks className="h-4 w-4 text-muted-foreground mb-1" />
              <span className="text-xl font-bold">{taskStats?.pending ?? 0}</span>
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
            <div className="flex flex-col items-center p-3 bg-secondary/50 rounded-lg">
              <Clock className="h-4 w-4 text-warning mb-1" />
              <span className="text-xl font-bold">{taskStats?.inProgress ?? 0}</span>
              <span className="text-xs text-muted-foreground">In Progress</span>
            </div>
            <div className="flex flex-col items-center p-3 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-4 w-4 text-destructive mb-1" />
              <span className="text-xl font-bold text-destructive">{taskStats?.urgent ?? 0}</span>
              <span className="text-xs text-muted-foreground">Urgent</span>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Manage care home tasks, assign staff, and track completion status.
          </p>
        </div>

        <Button asChild className="w-full">
          <Link to="/meditask">
            Open MediTask <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
