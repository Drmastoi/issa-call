import { useState } from 'react';
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
  Sparkles, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ListChecks,
  ArrowRight,
  Brain,
  Zap,
  User,
  Calendar,
  Loader2,
  Check,
  Target,
  Heart,
  Activity
} from 'lucide-react';
import { format, isBefore, addDays, differenceInYears, parseISO } from 'date-fns';
import { QOF_INDICATORS, QOFIndicator } from '@/lib/qof-codes';

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

interface AISuggestion {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: string;
  patient_reference?: string;
  reasoning: string;
}

interface Patient {
  id: string;
  name: string;
  nhs_number: string | null;
  phone_number: string;
  date_of_birth: string | null;
  conditions: string[] | null;
  medications: string[] | null;
  hba1c_mmol_mol: number | null;
  cholesterol_ldl: number | null;
  frailty_status: string | null;
  last_review_date: string | null;
  cha2ds2_vasc_score: number | null;
}

interface QOFAction {
  patient: Patient;
  indicator: QOFIndicator;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  actionRequired: string;
}

export default function AITasks() {
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState<'tasks' | 'qof'>('tasks');
  const [taskFilter, setTaskFilter] = useState('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);

  // Fetch all tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['ai-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meditask_tasks')
        .select(`id, title, description, priority, status, due_date, patient_id, patients (id, name)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  // Fetch patients for QOF actions
  const { data: patients = [] } = useQuery({
    queryKey: ['qof-patients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, nhs_number, phone_number, date_of_birth, conditions, medications, hba1c_mmol_mol, cholesterol_ldl, frailty_status, last_review_date, cha2ds2_vasc_score')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Patient[];
    },
  });

  // Fetch call responses for QOF
  const { data: callResponses = [] } = useQuery({
    queryKey: ['qof-responses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_responses')
        .select('id, patient_id, blood_pressure_systolic, blood_pressure_diastolic, smoking_status, collected_at')
        .order('collected_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Complete task mutation
  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('meditask_tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['meditask-stats'] });
      toast.success('Task completed');
    },
    onError: () => toast.error('Failed to complete task'),
  });

  // Create task from suggestion or QOF action
  const createTaskMutation = useMutation({
    mutationFn: async (task: { title: string; description: string; priority: string; patient_id?: string }) => {
      const { error } = await supabase.from('meditask_tasks').insert({
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: 'pending',
        patient_id: task.patient_id || null,
        due_date: addDays(new Date(), task.priority === 'urgent' || task.priority === 'high' ? 3 : 7).toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-tasks'] });
      toast.success('Task created');
    },
    onError: () => toast.error('Failed to create task'),
  });

  // Generate AI suggestions
  const generateSuggestions = async () => {
    setIsGenerating(true);
    try {
      const response = await supabase.functions.invoke('ai-task-suggestions', { body: { type: 'suggest' } });
      if (response.error) throw response.error;
      const suggestions = response.data?.suggestions || [];
      setAiSuggestions(suggestions.map((s: any, i: number) => ({ ...s, id: `suggestion-${i}-${Date.now()}` })));
      if (suggestions.length === 0) toast.info('No new suggestions');
      else toast.success(`Generated ${suggestions.length} suggestions`);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to generate suggestions');
    } finally {
      setIsGenerating(false);
    }
  };

  // QOF Action generation helpers
  const getPatientAge = (dob: string | null) => dob ? differenceInYears(new Date(), parseISO(dob)) : null;
  const getLatestBP = (patientId: string) => {
    const r = callResponses.find((r: any) => r.patient_id === patientId && r.blood_pressure_systolic);
    return r ? { systolic: r.blood_pressure_systolic, diastolic: r.blood_pressure_diastolic } : null;
  };
  const hasCondition = (p: Patient, ...conds: string[]) => conds.some(c => p.conditions?.some(pc => pc.toLowerCase().includes(c.toLowerCase())));
  const hasMedication = (p: Patient, ...meds: string[]) => meds.some(m => p.medications?.some(pm => pm.toLowerCase().includes(m.toLowerCase())));

  // Generate QOF actions
  const qofActions: QOFAction[] = [];
  patients.forEach(patient => {
    const age = getPatientAge(patient.date_of_birth);
    const bp = getLatestBP(patient.id);

    // Hypertension BP control
    if (hasCondition(patient, 'Hypertension')) {
      if (!bp || bp.systolic > 140 || bp.diastolic > 90) {
        qofActions.push({
          patient, priority: bp && bp.systolic > 160 ? 'high' : 'medium',
          indicator: QOF_INDICATORS.find(i => i.code === 'HYP008')!,
          reason: bp ? `BP ${bp.systolic}/${bp.diastolic} (target ≤140/90)` : 'No BP recorded',
          actionRequired: 'BP check and medication review'
        });
      }
    }

    // Diabetes HbA1c control
    if (hasCondition(patient, 'Diabetes') && patient.frailty_status !== 'severe') {
      if (!patient.hba1c_mmol_mol || patient.hba1c_mmol_mol > 58) {
        qofActions.push({
          patient, priority: patient.hba1c_mmol_mol && patient.hba1c_mmol_mol > 75 ? 'high' : 'medium',
          indicator: QOF_INDICATORS.find(i => i.code === 'DM006')!,
          reason: patient.hba1c_mmol_mol ? `HbA1c ${patient.hba1c_mmol_mol} (target ≤58)` : 'No HbA1c recorded',
          actionRequired: 'HbA1c check and diabetes review'
        });
      }
    }

    // CHD patients not on statin
    if (hasCondition(patient, 'CHD', 'Stroke', 'TIA') && !hasMedication(patient, 'Statin', 'Atorvastatin', 'Simvastatin')) {
      qofActions.push({
        patient, priority: 'high',
        indicator: QOF_INDICATORS.find(i => i.code === 'CHOL003')!,
        reason: 'CVD patient not on statin therapy',
        actionRequired: 'Review for statin prescription'
      });
    }

    // AF anticoagulation
    if (hasCondition(patient, 'AF', 'Atrial Fibrillation') && (patient.cha2ds2_vasc_score ?? 0) >= 2) {
      if (!hasMedication(patient, 'Warfarin', 'Apixaban', 'Rivaroxaban', 'Edoxaban', 'Dabigatran')) {
        qofActions.push({
          patient, priority: 'high',
          indicator: QOF_INDICATORS.find(i => i.code === 'AF007')!,
          reason: 'AF with CHA2DS2-VASc ≥2, not anticoagulated',
          actionRequired: 'Review for anticoagulation'
        });
      }
    }

    // Heart failure ACE-I/ARB
    if (hasCondition(patient, 'Heart Failure', 'HF', 'LVSD')) {
      if (!hasMedication(patient, 'ACE', 'ARB', 'Ramipril', 'Lisinopril', 'Losartan', 'Candesartan')) {
        qofActions.push({
          patient, priority: 'high',
          indicator: QOF_INDICATORS.find(i => i.code === 'HF003')!,
          reason: 'Heart failure not on ACE-I/ARB',
          actionRequired: 'Review for ACE-I/ARB'
        });
      }
    }
  });

  // Sort QOF actions by priority
  const sortedQofActions = qofActions.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  // Filter tasks
  const filteredTasks = taskFilter === 'all' 
    ? tasks.filter(t => t.status !== 'completed')
    : taskFilter === 'completed' 
      ? tasks.filter(t => t.status === 'completed')
      : taskFilter === 'overdue'
        ? tasks.filter(t => t.status !== 'completed' && t.due_date && isBefore(new Date(t.due_date), new Date()))
        : tasks.filter(t => t.status === taskFilter);

  const stats = {
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => t.status !== 'completed' && t.due_date && isBefore(new Date(t.due_date), new Date())).length,
    qofActions: sortedQofActions.length,
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': case 'high': return 'bg-destructive text-destructive-foreground';
      case 'medium': case 'normal': return 'bg-warning text-warning-foreground';
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
            AI Task Management
          </h1>
          <p className="text-muted-foreground">Smart tasks, AI suggestions & QOF clinical actions</p>
        </div>
        <Button onClick={generateSuggestions} disabled={isGenerating} className="gap-2">
          {isGenerating ? <><Loader2 className="h-4 w-4 animate-spin" />Generating...</> : <><Sparkles className="h-4 w-4" />Generate AI Suggestions</>}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setMainTab('tasks'); setTaskFilter('pending'); }}>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold">{stats.pending}</p></div>
            <ListChecks className="h-8 w-8 text-muted-foreground/50" />
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setMainTab('tasks'); setTaskFilter('in_progress'); }}>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-muted-foreground">In Progress</p><p className="text-2xl font-bold text-warning">{stats.inProgress}</p></div>
            <Clock className="h-8 w-8 text-warning/50" />
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setMainTab('tasks'); setTaskFilter('completed'); }}>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-muted-foreground">Completed</p><p className="text-2xl font-bold text-success">{stats.completed}</p></div>
            <CheckCircle2 className="h-8 w-8 text-success/50" />
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setMainTab('tasks'); setTaskFilter('overdue'); }}>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-muted-foreground">Overdue</p><p className="text-2xl font-bold text-destructive">{stats.overdue}</p></div>
            <AlertCircle className="h-8 w-8 text-destructive/50" />
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-primary/30" onClick={() => setMainTab('qof')}>
          <CardContent className="p-4 flex items-center justify-between">
            <div><p className="text-sm text-muted-foreground">QOF Actions</p><p className="text-2xl font-bold text-primary">{stats.qofActions}</p></div>
            <Target className="h-8 w-8 text-primary/50" />
          </CardContent>
        </Card>
      </div>

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" />AI Suggested Tasks</CardTitle>
            <CardDescription>Based on patient data and clinical priorities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {aiSuggestions.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className={getPriorityColor(s.priority)}>{s.priority}</Badge>
                      <Badge variant="outline">{s.category}</Badge>
                    </div>
                    <h4 className="font-medium">{s.title}</h4>
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                    <p className="text-xs text-muted-foreground italic flex items-center gap-1"><Brain className="h-3 w-3" />{s.reasoning}</p>
                  </div>
                  <Button size="sm" onClick={() => { createTaskMutation.mutate({ title: s.title, description: s.description, priority: s.priority }); setAiSuggestions(prev => prev.filter(x => x.id !== s.id)); }} disabled={createTaskMutation.isPending} className="gap-1">
                    <ArrowRight className="h-4 w-4" />Add
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'tasks' | 'qof')}>
        <TabsList className="mb-4">
          <TabsTrigger value="tasks" className="gap-2"><ListChecks className="h-4 w-4" />My Tasks</TabsTrigger>
          <TabsTrigger value="qof" className="gap-2"><Target className="h-4 w-4" />QOF Clinical Actions</TabsTrigger>
        </TabsList>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Tasks</CardTitle>
                <Tabs value={taskFilter} onValueChange={setTaskFilter}>
                  <TabsList className="h-8">
                    <TabsTrigger value="all" className="text-xs px-3">Active</TabsTrigger>
                    <TabsTrigger value="pending" className="text-xs px-3">Pending</TabsTrigger>
                    <TabsTrigger value="overdue" className="text-xs px-3">Overdue</TabsTrigger>
                    <TabsTrigger value="completed" className="text-xs px-3">Completed</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {tasksLoading ? (
                  <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
                ) : filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ListChecks className="h-12 w-12 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No tasks found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredTasks.map((task) => (
                      <div key={task.id} className={`flex items-center justify-between gap-4 p-4 rounded-lg border transition-all ${task.status === 'completed' ? 'bg-muted/50 opacity-60' : 'bg-card hover:bg-accent/50'}`}>
                        <div className="flex items-start gap-3 flex-1">
                          {task.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-success" /> : task.status === 'in_progress' ? <Clock className="h-4 w-4 text-warning" /> : <ListChecks className="h-4 w-4 text-muted-foreground" />}
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className={`font-medium ${task.status === 'completed' ? 'line-through' : ''}`}>{task.title}</h4>
                              <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                            </div>
                            {task.description && <p className="text-sm text-muted-foreground line-clamp-1">{task.description}</p>}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              {task.patients?.name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{task.patients.name}</span>}
                              {task.due_date && <span className={`flex items-center gap-1 ${task.status !== 'completed' && isBefore(new Date(task.due_date), new Date()) ? 'text-destructive font-medium' : ''}`}><Calendar className="h-3 w-3" />{format(new Date(task.due_date), 'dd MMM yyyy')}</span>}
                            </div>
                          </div>
                        </div>
                        {task.status !== 'completed' && (
                          <Button size="sm" variant="outline" onClick={() => completeTaskMutation.mutate(task.id)} disabled={completeTaskMutation.isPending} className="gap-1 shrink-0">
                            <Check className="h-4 w-4" />Complete
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* QOF Actions Tab */}
        <TabsContent value="qof">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Heart className="h-5 w-5 text-destructive" />QOF Clinical Actions</CardTitle>
              <CardDescription>Patient actions required based on QOF indicators and clinical data</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[450px]">
                {sortedQofActions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-success/50 mb-3" />
                    <p className="text-muted-foreground">All patients meet QOF targets</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedQofActions.slice(0, 50).map((action, idx) => (
                      <div key={`${action.patient.id}-${action.indicator.code}-${idx}`} className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={getPriorityColor(action.priority)}>{action.priority}</Badge>
                            <Badge variant="outline">{action.indicator.code}</Badge>
                            <span className="text-xs text-muted-foreground">{action.indicator.category}</span>
                          </div>
                          <h4 className="font-medium">{action.patient.name}</h4>
                          <p className="text-sm text-muted-foreground">{action.reason}</p>
                          <p className="text-sm font-medium text-primary">{action.actionRequired}</p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => createTaskMutation.mutate({
                            title: `${action.indicator.code}: ${action.actionRequired}`,
                            description: `${action.patient.name} - ${action.reason}`,
                            priority: action.priority === 'high' ? 'high' : 'normal',
                            patient_id: action.patient.id
                          })}
                          disabled={createTaskMutation.isPending}
                          className="gap-1 shrink-0"
                        >
                          <ArrowRight className="h-4 w-4" />Create Task
                        </Button>
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
