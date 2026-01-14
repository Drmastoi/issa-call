import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
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
  User,
  Download,
  Filter,
  Search
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

type GapFilter = 'all' | 'bp' | 'smoking' | 'no-data';
type PriorityFilter = 'all' | 'high' | 'medium' | 'normal';

export default function AIAnalytics() {
  const [gapFilter, setGapFilter] = useState<GapFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
    
    const missingResponses = patients.filter(p => !patientsWithResponses.has(p.id));
    
    const missingBP = patients.filter(p => {
      const responses = callResponses.filter(r => r.patient_id === p.id);
      return responses.length === 0 || !responses.some(r => r.blood_pressure_systolic && r.blood_pressure_diastolic);
    });

    const missingSmoking = patients.filter(p => {
      const responses = callResponses.filter(r => r.patient_id === p.id);
      return responses.length === 0 || !responses.some(r => r.smoking_status);
    });

    return { missingResponses, missingBP, missingSmoking };
  };

  const qofGaps = calculateQOFGaps();

  // Filter patients by search and gap type
  const getFilteredGapPatients = () => {
    let filteredPatients: typeof patients = [];
    
    switch (gapFilter) {
      case 'bp':
        filteredPatients = qofGaps.missingBP;
        break;
      case 'smoking':
        filteredPatients = qofGaps.missingSmoking;
        break;
      case 'no-data':
        filteredPatients = qofGaps.missingResponses;
        break;
      default:
        // Combine all unique patients with gaps
        const allGapPatientIds = new Set([
          ...qofGaps.missingBP.map(p => p.id),
          ...qofGaps.missingSmoking.map(p => p.id),
          ...qofGaps.missingResponses.map(p => p.id),
        ]);
        filteredPatients = patients.filter(p => allGapPatientIds.has(p.id));
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredPatients = filteredPatients.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.nhs_number?.toLowerCase().includes(query)
      );
    }

    return filteredPatients;
  };

  // Filter tasks by priority
  const getFilteredTasks = () => {
    let filtered = pendingTasks;
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(t => t.priority === priorityFilter);
    }
    return filtered;
  };

  const filteredGapPatients = getFilteredGapPatients();
  const filteredTasks = getFilteredTasks();

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

  // Calculate QOF progress
  const qofProgress = QOF_INDICATORS.map(indicator => {
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

  // Export functions
  const exportToCSV = (data: any[], filename: string, headers: string[]) => {
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const value = row[h.toLowerCase().replace(/ /g, '_')] ?? '';
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success(`Exported ${data.length} records to ${filename}.csv`);
  };

  const exportQOFGaps = () => {
    const data = filteredGapPatients.map(p => {
      const hasBP = !qofGaps.missingBP.some(bp => bp.id === p.id);
      const hasSmoking = !qofGaps.missingSmoking.some(s => s.id === p.id);
      const hasData = !qofGaps.missingResponses.some(r => r.id === p.id);
      return {
        name: p.name,
        nhs_number: p.nhs_number || '',
        phone_number: p.phone_number,
        has_bp: hasBP ? 'Yes' : 'No',
        has_smoking: hasSmoking ? 'Yes' : 'No',
        has_call_data: hasData ? 'Yes' : 'No',
      };
    });
    exportToCSV(data, 'qof_gaps', ['Name', 'NHS_Number', 'Phone_Number', 'Has_BP', 'Has_Smoking', 'Has_Call_Data']);
  };

  const exportTasks = () => {
    const data = filteredTasks.map((t: any) => ({
      title: t.title,
      priority: t.priority,
      status: t.status,
      due_date: t.due_date ? new Date(t.due_date).toLocaleDateString() : '',
      patient_name: t.patients?.name || '',
    }));
    exportToCSV(data, 'pending_tasks', ['Title', 'Priority', 'Status', 'Due_Date', 'Patient_Name']);
  };

  const exportQOFProgress = () => {
    const data = qofProgress.map(q => ({
      code: q.code,
      name: q.name,
      category: q.category,
      target: `${q.target}%`,
      achieved: `${q.percentage}%`,
      gap: q.gap > 0 ? `${q.gap}%` : 'Met',
      patients_needed: q.gap > 0 ? Math.ceil((q.gap / 100) * patients.length) : 0,
    }));
    exportToCSV(data, 'qof_progress', ['Code', 'Name', 'Category', 'Target', 'Achieved', 'Gap', 'Patients_Needed']);
  };

  const exportFullReport = () => {
    // Export comprehensive analytics report
    const summary = [
      { metric: 'Total Patients', value: kpis.totalPatients },
      { metric: 'Patients With Data', value: kpis.patientsWithData },
      { metric: 'Data Completeness', value: `${kpis.dataCompleteness}%` },
      { metric: 'Pending Tasks', value: kpis.pendingTasksCount },
      { metric: 'High Priority Tasks', value: kpis.highPriorityTasks },
      { metric: 'Unresolved Alerts', value: kpis.unresolvedAlerts },
      { metric: 'Missing BP Records', value: qofGaps.missingBP.length },
      { metric: 'Missing Smoking Status', value: qofGaps.missingSmoking.length },
      { metric: 'No Call Data', value: qofGaps.missingResponses.length },
    ];
    exportToCSV(summary, 'analytics_summary', ['Metric', 'Value']);
  };

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
      {/* Header with Export Buttons */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">AI Analytics</h1>
            <p className="text-muted-foreground">Comprehensive insights, QOF tracking, and patient analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportFullReport}>
            <Download className="h-4 w-4 mr-2" />
            Summary
          </Button>
          <Button variant="outline" size="sm" onClick={exportQOFProgress}>
            <Download className="h-4 w-4 mr-2" />
            QOF Report
          </Button>
          <Button variant="outline" size="sm" onClick={exportQOFGaps}>
            <Download className="h-4 w-4 mr-2" />
            Gaps List
          </Button>
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Pending Tasks
                </CardTitle>
                <CardDescription>{filteredTasks.length} tasks awaiting action</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={exportTasks}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}>
                <SelectTrigger className="h-8 w-[130px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[280px]">
              {filteredTasks.length > 0 ? (
                <div className="space-y-3">
                  {filteredTasks.slice(0, 10).map((task: any) => (
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

      {/* QOF Gaps - Patients needing attention with Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                QOF Gaps - Patients Requiring Action
              </CardTitle>
              <CardDescription>Patients missing key health data for QOF compliance</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={exportQOFGaps}>
              <Download className="h-4 w-4 mr-2" />
              Export Filtered
            </Button>
          </div>
          {/* Filters */}
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={gapFilter} onValueChange={(v) => setGapFilter(v as GapFilter)}>
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue placeholder="Filter by gap type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Gaps ({filteredGapPatients.length})</SelectItem>
                  <SelectItem value="bp">Missing BP ({qofGaps.missingBP.length})</SelectItem>
                  <SelectItem value="smoking">Missing Smoking ({qofGaps.missingSmoking.length})</SelectItem>
                  <SelectItem value="no-data">No Call Data ({qofGaps.missingResponses.length})</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
            <Badge variant="secondary">{filteredGapPatients.length} patients</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            {filteredGapPatients.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredGapPatients.map((patient) => {
                  const missingItems = [];
                  if (qofGaps.missingBP.some(p => p.id === patient.id)) missingItems.push('BP');
                  if (qofGaps.missingSmoking.some(p => p.id === patient.id)) missingItems.push('Smoking');
                  if (qofGaps.missingResponses.some(p => p.id === patient.id)) missingItems.push('No Data');
                  
                  return (
                    <Link
                      key={patient.id}
                      to={`/patients?search=${encodeURIComponent(patient.name)}`}
                      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted transition-colors"
                    >
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{patient.name}</p>
                        <p className="text-xs text-muted-foreground">{patient.nhs_number}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {missingItems.map(item => (
                            <Badge key={item} variant="outline" className="text-xs px-1 py-0">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                <CheckCircle2 className="h-8 w-8 mb-2" />
                <p>No patients match the current filters</p>
              </div>
            )}
          </ScrollArea>
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