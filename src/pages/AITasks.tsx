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
  RefreshCw,
  ArrowRight,
  Brain,
  Zap,
  Target,
  User,
  Calendar,
  TrendingUp,
  Loader2,
  Check
} from 'lucide-react';
import { format, isAfter, isBefore, addDays } from 'date-fns';

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

export default function AITasks() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);

  // Fetch all tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['ai-tasks'],
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
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  // Complete task mutation
  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('meditask_tasks')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['meditask-stats'] });
      toast.success('Task marked as complete');
    },
    onError: () => {
      toast.error('Failed to complete task');
    },
  });

  // Create task from AI suggestion
  const createTaskMutation = useMutation({
    mutationFn: async (suggestion: AISuggestion) => {
      const { error } = await supabase
        .from('meditask_tasks')
        .insert({
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority,
          status: 'pending',
          due_date: addDays(new Date(), suggestion.priority === 'urgent' ? 1 : suggestion.priority === 'high' ? 3 : 7).toISOString(),
        });
      if (error) throw error;
    },
    onSuccess: (_, suggestion) => {
      queryClient.invalidateQueries({ queryKey: ['ai-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['meditask-stats'] });
      setAiSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
      toast.success('Task created from AI suggestion');
    },
    onError: () => {
      toast.error('Failed to create task');
    },
  });

  // Generate AI suggestions
  const generateSuggestions = async () => {
    setIsGenerating(true);
    try {
      const response = await supabase.functions.invoke('ai-task-suggestions', {
        body: { type: 'suggest' }
      });
      
      if (response.error) throw response.error;
      
      const suggestions = response.data?.suggestions || [];
      setAiSuggestions(suggestions.map((s: any, i: number) => ({
        ...s,
        id: `suggestion-${i}-${Date.now()}`
      })));
      
      if (suggestions.length === 0) {
        toast.info('No new task suggestions at this time');
      } else {
        toast.success(`Generated ${suggestions.length} task suggestions`);
      }
    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast.error('Failed to generate AI suggestions');
    } finally {
      setIsGenerating(false);
    }
  };

  // Filter tasks by status
  const filterTasks = (status: string) => {
    if (status === 'all') return tasks.filter(t => t.status !== 'completed');
    if (status === 'completed') return tasks.filter(t => t.status === 'completed');
    if (status === 'overdue') {
      return tasks.filter(t => 
        t.status !== 'completed' && 
        t.due_date && 
        isBefore(new Date(t.due_date), new Date())
      );
    }
    return tasks.filter(t => t.status === status);
  };

  const filteredTasks = filterTasks(activeTab);

  // Stats
  const stats = {
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => 
      t.status !== 'completed' && 
      t.due_date && 
      isBefore(new Date(t.due_date), new Date())
    ).length,
    urgent: tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length,
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-warning text-warning-foreground';
      case 'normal': return 'bg-primary text-primary-foreground';
      case 'low': return 'bg-muted text-muted-foreground';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'in_progress': return <Clock className="h-4 w-4 text-warning" />;
      case 'pending': return <ListChecks className="h-4 w-4 text-muted-foreground" />;
      default: return <AlertCircle className="h-4 w-4 text-destructive" />;
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
          <p className="text-muted-foreground">Smart task suggestions and management powered by AI</p>
        </div>
        <Button 
          onClick={generateSuggestions} 
          disabled={isGenerating}
          className="gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate AI Suggestions
            </>
          )}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab('pending')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <ListChecks className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab('in_progress')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-warning">{stats.inProgress}</p>
              </div>
              <Clock className="h-8 w-8 text-warning/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab('completed')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-success">{stats.completed}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-success/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveTab('overdue')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-destructive">{stats.overdue}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-destructive/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Urgent</p>
                <p className="text-2xl font-bold text-destructive">{stats.urgent}</p>
              </div>
              <Zap className="h-8 w-8 text-destructive/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Suggestions Section */}
      {aiSuggestions.length > 0 && (
        <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Suggested Tasks
            </CardTitle>
            <CardDescription>
              Based on patient data, alerts, and clinical priorities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {aiSuggestions.map((suggestion) => (
                <div 
                  key={suggestion.id}
                  className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className={getPriorityColor(suggestion.priority)} variant="secondary">
                        {suggestion.priority}
                      </Badge>
                      <Badge variant="outline">{suggestion.category}</Badge>
                    </div>
                    <h4 className="font-medium">{suggestion.title}</h4>
                    <p className="text-sm text-muted-foreground">{suggestion.description}</p>
                    <p className="text-xs text-muted-foreground italic flex items-center gap-1">
                      <Brain className="h-3 w-3" />
                      {suggestion.reasoning}
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => createTaskMutation.mutate(suggestion)}
                    disabled={createTaskMutation.isPending}
                    className="gap-1"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Add Task
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tasks List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Tasks</CardTitle>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs px-3">All Active</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs px-3">Pending</TabsTrigger>
                <TabsTrigger value="in_progress" className="text-xs px-3">In Progress</TabsTrigger>
                <TabsTrigger value="overdue" className="text-xs px-3">Overdue</TabsTrigger>
                <TabsTrigger value="completed" className="text-xs px-3">Completed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {tasksLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ListChecks className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No tasks found</p>
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'all' ? 'Generate AI suggestions to get started' : `No ${activeTab.replace('_', ' ')} tasks`}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task) => (
                  <div 
                    key={task.id}
                    className={`flex items-center justify-between gap-4 p-4 rounded-lg border transition-all ${
                      task.status === 'completed' 
                        ? 'bg-muted/50 opacity-60' 
                        : 'bg-card hover:bg-accent/50'
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-1">
                      {getStatusIcon(task.status)}
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`font-medium ${task.status === 'completed' ? 'line-through' : ''}`}>
                            {task.title}
                          </h4>
                          <Badge className={getPriorityColor(task.priority)} variant="secondary">
                            {task.priority}
                          </Badge>
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{task.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {task.patients?.name && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {task.patients.name}
                            </span>
                          )}
                          {task.due_date && (
                            <span className={`flex items-center gap-1 ${
                              task.status !== 'completed' && isBefore(new Date(task.due_date), new Date())
                                ? 'text-destructive font-medium'
                                : ''
                            }`}>
                              <Calendar className="h-3 w-3" />
                              {format(new Date(task.due_date), 'dd MMM yyyy')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {task.status !== 'completed' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => completeTaskMutation.mutate(task.id)}
                        disabled={completeTaskMutation.isPending}
                        className="gap-1 shrink-0"
                      >
                        <Check className="h-4 w-4" />
                        Complete
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
