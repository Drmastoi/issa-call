import { FileText, Target, TrendingUp, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboardInsights } from "@/hooks/useHealthAlerts";
import { QOF_INDICATORS, calculateQOFProgress } from "@/lib/qof-codes";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export function QOFProgressPanel() {
  const { data: insights, isLoading } = useDashboardInsights();
  const navigate = useNavigate();

  const getCoverageData = (indicatorId: string) => {
    if (!insights) return { recorded: 0, total: 0 };
    
    switch (indicatorId) {
      case 'hypertension_monitoring':
        return insights.bp_coverage;
      case 'smoking_status':
      case 'smoking_cessation':
        return insights.smoking_coverage;
      case 'bmi_recording':
        return insights.bmi_coverage;
      case 'alcohol_screening':
        return insights.bmi_coverage; // Using same as proxy for now
      default:
        return { recorded: 0, total: 0 };
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">QOF Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-2 bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate overall QOF score
  const overallScore = QOF_INDICATORS.reduce((acc, indicator) => {
    const coverage = getCoverageData(indicator.id);
    const { pointsEarned } = calculateQOFProgress(indicator, coverage.recorded, coverage.total);
    return acc + pointsEarned;
  }, 0) / QOF_INDICATORS.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            QOF Indicators
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/qof-reports')}
          >
            <FileText className="h-4 w-4 mr-1" />
            Reports
          </Button>
        </div>
        {/* Overall score */}
        <div className="flex items-center gap-3 mt-2 p-2 rounded-md bg-muted/50">
          <TrendingUp className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Overall QOF Score</p>
            <p className="text-lg font-bold">{Math.round(overallScore)}%</p>
          </div>
          <Badge variant={overallScore >= 75 ? 'default' : overallScore >= 50 ? 'secondary' : 'destructive'}>
            {overallScore >= 75 ? 'On Target' : overallScore >= 50 ? 'Needs Work' : 'Below Target'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <TooltipProvider>
          {QOF_INDICATORS.slice(0, 4).map((indicator) => {
            const coverage = getCoverageData(indicator.id);
            const { percent, status } = calculateQOFProgress(indicator, coverage.recorded, coverage.total);
            
            return (
              <Tooltip key={indicator.id}>
                <TooltipTrigger asChild>
                  <div className="space-y-1.5 cursor-help">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{indicator.name}</span>
                        <Badge variant="outline" className="text-xs font-mono">
                          {indicator.readCode}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {coverage.recorded}/{coverage.total}
                        </span>
                        <Badge 
                          variant={status === 'good' ? 'default' : status === 'warning' ? 'secondary' : 'destructive'}
                          className="min-w-[3rem] justify-center"
                        >
                          {percent}%
                        </Badge>
                      </div>
                    </div>
                    <div className="relative">
                      <Progress 
                        value={percent} 
                        className={cn(
                          "h-2",
                          status === 'good' && "[&>div]:bg-green-500",
                          status === 'warning' && "[&>div]:bg-yellow-500",
                          status === 'poor' && "[&>div]:bg-red-500"
                        )}
                      />
                      {/* Target line indicator */}
                      <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-foreground/30"
                        style={{ left: `${indicator.targetPercent}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Target: {indicator.targetPercent}%
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="font-medium">{indicator.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{indicator.description}</p>
                  <p className="text-xs mt-2">
                    <span className="font-mono">SNOMED: {indicator.snomedCode}</span>
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>

        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={() => navigate('/qof-reports')}
        >
          <Download className="h-4 w-4 mr-2" />
          Export QOF Report
        </Button>
      </CardContent>
    </Card>
  );
}
