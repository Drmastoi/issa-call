import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ShieldAlert, Activity, FileSearch, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface CoverageMetric {
  label: string;
  count: number;
  total: number;
  icon: typeof Activity;
  threshold: number; // percentage below which it's flagged
}

export function ClinicalSafetyWidget() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['clinical-safety-stats'],
    queryFn: async () => {
      const [patientsRes, responsesRes, tasksRes, alertsRes] = await Promise.all([
        supabase.from('patients').select('id, conditions, medications, hba1c_mmol_mol, hba1c_date, cholesterol_ldl, cholesterol_date, last_review_date, frailty_status, ai_extracted_at, date_of_birth'),
        supabase.from('call_responses').select('patient_id, blood_pressure_systolic, smoking_status, weight_kg, height_cm, collected_at').order('collected_at', { ascending: false }),
        supabase.from('meditask_tasks').select('id, status, priority').neq('status', 'completed'),
        supabase.from('health_alerts').select('id, severity').is('acknowledged_at', null),
      ]);

      const patients = patientsRes.data || [];
      const responses = responsesRes.data || [];
      const tasks = tasksRes.data || [];
      const alerts = alertsRes.data || [];

      const total = patients.length;
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      // Unique patients with recent responses
      const recentPatientIds = new Set(
        responses.filter(r => new Date(r.collected_at) > oneYearAgo).map(r => r.patient_id)
      );
      const bpRecorded = new Set(
        responses.filter(r => r.blood_pressure_systolic && new Date(r.collected_at) > oneYearAgo).map(r => r.patient_id)
      );
      const smokingRecorded = new Set(
        responses.filter(r => r.smoking_status && new Date(r.collected_at) > oneYearAgo).map(r => r.patient_id)
      );
      const bmiRecorded = new Set(
        responses.filter(r => r.weight_kg && r.height_cm && new Date(r.collected_at) > oneYearAgo).map(r => r.patient_id)
      );

      // Data quality
      const withConditions = patients.filter(p => p.conditions && p.conditions.length > 0).length;
      const withMedications = patients.filter(p => p.medications && p.medications.length > 0).length;
      const withExtraction = patients.filter(p => p.ai_extracted_at).length;
      const reviewedLastYear = patients.filter(p => p.last_review_date && new Date(p.last_review_date) > oneYearAgo).length;

      // Lab coverage
      const withHba1c = patients.filter(p => p.hba1c_mmol_mol).length;
      const withCholesterol = patients.filter(p => p.cholesterol_ldl).length;

      // Safety gaps
      const diabeticWithoutHba1c = patients.filter(p =>
        p.conditions?.some((c: string) => /diabetes|T[12]DM/i.test(c)) && !p.hba1c_mmol_mol
      ).length;
      const hypertensiveWithoutBP = patients.filter(p =>
        p.conditions?.some((c: string) => /hypertension/i.test(c)) && !bpRecorded.has(p.id)
      ).length;

      return {
        total,
        coverage: {
          bp: { count: bpRecorded.size, total },
          smoking: { count: smokingRecorded.size, total },
          bmi: { count: bmiRecorded.size, total },
          conditions: { count: withConditions, total },
          medications: { count: withMedications, total },
          extraction: { count: withExtraction, total },
          review: { count: reviewedLastYear, total },
          hba1c: { count: withHba1c, total },
          cholesterol: { count: withCholesterol, total },
        },
        gaps: {
          diabeticWithoutHba1c,
          hypertensiveWithoutBP,
          noExtraction: total - withExtraction,
          overdueReview: total - reviewedLastYear,
        },
        alerts: {
          critical: alerts.filter(a => a.severity === 'critical').length,
          warning: alerts.filter(a => a.severity === 'warning').length,
        },
        tasks: {
          urgent: tasks.filter(t => t.priority === 'urgent').length,
          high: tasks.filter(t => t.priority === 'high').length,
          total: tasks.length,
        },
      };
    },
    refetchInterval: 60000,
  });

  if (isLoading || !stats) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Clinical Safety
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-4 bg-muted rounded" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const coverageItems: CoverageMetric[] = [
    { label: 'BP Recorded', count: stats.coverage.bp.count, total: stats.total, icon: Activity, threshold: 70 },
    { label: 'Smoking Status', count: stats.coverage.smoking.count, total: stats.total, icon: Activity, threshold: 80 },
    { label: 'BMI Recorded', count: stats.coverage.bmi.count, total: stats.total, icon: Activity, threshold: 60 },
    { label: 'AI Extracted', count: stats.coverage.extraction.count, total: stats.total, icon: FileSearch, threshold: 50 },
    { label: 'Reviewed <12m', count: stats.coverage.review.count, total: stats.total, icon: Clock, threshold: 70 },
  ];

  const dataQualityScore = stats.total > 0
    ? Math.round(
        (stats.coverage.conditions.count + stats.coverage.medications.count + stats.coverage.extraction.count) /
        (stats.total * 3) * 100
      )
    : 0;

  return (
    <Card className="border-destructive/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          Clinical Safety Dashboard
          <Badge variant={dataQualityScore >= 70 ? 'default' : 'destructive'} className="ml-auto text-xs">
            Quality: {dataQualityScore}%
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Safety Gaps */}
        {(stats.gaps.diabeticWithoutHba1c > 0 || stats.gaps.hypertensiveWithoutBP > 0) && (
          <div className="space-y-1">
            {stats.gaps.diabeticWithoutHba1c > 0 && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" />
                <span>{stats.gaps.diabeticWithoutHba1c} diabetic patients without HbA1c</span>
              </div>
            )}
            {stats.gaps.hypertensiveWithoutBP > 0 && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" />
                <span>{stats.gaps.hypertensiveWithoutBP} hypertensive patients without BP</span>
              </div>
            )}
          </div>
        )}

        {/* Coverage Metrics */}
        <div className="space-y-2">
          {coverageItems.map((item) => {
            const pct = item.total > 0 ? Math.round(item.count / item.total * 100) : 0;
            const isLow = pct < item.threshold;
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className={isLow ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                    {item.label}
                  </span>
                  <span className="text-muted-foreground">{item.count}/{item.total} ({pct}%)</span>
                </div>
                <Progress value={pct} className={`h-1.5 ${isLow ? '[&>div]:bg-destructive' : ''}`} />
              </div>
            );
          })}
        </div>

        {/* Alert Summary */}
        <div className="flex gap-2 pt-1">
          {stats.alerts.critical > 0 && (
            <Badge variant="destructive" className="text-xs">
              {stats.alerts.critical} Critical
            </Badge>
          )}
          {stats.alerts.warning > 0 && (
            <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">
              {stats.alerts.warning} Warnings
            </Badge>
          )}
          {stats.tasks.urgent > 0 && (
            <Badge variant="outline" className="text-xs border-red-300 text-red-600">
              {stats.tasks.urgent} Urgent Tasks
            </Badge>
          )}
          {stats.alerts.critical === 0 && stats.alerts.warning === 0 && stats.tasks.urgent === 0 && (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="h-3 w-3" /> No urgent safety concerns
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
