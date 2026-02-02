import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ListChecks,
  Brain,
  User,
  Calendar,
  Check,
  Target,
  Heart,
  Activity,
  RefreshCw,
  AlertTriangle,
  Shield,
  FileText,
  Stethoscope
} from 'lucide-react';
import { format, isBefore, addDays } from 'date-fns';
import { 
  analyzeAllPatients, 
  getClinicalActionStats, 
  ClinicalAction,
  Patient,
  CallResponse
} from '@/lib/clinical-analysis';

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  patient_id: string | null;
  patients?: { id: string; name: string } | null;
}

export default function AITasks() {
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState<'actions' | 'completed'>('actions');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'QOF' | 'NICE' | 'KPI' | 'Safety'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch all patients with clinical data
  const { data: patients = [], isLoading: patientsLoading, refetch: refetchPatients } = useQuery({
    queryKey: ['clinical-patients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, nhs_number, phone_number, date_of_birth, conditions, medications, hba1c_mmol_mol, hba1c_date, cholesterol_ldl, cholesterol_hdl, cholesterol_date, frailty_status, last_review_date, cha2ds2_vasc_score')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Patient[];
    },
    refetchInterval: 60000, // Auto-refresh every 60 seconds
  });

  // Fetch call responses for BP and other metrics
  const { data: callResponses = [], refetch: refetchResponses } = useQuery({
    queryKey: ['clinical-responses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_responses')
        .select('id, patient_id, blood_pressure_systolic, blood_pressure_diastolic, smoking_status, collected_at, weight_kg, height_cm')
        .order('collected_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CallResponse[];
    },
    refetchInterval: 60000,
  });

  // Fetch completed tasks
  const { data: completedTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['completed-clinical-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meditask_tasks')
        .select(`id, title, description, priority, status, due_date, patient_id, patients (id, name)`)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  // Analyze all patients to generate clinical actions
  const clinicalActions = analyzeAllPatients(patients, callResponses);
  const stats = getClinicalActionStats(clinicalActions);

  // Filter actions
  const filteredActions = clinicalActions.filter(action => {
    if (categoryFilter !== 'all' && action.category !== categoryFilter) return false;
    if (priorityFilter !== 'all' && action.priority !== priorityFilter) return false;
    return true;
  });

  // Mark action as complete (create task with completed status)
  const completeActionMutation = useMutation({
    mutationFn: async (action: ClinicalAction) => {
      const { error } = await supabase.from('meditask_tasks').insert({
        title: `[${action.code}] ${action.title}`,
        description: `${action.patient.name} - ${action.reason}. Action: ${action.actionRequired}`,
        priority: action.priority === 'critical' ? 'urgent' : action.priority,
        status: 'completed',
        patient_id: action.patient.id,
        completed_at: new Date().toISOString(),
        due_date: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['completed-clinical-tasks'] });
      toast.success('Action marked as completed in EHR');
    },
    onError: () => toast.error('Failed to mark action complete'),
  });

  // Refresh all data
  const refreshData = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchPatients(), refetchResponses()]);
    setIsRefreshing(false);
    toast.success('Clinical data refreshed');
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'urgent': case 'high': return 'bg-orange-500 text-white';
      case 'medium': case 'normal': return 'bg-warning text-warning-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'QOF': return <Target className="h-4 w-4" />;
      case 'NICE': return <FileText className="h-4 w-4" />;
      case 'KPI': return <Activity className="h-4 w-4" />;
      case 'Safety': return <Shield className="h-4 w-4" />;
      default: return <Stethoscope className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'QOF': return 'bg-primary/10 text-primary border-primary/30';
      case 'NICE': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      case 'KPI': return 'bg-green-500/10 text-green-600 border-green-500/30';
      case 'Safety': return 'bg-destructive/10 text-destructive border-destructive/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Clinical Actions
          </h1>
          <p className="text-muted-foreground">QOF, NICE Guidelines & KPI-driven patient care tasks</p>
        </div>
        <Button 
          onClick={refreshData} 
          disabled={isRefreshing} 
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Analysis
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setPriorityFilter('all'); setCategoryFilter('all'); }}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Actions</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-destructive/30" onClick={() => setPriorityFilter('critical')}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.critical}</p>
            <p className="text-xs text-muted-foreground">Critical</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-orange-500/30" onClick={() => setPriorityFilter('high')}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{stats.high}</p>
            <p className="text-xs text-muted-foreground">High Priority</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-primary/30" onClick={() => setCategoryFilter('QOF')}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.byCategory.QOF}</p>
            <p className="text-xs text-muted-foreground">QOF Actions</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-blue-500/30" onClick={() => setCategoryFilter('NICE')}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.byCategory.NICE}</p>
            <p className="text-xs text-muted-foreground">NICE Guidelines</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-red-500/30" onClick={() => setCategoryFilter('Safety')}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.byCategory.Safety}</p>
            <p className="text-xs text-muted-foreground">Safety Alerts</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Category:</span>
              <div className="flex gap-1">
                {(['all', 'QOF', 'NICE', 'KPI', 'Safety'] as const).map(cat => (
                  <Button 
                    key={cat}
                    size="sm"
                    variant={categoryFilter === cat ? 'default' : 'outline'}
                    onClick={() => setCategoryFilter(cat)}
                    className="text-xs"
                  >
                    {cat === 'all' ? 'All' : cat}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Priority:</span>
              <div className="flex gap-1">
                {(['all', 'critical', 'high', 'medium', 'low'] as const).map(pri => (
                  <Button 
                    key={pri}
                    size="sm"
                    variant={priorityFilter === pri ? 'default' : 'outline'}
                    onClick={() => setPriorityFilter(pri)}
                    className="text-xs capitalize"
                  >
                    {pri === 'all' ? 'All' : pri}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'actions' | 'completed')}>
        <TabsList className="mb-4">
          <TabsTrigger value="actions" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Pending Actions ({filteredActions.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Completed ({completedTasks.length})
          </TabsTrigger>
        </TabsList>

        {/* Actions Tab */}
        <TabsContent value="actions">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Heart className="h-5 w-5 text-destructive" />
                Clinical Actions Required
              </CardTitle>
              <CardDescription>
                Patient care actions based on QOF indicators, NICE guidelines, and KPIs. Mark complete after actioning in EHR.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {patientsLoading ? (
                  <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
                ) : filteredActions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-success/50 mb-3" />
                    <p className="text-muted-foreground">No pending clinical actions</p>
                    <p className="text-sm text-muted-foreground">All patients meeting targets!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredActions.map((action) => (
                      <div 
                        key={action.id} 
                        className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={getPriorityColor(action.priority)}>
                              {action.priority}
                            </Badge>
                            <Badge variant="outline" className={getCategoryColor(action.category)}>
                              <span className="flex items-center gap-1">
                                {getCategoryIcon(action.category)}
                                {action.category}
                              </span>
                            </Badge>
                            <Badge variant="secondary">{action.code}</Badge>
                            {action.dueWithin && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Due: {action.dueWithin}
                              </span>
                            )}
                          </div>
                          
                          <div>
                            <h4 className="font-semibold">{action.title}</h4>
                            <p className="text-sm font-medium text-primary flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {action.patient.name}
                              {action.patient.nhs_number && (
                                <span className="text-muted-foreground ml-2">
                                  NHS: {action.patient.nhs_number}
                                </span>
                              )}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">
                              <strong>Reason:</strong> {action.reason}
                            </p>
                            <p className="text-sm bg-primary/10 text-primary p-2 rounded">
                              <strong>Action:</strong> {action.actionRequired}
                            </p>
                          </div>
                        </div>
                        
                        <Button 
                          onClick={() => completeActionMutation.mutate(action)}
                          disabled={completeActionMutation.isPending}
                          className="gap-2 shrink-0"
                        >
                          <Check className="h-4 w-4" />
                          Done in EHR
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Completed Tab */}
        <TabsContent value="completed">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Completed Actions
              </CardTitle>
              <CardDescription>Actions that have been completed in the EHR</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {tasksLoading ? (
                  <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
                ) : completedTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ListChecks className="h-12 w-12 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No completed actions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {completedTasks.map((task) => (
                      <div 
                        key={task.id} 
                        className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-muted/50"
                      >
                        <div className="flex items-start gap-3 flex-1">
                          <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium line-through opacity-70">{task.title}</h4>
                              <Badge variant="outline" className="text-xs">{task.priority}</Badge>
                            </div>
                            {task.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {task.patients?.name && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />{task.patients.name}
                                </span>
                              )}
                              {task.due_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(task.due_date), 'dd MMM yyyy')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
