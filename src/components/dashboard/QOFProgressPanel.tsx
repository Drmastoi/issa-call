import { FileText, Target, TrendingUp, ChartBar } from "lucide-react";
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
      <Card className="h-full">
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
    <Card className="h-full shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Target className="h-4 w-4 text-primary" />
            </div>
            QOF Progress
          </CardTitle>
        </div>
        {/* Overall score - Compact */}
        <div className="flex items-center justify-between mt-3 p-2.5 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Overall Score</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{Math.round(overallScore)}%</span>
            <Badge 
              variant={overallScore >= 75 ? 'default' : overallScore >= 50 ? 'secondary' : 'destructive'}
              className="text-xs"
            >
              {overallScore >= 75 ? 'On Track' : overallScore >= 50 ? 'Needs Work' : 'Below'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <TooltipProvider>
          {displayIndicators.slice(0, 3).map((indicator) => {
            const coverage = getCoverageData(indicator.id);
            const { percent, status } = calculateProgress(coverage.recorded, coverage.total, indicator.targetPercent);
            
            return (
              <Tooltip key={indicator.id}>
                <TooltipTrigger asChild>
                  <div className="space-y-1.5 cursor-help p-2 rounded-lg hover:bg-muted/50 transition-colors -mx-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs truncate max-w-[100px]">{indicator.name}</span>
                        <Badge variant="outline" className="text-[10px] font-mono px-1">
                          {indicator.code}
                        </Badge>
                      </div>
                      <Badge 
                        variant={status === 'good' ? 'default' : status === 'warning' ? 'secondary' : 'destructive'}
                        className="text-xs min-w-[2.5rem] justify-center"
                      >
                        {percent}%
                      </Badge>
                    </div>
                    <div className="relative">
                      <Progress 
                        value={percent} 
                        className={cn(
                          "h-1.5",
                          status === 'good' && "[&>div]:bg-success",
                          status === 'warning' && "[&>div]:bg-warning",
                          status === 'poor' && "[&>div]:bg-destructive"
                        )}
                      />
                      {/* Target line indicator */}
                      <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-foreground/30"
                        style={{ left: `${indicator.targetPercent}%` }}
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="font-medium">{indicator.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{indicator.description}</p>
                  <p className="text-xs mt-1">Target: {indicator.targetPercent}% | Current: {coverage.recorded}/{coverage.total}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>

        <Button 
          variant="outline" 
          size="sm" 
          className="w-full mt-2"
          onClick={() => navigate('/ai-analytics')}
        >
          <ChartBar className="h-4 w-4 mr-2" />
          View Analytics
        </Button>
      </CardContent>
    </Card>
  );
}