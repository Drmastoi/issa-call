import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ShieldCheck, AlertCircle, AlertTriangle, Activity,
  CheckCircle, Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface CoverageMetric {
  label: string;
  value: number;
  total: number;
  color: string;
}

export function ClinicalOverview() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['clinical-overview-analytics'],
    queryFn: async () => {
      const { data } = await supabase
        .from('analytics_aggregate')
        .select('*')
        .limit(1)
        .single();
      return data;
    },
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['clinical-overview-alerts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('health_alerts')
        .select('id, title, severity, alert_type, created_at, patient_id, acknowledged_at, patients(name)')
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const totalPatients = analytics?.total_patients ?? 0;

  const coverageMetrics: CoverageMetric[] = totalPatients > 0
    ? [
        {
          label: 'Blood Pressure',
          value: analytics?.hypertension_count ?? 0,
          total: totalPatients,
          color: 'bg-primary',
        },
        {
          label: 'Smoking Status',
          value: totalPatients - (analytics?.copd_count ?? 0),
          total: totalPatients,
          color: 'bg-accent',
        },
        {
          label: 'HbA1c Monitored',
          value: analytics?.diabetes_count ?? 0,
          total: totalPatients,
          color: 'bg-warning',
        },
        {
          label: 'Annual Review',
          value: analytics?.reviewed_last_year ?? 0,
          total: totalPatients,
          color: 'bg-success',
        },
      ]
    : [];

  const dataQuality = totalPatients > 0
    ? Math.round(
        ((analytics?.reviewed_last_year ?? 0) / totalPatients) * 100
      )
    : 0;

  const safetyGaps: string[] = [];
  if ((analytics?.hba1c_above_target_count ?? 0) > 0)
    safetyGaps.push(`${analytics?.hba1c_above_target_count} diabetic patients above HbA1c target`);
  if ((analytics?.frailty_severe_count ?? 0) > 0)
    safetyGaps.push(`${analytics?.frailty_severe_count} patients with severe frailty`);
  if ((analytics?.frailty_moderate_count ?? 0) > 0)
    safetyGaps.push(`${analytics?.frailty_moderate_count} patients with moderate frailty`);

  const isLoading = analyticsLoading || alertsLoading;

  if (isLoading) {
    return (
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-full rounded-full" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Clinical Overview
          </CardTitle>
          <Badge variant={dataQuality >= 70 ? 'default' : 'destructive'} className="text-[10px]">
            Data Quality: {dataQuality}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Coverage metrics */}
          <div className="space-y-3">
            {coverageMetrics.map((metric) => {
              const pct = metric.total > 0 ? Math.round((metric.value / metric.total) * 100) : 0;
              return (
                <div key={metric.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{metric.label}</span>
                    <span className="font-medium">{pct}% <span className="text-muted-foreground">({metric.value}/{metric.total})</span></span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}

            {safetyGaps.length > 0 && (
              <div className="pt-2 space-y-1.5">
                {safetyGaps.map((gap, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{gap}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Active alerts */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Active Alerts</span>
              <span className="text-[10px] text-muted-foreground">{alerts?.length ?? 0} unacknowledged</span>
            </div>
            {alerts && alerts.length > 0 ? (
              alerts.slice(0, 4).map((alert: any) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-2 p-2 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  {alert.severity === 'critical' ? (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{alert.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {alert.patients?.name ?? 'Unknown'} · {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <CheckCircle className="h-4 w-4 mr-1.5 text-success" />
                No active alerts
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
