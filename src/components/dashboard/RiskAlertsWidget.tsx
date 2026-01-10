import { AlertTriangle, AlertCircle, Info, Check, ChevronRight } from "lucide-react";
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

  const getSeverityIcon = (severity: HealthAlert['severity']) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Risk Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!sortedAlerts || sortedAlerts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" />
            No Active Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All patient health metrics are within normal ranges.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Risk Alerts
            <Badge variant="destructive" className="ml-1">
              {alerts?.length || 0}
            </Badge>
          </CardTitle>
          {showViewAll && alerts && alerts.length > maxItems && (
            <Button variant="ghost" size="sm" className="text-xs">
              View All
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px]">
          <div className="p-4 pt-0 space-y-2">
            {sortedAlerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "p-3 rounded-lg border transition-colors",
                  alert.severity === 'critical' && "border-destructive/30 bg-destructive/5",
                  alert.severity === 'warning' && "border-yellow-500/30 bg-yellow-500/5",
                  alert.severity === 'info' && "border-blue-500/30 bg-blue-500/5"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getSeverityIcon(alert.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getSeverityBadge(alert.severity)} className="text-xs capitalize">
                        {alert.severity}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {alert.alert_type.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium leading-tight">{alert.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
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
                    className="h-7 w-7 shrink-0"
                    onClick={() => acknowledgeAlert.mutate(alert.id)}
                    disabled={acknowledgeAlert.isPending}
                    title="Acknowledge"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
