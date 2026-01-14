import { FileText, Target, TrendingUp, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboardInsights } from "@/hooks/useHealthAlerts";
import { QOF_INDICATORS } from "@/lib/qof-codes";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface CoverageData {
  recorded: number;
  total: number;
}

function calculateProgress(recorded: number, total: number, targetPercent: number) {
  const percent = total > 0 ? Math.round((recorded / total) * 100) : 0;
  const status = percent >= targetPercent ? 'good' : percent >= targetPercent * 0.8 ? 'warning' : 'poor';
  const pointsEarned = Math.min(percent, targetPercent);
  return { percent, status, pointsEarned };
}

export function QOFProgressPanel() {
  const { data: insights, isLoading } = useDashboardInsights();
  const navigate = useNavigate();

  // Map QOF indicator IDs to coverage data
  const getCoverageData = (indicatorId: string): CoverageData => {
    if (!insights) return { recorded: 0, total: 0 };
    
    // Map indicator IDs to actual coverage data
    switch (indicatorId) {
      case 'hyp008':
      case 'hyp009':
      case 'chd015':
      case 'chd016':
      case 'stia014':
      case 'stia015':
      case 'dm036':
        return insights.bp_coverage;
      case 'smok002':
        return insights.smoking_coverage;
      case 'dm006':
      case 'dm012':
        return insights.bmi_coverage; // Using as proxy for HbA1c
      default:
        return { recorded: 0, total: 0 };
    }
  };

  // Select key indicators to display
  const displayIndicators = QOF_INDICATORS.filter(i => 
    ['hyp008', 'smok002', 'dm006', 'chol003'].includes(i.id)
  );

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

  // Calculate overall QOF score based on available data
  const coverageMetrics = [
    { ...insights?.bp_coverage, target: 77 },
    { ...insights?.smoking_coverage, target: 90 },
    { ...insights?.bmi_coverage, target: 70 },
  ].filter(m => m && m.total > 0);

  const overallScore = coverageMetrics.length > 0
    ? coverageMetrics.reduce((acc, metric) => {
        const percent = metric.total > 0 ? (metric.recorded / metric.total) * 100 : 0;
        return acc + Math.min(percent, metric.target);
      }, 0) / coverageMetrics.length
    : 0;

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
            onClick={() => navigate('/ai-analytics')}
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
          {displayIndicators.map((indicator) => {
            const coverage = getCoverageData(indicator.id);
            const { percent, status } = calculateProgress(coverage.recorded, coverage.total, indicator.targetPercent);
            
            return (
              <Tooltip key={indicator.id}>
                <TooltipTrigger asChild>
                  <div className="space-y-1.5 cursor-help">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate max-w-[120px]">{indicator.name}</span>
                        <Badge variant="outline" className="text-xs font-mono">
                          {indicator.code}
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
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>

        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={() => navigate('/ai-analytics')}
        >
          <Download className="h-4 w-4 mr-2" />
          View Full QOF Analytics
        </Button>
      </CardContent>
    </Card>
  );
}