import { AlertTriangle, Activity, TrendingUp, Users, Zap, RefreshCw, Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardInsights, useHealthAlerts, useRunAnalysis, useAcknowledgeAlert } from "@/hooks/useHealthAlerts";
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
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="border-0 shadow-md bg-gradient-to-br from-primary/10 via-primary/5 to-background">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">AI Intelligence</CardTitle>
                <p className="text-xs text-muted-foreground">Health insights & alerts</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRunAnalysis}
            disabled={runAnalysis.isPending}
            className="w-full"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", runAnalysis.isPending && "animate-spin")} />
            {runAnalysis.isPending ? 'Analyzing...' : 'Run Analysis'}
          </Button>
        </CardContent>
      </Card>

      {/* Critical Alerts */}
      {criticalAlerts && criticalAlerts.length > 0 && (
        <Card className="border-destructive/30 shadow-md bg-gradient-to-br from-destructive/10 via-destructive/5 to-background">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Critical Alerts
              <Badge variant="destructive" className="ml-auto">
                {criticalAlerts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {criticalAlerts.slice(0, 3).map((alert) => (
              <div 
                key={alert.id} 
                className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-background/80 border border-destructive/20 hover:border-destructive/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{alert.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{alert.description}</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="shrink-0 h-7 text-xs"
                  onClick={() => acknowledgeAlert.mutate(alert.id)}
                  disabled={acknowledgeAlert.isPending}
                >
                  Ack
                </Button>
              </div>
            ))}
            {criticalAlerts.length > 3 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{criticalAlerts.length - 3} more alerts
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Trend Insights */}
      {insights?.trend_insights && insights.trend_insights.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Latest Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {insights.trend_insights.slice(0, 4).map((insight, i) => (
                <li key={i} className="text-sm flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                  <span className="text-primary mt-0.5 shrink-0">•</span>
                  <span className="text-muted-foreground">{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <Users className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{insights?.due_for_annual || 0}</p>
              <p className="text-xs text-muted-foreground">Due Annual</p>
            </div>
          </div>
        </Card>
        <Card className="p-3 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Activity className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{insights?.call_completion_rate || 0}%</p>
              <p className="text-xs text-muted-foreground">Completion</p>
            </div>
          </div>
        </Card>
      </div>

      {/* QOF Progress */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">QOF Coverage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <QOFProgressItem
            label="BP Monitoring"
            recorded={insights?.bp_coverage.recorded || 0}
            total={insights?.bp_coverage.total || 0}
            targetPercent={77}
          />
          <QOFProgressItem
            label="Smoking Status"
            recorded={insights?.smoking_coverage.recorded || 0}
            total={insights?.smoking_coverage.total || 0}
            targetPercent={90}
          />
          <QOFProgressItem
            label="HbA1c Recording"
            recorded={insights?.bmi_coverage.recorded || 0}
            total={insights?.bmi_coverage.total || 0}
            targetPercent={70}
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
  targetPercent
}: { 
  label: string; 
  recorded: number; 
  total: number; 
  targetPercent: number;
}) {
  const percent = total > 0 ? Math.round((recorded / total) * 100) : 0;
  const status = percent >= targetPercent ? 'good' : percent >= targetPercent * 0.8 ? 'warning' : 'poor';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{recorded}/{total}</span>
          <Badge 
            variant={status === 'good' ? 'default' : status === 'warning' ? 'secondary' : 'destructive'}
            className="text-xs px-1.5 py-0 min-w-[2.5rem] justify-center"
          >
            {percent}%
          </Badge>
        </div>
      </div>
      <Progress 
        value={percent} 
        className={cn(
          "h-2",
          status === 'good' && "[&>div]:bg-success",
          status === 'warning' && "[&>div]:bg-warning",
          status === 'poor' && "[&>div]:bg-destructive"
        )}
      />
    </div>
  );
}