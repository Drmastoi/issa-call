import { AlertTriangle, AlertCircle, Info, Check, ChevronRight, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHealthAlerts, useAcknowledgeAlert, type HealthAlert } from "@/hooks/useHealthAlerts";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface RiskAlertsWidgetProps {
  maxItems?: number;
  showViewAll?: boolean;
}

export function RiskAlertsWidget({ maxItems = 5, showViewAll = true }: RiskAlertsWidgetProps) {
  const { data: alerts, isLoading } = useHealthAlerts({ acknowledged: false });
  const acknowledgeAlert = useAcknowledgeAlert();
  const navigate = useNavigate();

  const sortedAlerts = alerts?.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  }).slice(0, maxItems);

  // Count by severity
  const alertCounts = {
    critical: alerts?.filter(a => a.severity === 'critical').length || 0,
    warning: alerts?.filter(a => a.severity === 'warning').length || 0,
    info: alerts?.filter(a => a.severity === 'info').length || 0,
  };

  const getSeverityIcon = (severity: HealthAlert['severity']) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-warning" />;
      default:
        return <Info className="h-4 w-4 text-primary" />;
    }
  };

  const getSeverityBadge = (severity: HealthAlert['severity']) => {
    const variants: Record<string, 'destructive' | 'secondary' | 'outline'> = {
      critical: 'destructive',
      warning: 'secondary',
      info: 'outline'
    };
    return variants[severity] || 'outline';
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Risk Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!sortedAlerts || sortedAlerts.length === 0) {
    return (
      <Card className="h-full shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-success/10">
              <Shield className="h-4 w-4 text-success" />
            </div>
            All Clear
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Check className="h-10 w-10 text-success mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No active alerts. All patient health metrics are within normal ranges.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            Risk Alerts
          </CardTitle>
          <Badge variant="destructive" className="text-xs">
            {alerts?.length || 0}
          </Badge>
        </div>
        
        {/* Quick severity summary */}
        <div className="flex gap-2 mt-2">
          {alertCounts.critical > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-destructive/10 text-xs">
              <span className="w-2 h-2 rounded-full bg-destructive" />
              <span className="text-destructive font-medium">{alertCounts.critical}</span>
            </div>
          )}
          {alertCounts.warning > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-warning/10 text-xs">
              <span className="w-2 h-2 rounded-full bg-warning" />
              <span className="text-warning font-medium">{alertCounts.warning}</span>
            </div>
          )}
          {alertCounts.info > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-xs">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-primary font-medium">{alertCounts.info}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[240px]">
          <div className="p-4 pt-2 space-y-2">
            {sortedAlerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "p-2.5 rounded-lg border transition-all hover:shadow-sm",
                  alert.severity === 'critical' && "border-destructive/30 bg-destructive/5",
                  alert.severity === 'warning' && "border-warning/30 bg-warning/5",
                  alert.severity === 'info' && "border-primary/30 bg-primary/5"
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">{getSeverityIcon(alert.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight line-clamp-1">{alert.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {alert.description}
                    </p>
                    {alert.patients && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs mt-1"
                        onClick={() => navigate(`/patients?search=${alert.patients?.nhs_number}`)}
                      >
                        View Patient →
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => acknowledgeAlert.mutate(alert.id)}
                    disabled={acknowledgeAlert.isPending}
                    title="Acknowledge"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        {showViewAll && alerts && alerts.length > maxItems && (
          <div className="p-2 border-t">
            <Button variant="ghost" size="sm" className="w-full text-xs">
              View All Alerts
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}