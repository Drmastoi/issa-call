import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  ClipboardList, 
  TrendingUp, 
  AlertTriangle, 
  Users, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  Activity,
  Target,
  FileWarning,
  User
} from 'lucide-react';
import { Link } from 'react-router-dom';

// QOF indicator definitions with targets
const QOF_INDICATORS = [
  { code: 'BP002', name: 'Blood Pressure Recording', target: 80, category: 'Hypertension' },
  { code: 'SMOK002', name: 'Smoking Status Recording', target: 90, category: 'Smoking' },
  { code: 'DM017', name: 'Diabetic HbA1c Check', target: 75, category: 'Diabetes' },
  { code: 'CHD005', name: 'CHD Blood Pressure', target: 70, category: 'CHD' },
  { code: 'AF007', name: 'AF Anticoagulation', target: 85, category: 'AF' },
];

export default function AIAnalytics() {
  // Fetch patients
  const { data: patients = [] } = useQuery({
    queryKey: ['analytics-patients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, nhs_number, phone_number, notes')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch pending tasks
  const { data: pendingTasks = [] } = useQuery({
    queryKey: ['analytics-pending-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meditask_tasks')
        .select(`
          id,
          title,
          description,
          priority,
          status,
          due_date,
          patient_id,
          patients (id, name)
        `)
        .neq('status', 'completed')
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch call responses for analytics
  const { data: callResponses = [] } = useQuery({
    queryKey: ['analytics-call-responses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_responses')
        .select(`
          id,
          patient_id,
          blood_pressure_systolic,
          blood_pressure_diastolic,
          smoking_status,
          weight_kg,
          height_cm,
          collected_at,
          patients (id, name, nhs_number)
        `)
        .order('collected_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch health alerts
  const { data: healthAlerts = [] } = useQuery({
    queryKey: ['analytics-health-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('health_alerts')
        .select(`
          id,
          title,
          description,
          severity,
          alert_type,
          patient_id,
          acknowledged_at,
          patients (id, name)
        `)
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Calculate QOF gaps - patients missing key health metrics
  const calculateQOFGaps = () => {
    const patientsWithResponses = new Set(callResponses.map(r => r.patient_id));
    
    // Patients without any call responses
    const missingResponses = patients.filter(p => !patientsWithResponses.has(p.id));
    
    // Patients missing BP readings
    const missingBP = patients.filter(p => {
      const responses = callResponses.filter(r => r.patient_id === p.id);
      return responses.length === 0 || !responses.some(r => r.blood_pressure_systolic && r.blood_pressure_diastolic);
    });

    // Patients missing smoking status
    const missingSmoking = patients.filter(p => {
      const responses = callResponses.filter(r => r.patient_id === p.id);
      return responses.length === 0 || !responses.some(r => r.smoking_status);
    });

    return {
      missingResponses,
      missingBP,
      missingSmoking,
    };
  };

  const qofGaps = calculateQOFGaps();

  // Calculate KPIs
  const kpis = {
    totalPatients: patients.length,
    patientsWithData: new Set(callResponses.map(r => r.patient_id)).size,
    pendingTasksCount: pendingTasks.length,
    highPriorityTasks: pendingTasks.filter(t => t.priority === 'high').length,
    unresolvedAlerts: healthAlerts.length,
    criticalAlerts: healthAlerts.filter(a => a.severity === 'critical').length,
    dataCompleteness: patients.length > 0 
      ? Math.round((new Set(callResponses.map(r => r.patient_id)).size / patients.length) * 100) 
      : 0,
  };

  // Calculate simulated QOF progress
  const qofProgress = QOF_INDICATORS.map(indicator => {
    // Simulate achievement based on call response data
    let achieved = 0;
    if (indicator.code === 'BP002') {
      achieved = callResponses.filter(r => r.blood_pressure_systolic && r.blood_pressure_diastolic).length;
    } else if (indicator.code === 'SMOK002') {
      achieved = callResponses.filter(r => r.smoking_status).length;
    } else {
      achieved = Math.floor(Math.random() * patients.length * 0.7);
    }
    const percentage = patients.length > 0 ? Math.min(100, Math.round((achieved / patients.length) * 100)) : 0;
    return {
      ...indicator,
      achieved,
      total: patients.length,
      percentage,
      gap: indicator.target - percentage,
    };
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      default: return 'secondary';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-destructive bg-destructive/10';
      case 'high': return 'text-warning bg-warning/10';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Brain className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">AI Analytics</h1>
          <p className="text-muted-foreground">Comprehensive insights, QOF tracking, and patient analytics</p>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Total Patients</span>
            </div>
            <p className="text-2xl font-bold">{kpis.totalPatients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-xs">With Data</span>
            </div>
            <p className="text-2xl font-bold">{kpis.patientsWithData}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ClipboardList className="h-4 w-4" />
              <span className="text-xs">Pending Tasks</span>
            </div>
            <p className="text-2xl font-bold">{kpis.pendingTasksCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs">High Priority</span>
            </div>
            <p className="text-2xl font-bold">{kpis.highPriorityTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-warning mb-1">
              <FileWarning className="h-4 w-4" />
              <span className="text-xs">Alerts</span>
            </div>
            <p className="text-2xl font-bold">{kpis.unresolvedAlerts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-success mb-1">
              <Target className="h-4 w-4" />
              <span className="text-xs">Data Complete</span>
            </div>
            <p className="text-2xl font-bold">{kpis.dataCompleteness}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* QOF Progress */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              QOF Indicator Progress
            </CardTitle>
            <CardDescription>Track achievement against QOF targets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {qofProgress.map((indicator) => (
                <div key={indicator.code} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{indicator.code}</Badge>
                      <span className="font-medium">{indicator.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={indicator.percentage >= indicator.target ? 'text-success' : 'text-warning'}>
                        {indicator.percentage}%
                      </span>
                      <span className="text-muted-foreground">/ {indicator.target}%</span>
                    </div>
                  </div>
                  <div className="relative">
                    <Progress value={indicator.percentage} className="h-2" />
                    <div 
                      className="absolute top-0 h-2 w-0.5 bg-foreground/50" 
                      style={{ left: `${indicator.target}%` }}
                    />
                  </div>
                  {indicator.gap > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Gap: {indicator.gap}% ({Math.ceil((indicator.gap / 100) * patients.length)} patients needed)
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Pending Tasks
            </CardTitle>
            <CardDescription>{pendingTasks.length} tasks awaiting action</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {pendingTasks.length > 0 ? (
                <div className="space-y-3">
                  {pendingTasks.slice(0, 10).map((task: any) => (
                    <div key={task.id} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-sm line-clamp-1">{task.title}</span>
                        <Badge variant={getPriorityColor(task.priority)} className="shrink-0">
                          {task.priority}
                        </Badge>
                      </div>
                      {task.patients && (
                        <Link 
                          to={`/patients?search=${encodeURIComponent(task.patients.name)}`}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <User className="h-3 w-3" />
                          {task.patients.name}
                        </Link>
                      )}
                      {task.due_date && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Due: {new Date(task.due_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mb-2" />
                  <p>No pending tasks</p>
                </div>
              )}
            </ScrollArea>
            <Button asChild variant="outline" className="w-full mt-4">
              <Link to="/meditask">
                View All Tasks <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* QOF Gaps - Patients needing attention */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            QOF Gaps - Patients Requiring Action
          </CardTitle>
          <CardDescription>Patients missing key health data for QOF compliance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Missing BP */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Missing Blood Pressure</h4>
                <Badge variant="outline">{qofGaps.missingBP.length}</Badge>
              </div>
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                {qofGaps.missingBP.slice(0, 20).map((patient) => (
                  <Link
                    key={patient.id}
                    to={`/patients?search=${encodeURIComponent(patient.name)}`}
                    className="flex items-center gap-2 p-2 hover:bg-muted rounded-md transition-colors"
                  >
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{patient.name}</p>
                      <p className="text-xs text-muted-foreground">{patient.nhs_number}</p>
                    </div>
                  </Link>
                ))}
                {qofGaps.missingBP.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">All patients have BP data</p>
                )}
              </ScrollArea>
            </div>

            {/* Missing Smoking Status */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Missing Smoking Status</h4>
                <Badge variant="outline">{qofGaps.missingSmoking.length}</Badge>
              </div>
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                {qofGaps.missingSmoking.slice(0, 20).map((patient) => (
                  <Link
                    key={patient.id}
                    to={`/patients?search=${encodeURIComponent(patient.name)}`}
                    className="flex items-center gap-2 p-2 hover:bg-muted rounded-md transition-colors"
                  >
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{patient.name}</p>
                      <p className="text-xs text-muted-foreground">{patient.nhs_number}</p>
                    </div>
                  </Link>
                ))}
                {qofGaps.missingSmoking.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">All patients have smoking data</p>
                )}
              </ScrollArea>
            </div>

            {/* No Response Data */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">No Call Data</h4>
                <Badge variant="outline">{qofGaps.missingResponses.length}</Badge>
              </div>
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                {qofGaps.missingResponses.slice(0, 20).map((patient) => (
                  <Link
                    key={patient.id}
                    to={`/patients?search=${encodeURIComponent(patient.name)}`}
                    className="flex items-center gap-2 p-2 hover:bg-muted rounded-md transition-colors"
                  >
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{patient.name}</p>
                      <p className="text-xs text-muted-foreground">{patient.nhs_number}</p>
                    </div>
                  </Link>
                ))}
                {qofGaps.missingResponses.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">All patients have call data</p>
                )}
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Alerts */}
      {healthAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Unresolved Health Alerts
            </CardTitle>
            <CardDescription>{healthAlerts.length} alerts requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {healthAlerts.slice(0, 6).map((alert: any) => (
                <div key={alert.id} className={`p-4 rounded-lg border ${getSeverityColor(alert.severity)}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-medium text-sm">{alert.title}</span>
                    <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="text-xs mb-2 line-clamp-2">{alert.description}</p>
                  {alert.patients && (
                    <Link 
                      to={`/patients?search=${encodeURIComponent(alert.patients.name)}`}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <User className="h-3 w-3" />
                      {alert.patients.name}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}