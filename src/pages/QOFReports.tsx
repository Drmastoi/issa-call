import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Download, 
  FileSpreadsheet, 
  Target, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Activity
} from 'lucide-react';
import { QOF_INDICATORS, READ_CODE_MAPPINGS, calculateQOFProgress } from '@/lib/qof-codes';
import { cn } from '@/lib/utils';
import { useDashboardInsights } from '@/hooks/useHealthAlerts';

export default function QOFReports() {
  const [activeTab, setActiveTab] = useState('overview');
  const { data: insights, isLoading: insightsLoading } = useDashboardInsights();

  const { data: patientMetrics } = useQuery({
    queryKey: ['qof-patient-metrics'],
    queryFn: async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const { data: patients } = await supabase
        .from('patients')
        .select('id, name, nhs_number');

      const { data: responses } = await supabase
        .from('call_responses')
        .select('patient_id, blood_pressure_systolic, blood_pressure_diastolic, smoking_status, weight_kg, height_cm, alcohol_units_per_week, collected_at')
        .gte('collected_at', oneYearAgo.toISOString())
        .order('collected_at', { ascending: false });

      // Group responses by patient and get latest for each metric
      const patientData = patients?.map(patient => {
        const patientResponses = responses?.filter(r => r.patient_id === patient.id) || [];
        const latest = patientResponses[0];
        
        return {
          ...patient,
          bp_recorded: !!latest?.blood_pressure_systolic,
          bp_value: latest?.blood_pressure_systolic && latest?.blood_pressure_diastolic 
            ? `${latest.blood_pressure_systolic}/${latest.blood_pressure_diastolic}`
            : null,
          smoking_recorded: !!latest?.smoking_status,
          smoking_status: latest?.smoking_status,
          bmi_recorded: !!(latest?.weight_kg && latest?.height_cm),
          bmi_value: latest?.weight_kg && latest?.height_cm 
            ? (latest.weight_kg / Math.pow(latest.height_cm / 100, 2)).toFixed(1)
            : null,
          alcohol_recorded: latest?.alcohol_units_per_week !== null && latest?.alcohol_units_per_week !== undefined,
          alcohol_value: latest?.alcohol_units_per_week,
          last_check: latest?.collected_at
        };
      }) || [];

      return patientData;
    }
  });

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
        return insights.bmi_coverage;
      default:
        return { recorded: 0, total: 0 };
    }
  };

  const exportToCSV = () => {
    if (!patientMetrics) return;

    const headers = [
      'NHS Number',
      'Patient Name',
      'BP Read Code',
      'BP Value',
      'Smoking Read Code',
      'Smoking Status',
      'BMI Read Code',
      'BMI Value',
      'Alcohol Read Code',
      'Alcohol Units/Week',
      'Last Check Date'
    ];

    const rows = patientMetrics.map(p => [
      p.nhs_number || '',
      p.name || '',
      p.bp_recorded ? '246.' : '',
      p.bp_value || '',
      p.smoking_recorded ? '1375.' : '',
      p.smoking_status || '',
      p.bmi_recorded ? '22K..' : '',
      p.bmi_value || '',
      p.alcohol_recorded ? '136..' : '',
      p.alcohol_value?.toString() || '',
      p.last_check ? new Date(p.last_check).toLocaleDateString('en-GB') : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `qof_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const overallScore = QOF_INDICATORS.reduce((acc, indicator) => {
    const coverage = getCoverageData(indicator.id);
    const { pointsEarned } = calculateQOFProgress(indicator, coverage.recorded, coverage.total);
    return acc + pointsEarned;
  }, 0) / QOF_INDICATORS.length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">QOF Reports</h1>
          <p className="text-muted-foreground mt-1">Quality and Outcomes Framework tracking & reporting</p>
        </div>
        <Button onClick={exportToCSV} disabled={!patientMetrics?.length}>
          <Download className="h-4 w-4 mr-2" />
          Export EMIS CSV
        </Button>
      </div>

      {/* Overall Score Card */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Target className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overall QOF Score</p>
                <p className="text-4xl font-bold">{Math.round(overallScore)}%</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500">{insights?.bp_coverage.recorded || 0}</p>
                <p className="text-xs text-muted-foreground">BP Recorded</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-500">{insights?.smoking_coverage.recorded || 0}</p>
                <p className="text-xs text-muted-foreground">Smoking Recorded</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-500">{insights?.bmi_coverage.recorded || 0}</p>
                <p className="text-xs text-muted-foreground">BMI Recorded</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Indicator Overview</TabsTrigger>
          <TabsTrigger value="patients">Patient Details</TabsTrigger>
          <TabsTrigger value="codes">Read Code Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {QOF_INDICATORS.map((indicator) => {
              const coverage = getCoverageData(indicator.id);
              const { percent, status, pointsEarned } = calculateQOFProgress(indicator, coverage.recorded, coverage.total);
              
              return (
                <Card key={indicator.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{indicator.name}</CardTitle>
                        <CardDescription className="mt-1">{indicator.description}</CardDescription>
                      </div>
                      <Badge 
                        variant={status === 'good' ? 'default' : status === 'warning' ? 'secondary' : 'destructive'}
                      >
                        {status === 'good' ? <CheckCircle className="h-3 w-3 mr-1" /> : 
                         status === 'warning' ? <AlertTriangle className="h-3 w-3 mr-1" /> :
                         <AlertTriangle className="h-3 w-3 mr-1" />}
                        {percent}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="relative">
                        <Progress 
                          value={percent} 
                          className={cn(
                            "h-3",
                            status === 'good' && "[&>div]:bg-green-500",
                            status === 'warning' && "[&>div]:bg-yellow-500",
                            status === 'poor' && "[&>div]:bg-red-500"
                          )}
                        />
                        <div 
                          className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
                          style={{ left: `${indicator.targetPercent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {coverage.recorded} of {coverage.total} patients
                        </span>
                        <span className="font-medium">
                          Target: {indicator.targetPercent}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="font-mono">{indicator.readCode}</Badge>
                        <span>SNOMED: {indicator.snomedCode}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="patients">
          <Card>
            <CardHeader>
              <CardTitle>Patient QOF Status</CardTitle>
              <CardDescription>Individual patient recording status for QOF indicators</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NHS Number</TableHead>
                    <TableHead>Patient Name</TableHead>
                    <TableHead className="text-center">BP</TableHead>
                    <TableHead className="text-center">Smoking</TableHead>
                    <TableHead className="text-center">BMI</TableHead>
                    <TableHead className="text-center">Alcohol</TableHead>
                    <TableHead>Last Check</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patientMetrics?.slice(0, 50).map((patient) => (
                    <TableRow key={patient.id}>
                      <TableCell className="font-mono text-sm">{patient.nhs_number || '-'}</TableCell>
                      <TableCell className="font-medium">{patient.name}</TableCell>
                      <TableCell className="text-center">
                        {patient.bp_recorded ? (
                          <Badge variant="default" className="bg-green-500">{patient.bp_value}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Missing</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {patient.smoking_recorded ? (
                          <Badge variant="default" className="bg-blue-500">{patient.smoking_status}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Missing</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {patient.bmi_recorded ? (
                          <Badge variant="default" className="bg-purple-500">{patient.bmi_value}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Missing</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {patient.alcohol_recorded ? (
                          <Badge variant="default" className="bg-orange-500">{patient.alcohol_value}u</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Missing</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {patient.last_check 
                          ? new Date(patient.last_check).toLocaleDateString('en-GB') 
                          : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {patientMetrics && patientMetrics.length > 50 && (
                <p className="text-sm text-muted-foreground text-center mt-4">
                  Showing 50 of {patientMetrics.length} patients
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="codes">
          <Card>
            <CardHeader>
              <CardTitle>Read Code Reference</CardTitle>
              <CardDescription>Standard read codes for EMIS Web integration</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric Type</TableHead>
                    <TableHead>Read Code</TableHead>
                    <TableHead>SNOMED Code</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {READ_CODE_MAPPINGS.map((mapping) => (
                    <TableRow key={mapping.metricType}>
                      <TableCell className="font-medium capitalize">
                        {mapping.metricType.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{mapping.readCode}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{mapping.snomedCode}</TableCell>
                      <TableCell className="text-muted-foreground">{mapping.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
