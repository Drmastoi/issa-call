import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { 
  CheckCircle2, Clock, AlertTriangle, ListChecks, Brain, User, Calendar,
  Check, Target, Heart, Activity, RefreshCw, Shield, FileText, Stethoscope,
  Search, X, EyeOff
} from 'lucide-react';
import { format } from 'date-fns';
import { 
  analyzeAllPatients, getClinicalActionStats, ClinicalAction, Patient, CallResponse
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [snoozedActions, setSnoozedActions] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('snoozed-clinical-actions');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [showSnoozed, setShowSnoozed] = useState(false);

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
    refetchInterval: 60000,
  });

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

  const clinicalActions = analyzeAllPatients(patients, callResponses);
  const stats = getClinicalActionStats(clinicalActions);

  // Filter actions
  const filteredActions = clinicalActions.filter(action => {
    if (categoryFilter !== 'all' && action.category !== categoryFilter) return false;
    if (priorityFilter !== 'all' && action.priority !== priorityFilter) return false;
    if (!showSnoozed && snoozedActions.has(action.id)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        action.patient.name.toLowerCase().includes(q) ||
        (action.patient.nhs_number?.toLowerCase().includes(q)) ||
        action.title.toLowerCase().includes(q) ||
        action.code.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Complete single action
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
      toast.success('Action marked as completed');
    },
    onError: () => toast.error('Failed to mark action complete'),
  });

  // Batch complete
  const batchCompleteMutation = useMutation({
    mutationFn: async (actions: ClinicalAction[]) => {
      const inserts = actions.map(action => ({
        title: `[${action.code}] ${action.title}`,
        description: `${action.patient.name} - ${action.reason}. Action: ${action.actionRequired}`,
        priority: action.priority === 'critical' ? 'urgent' : action.priority,
        status: 'completed',
        patient_id: action.patient.id,
        completed_at: new Date().toISOString(),
        due_date: new Date().toISOString(),
      }));
      const { error } = await supabase.from('meditask_tasks').insert(inserts);
      if (error) throw error;
    },
    onSuccess: (_, actions) => {
      queryClient.invalidateQueries({ queryKey: ['completed-clinical-tasks'] });
      setSelectedActions(new Set());
      toast.success(`${actions.length} actions marked as completed`);
    },
    onError: () => toast.error('Failed to batch complete'),
  });

  const handleBatchComplete = () => {
    const actions = filteredActions.filter(a => selectedActions.has(a.id));
    if (actions.length === 0) return;
    batchCompleteMutation.mutate(actions);
  };

  const toggleSelect = (id: string) => {
    setSelectedActions(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedActions.size === filteredActions.length) {
      setSelectedActions(new Set());
    } else {
      setSelectedActions(new Set(filteredActions.map(a => a.id)));
    }
  };

  const snoozeAction = (id: string) => {
    setSnoozedActions(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem('snoozed-clinical-actions', JSON.stringify([...next]));
      return next;
    });
    toast.info('Action snoozed — hidden from active list');
  };

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

  const snoozedCount = clinicalActions.filter(a => snoozedActions.has(a.id)).length;

  return (
    <div className="container py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Clinical Actions
          </h1>
          <p className="text-sm text-muted-foreground">
            QOF, NICE & KPI tasks · Auto-refreshes every 60s · Last: {format(new Date(), 'HH:mm')}
          </p>
        </div>
        <Button onClick={refreshData} disabled={isRefreshing} variant="outline" size="sm" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[
          { label: 'Total', value: stats.total, onClick: () => { setPriorityFilter('all'); setCategoryFilter('all'); } },
          { label: 'Critical', value: stats.critical, color: 'text-destructive', onClick: () => setPriorityFilter('critical') },
          { label: 'High', value: stats.high, color: 'text-orange-500', onClick: () => setPriorityFilter('high') },
          { label: 'QOF', value: stats.byCategory.QOF, color: 'text-primary', onClick: () => setCategoryFilter('QOF') },
          { label: 'NICE', value: stats.byCategory.NICE, color: 'text-blue-600', onClick: () => setCategoryFilter('NICE') },
          { label: 'Safety', value: stats.byCategory.Safety, color: 'text-destructive', onClick: () => setCategoryFilter('Safety') },
        ].map(s => (
          <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={s.onClick}>
            <CardContent className="p-3 text-center">
              <p className={`text-xl font-bold ${s.color ?? ''}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search patient name, NHS number, code..."
                className="pl-9 h-9"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {(['all', 'QOF', 'NICE', 'KPI', 'Safety'] as const).map(cat => (
                <Button key={cat} size="sm" variant={categoryFilter === cat ? 'default' : 'outline'} onClick={() => setCategoryFilter(cat)} className="text-xs h-8">
                  {cat === 'all' ? 'All' : cat}
                </Button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map(pri => (
                <Button key={pri} size="sm" variant={priorityFilter === pri ? 'default' : 'outline'} onClick={() => setPriorityFilter(pri)} className="text-xs h-8 capitalize">
                  {pri === 'all' ? 'All' : pri}
                </Button>
              ))}
            </div>
            {snoozedCount > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setShowSnoozed(!showSnoozed)} className="text-xs h-8 gap-1">
                <EyeOff className="h-3 w-3" />
                {showSnoozed ? 'Hide' : 'Show'} {snoozedCount} snoozed
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={v => setMainTab(v as 'actions' | 'completed')}>
        <TabsList className="mb-3">
          <TabsTrigger value="actions" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Pending ({filteredActions.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Completed ({completedTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="actions">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Heart className="h-5 w-5 text-destructive" />
                  Actions Required
                </CardTitle>
                {selectedActions.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{selectedActions.size} selected</span>
                    <Button size="sm" onClick={handleBatchComplete} disabled={batchCompleteMutation.isPending} className="gap-1">
                      <Check className="h-3 w-3" />
                      Mark All Done
                    </Button>
                  </div>
                )}
              </div>
              {filteredActions.length > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <Checkbox
                    checked={selectedActions.size === filteredActions.length && filteredActions.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-xs text-muted-foreground">Select all</span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-420px)] min-h-[300px]">
                {patientsLoading ? (
                  <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
                ) : filteredActions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-success/50 mb-3" />
                    <p className="text-muted-foreground">No pending clinical actions</p>
                    <p className="text-sm text-muted-foreground">All patients meeting targets!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredActions.map((action) => (
                      <div 
                        key={action.id} 
                        className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <Checkbox
                          checked={selectedActions.has(action.id)}
                          onCheckedChange={() => toggleSelect(action.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge className={`${getPriorityColor(action.priority)} text-[10px] px-1.5 py-0`}>{action.priority}</Badge>
                            <Badge variant="outline" className={`${getCategoryColor(action.category)} text-[10px] px-1.5 py-0`}>
                              <span className="flex items-center gap-0.5">{getCategoryIcon(action.category)}{action.category}</span>
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{action.code}</Badge>
                            {action.dueWithin && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Clock className="h-3 w-3" />{action.dueWithin}
                              </span>
                            )}
                          </div>
                          <h4 className="font-semibold text-sm">{action.title}</h4>
                          <p className="text-xs font-medium text-primary flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {action.patient.name}
                            {action.patient.nhs_number && (
                              <span className="text-muted-foreground ml-1">NHS: {action.patient.nhs_number}</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground"><strong>Reason:</strong> {action.reason}</p>
                          <p className="text-xs bg-primary/5 text-primary p-1.5 rounded"><strong>Action:</strong> {action.actionRequired}</p>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button size="sm" onClick={() => completeActionMutation.mutate(action)} disabled={completeActionMutation.isPending} className="gap-1 text-xs h-7">
                            <Check className="h-3 w-3" />Done
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => snoozeAction(action.id)} className="gap-1 text-xs h-7 text-muted-foreground">
                            <EyeOff className="h-3 w-3" />Snooze
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Completed Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-380px)] min-h-[300px]">
                {tasksLoading ? (
                  <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
                ) : completedTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ListChecks className="h-12 w-12 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No completed actions yet</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {completedTasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium line-through opacity-70 truncate">{task.title}</h4>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {task.patients?.name && (
                              <span className="flex items-center gap-1"><User className="h-3 w-3" />{task.patients.name}</span>
                            )}
                            {task.due_date && (
                              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(task.due_date), 'dd MMM yyyy')}</span>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">{task.priority}</Badge>
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
