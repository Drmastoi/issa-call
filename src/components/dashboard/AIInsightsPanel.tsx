import { AlertTriangle, Activity, TrendingUp, Users, Zap, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardInsights, useHealthAlerts, useRunAnalysis, useAcknowledgeAlert } from "@/hooks/useHealthAlerts";
import { QOF_INDICATORS, calculateQOFProgress } from "@/lib/qof-codes";
import { cn } from "@/lib/utils";

export function AIInsightsPanel() {
  const { data: insights, isLoading: insightsLoading } = useDashboardInsights();
  const { data: criticalAlerts, isLoading: alertsLoading } = useHealthAlerts({ severity: 'critical', acknowledged: false });
  const runAnalysis = useRunAnalysis();
  const acknowledgeAlert = useAcknowledgeAlert();

  const isLoading = insightsLoading || alertsLoading;

  const handleRunAnalysis = () => {
    runAnalysis.mutate({ mode: 'analyze-all' });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">AI Health Intelligence</h2>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRunAnalysis}
          disabled={runAnalysis.isPending}
        >
          <RefreshCw className={cn("h-4 w-4 mr-1", runAnalysis.isPending && "animate-spin")} />
          Analyze All
        </Button>
      </div>

      {/* Critical Alerts */}
      {criticalAlerts && criticalAlerts.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Critical Alerts ({criticalAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {criticalAlerts.slice(0, 3).map((alert) => (
              <div 
                key={alert.id} 
                className="flex items-start justify-between gap-2 p-2 rounded-md bg-background border"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{alert.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{alert.description}</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => acknowledgeAlert.mutate(alert.id)}
                  disabled={acknowledgeAlert.isPending}
                >
                  Ack
                </Button>
              </div>
            ))}
            {criticalAlerts.length > 3 && (
              <p className="text-xs text-muted-foreground text-center">
                +{criticalAlerts.length - 3} more alerts
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trend Insights */}
      {insights?.trend_insights && insights.trend_insights.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {insights.trend_insights.map((insight, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  {insight}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{insights?.due_for_annual || 0}</p>
              <p className="text-xs text-muted-foreground">Due Annual Check</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{insights?.call_completion_rate || 0}%</p>
              <p className="text-xs text-muted-foreground">Completion Rate</p>
            </div>
          </div>
        </Card>
      </div>

      {/* QOF Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">QOF Coverage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <QOFProgressItem
            label="BP Monitoring"
            recorded={insights?.bp_coverage.recorded || 0}
            total={insights?.bp_coverage.total || 0}
            indicator={QOF_INDICATORS.find(q => q.id === 'hypertension_monitoring')!}
          />
          <QOFProgressItem
            label="Smoking Status"
            recorded={insights?.smoking_coverage.recorded || 0}
            total={insights?.smoking_coverage.total || 0}
            indicator={QOF_INDICATORS.find(q => q.id === 'smoking_status')!}
          />
          <QOFProgressItem
            label="BMI Recording"
            recorded={insights?.bmi_coverage.recorded || 0}
            total={insights?.bmi_coverage.total || 0}
            indicator={QOF_INDICATORS.find(q => q.id === 'bmi_recording')!}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function QOFProgressItem({ 
  label, 
  recorded, 
  total, 
  indicator 
}: { 
  label: string; 
  recorded: number; 
  total: number; 
  indicator: { targetPercent: number } 
}) {
  const { percent, status } = calculateQOFProgress(
    indicator as any,
    recorded,
    total
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{recorded}/{total}</span>
          <Badge 
            variant={status === 'good' ? 'default' : status === 'warning' ? 'secondary' : 'destructive'}
            className="text-xs px-1.5 py-0"
          >
            {percent}%
          </Badge>
        </div>
      </div>
      <Progress 
        value={percent} 
        className={cn(
          "h-1.5",
          status === 'good' && "[&>div]:bg-green-500",
          status === 'warning' && "[&>div]:bg-yellow-500",
          status === 'poor' && "[&>div]:bg-red-500"
        )}
      />
    </div>
  );
}
