import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Users, Phone, Calendar, CheckCircle, XCircle, Clock, 
  TrendingUp, Plus, BarChart3, Settings2, RotateCcw, X,
  AlertTriangle, Target, ClipboardList, Brain, ArrowRight
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { DraggableWidget } from '@/components/dashboard/DraggableWidget';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import { useDashboardInsights, useHealthAlerts } from '@/hooks/useHealthAlerts';
import issaCareLogo from '@/assets/issa-care-logo.jpg';
import { format } from 'date-fns';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function Dashboard() {
  const navigate = useNavigate();
  const { 
    widgets, 
    isEditMode, 
    reorderWidgets, 
    toggleWidgetVisibility, 
    resetLayout, 
    toggleEditMode 
  } = useDashboardLayout();
  
  const [activeId, setActiveId] = useState<string | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [patients, batches, calls, completedCalls] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }),
        supabase.from('call_batches').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('calls').select('id', { count: 'exact', head: true }),
        supabase.from('calls').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      ]);
      return {
        totalPatients: patients.count ?? 0,
        pendingBatches: batches.count ?? 0,
        totalCalls: calls.count ?? 0,
        completedCalls: completedCalls.count ?? 0,
      };
    },
  });

  const { data: recentCalls } = useQuery({
    queryKey: ['recent-calls'],
    queryFn: async () => {
      const { data } = await supabase
        .from('calls')
        .select('id, status, patients (name)')
        .order('created_at', { ascending: false })
        .limit(4);
      return data ?? [];
    },
  });

  const { data: upcomingBatches } = useQuery({
    queryKey: ['upcoming-batches'],
    queryFn: async () => {
      const { data } = await supabase
        .from('call_batches')
        .select('id, name, scheduled_date, status')
        .in('status', ['pending', 'in_progress'])
        .order('scheduled_date', { ascending: true })
        .limit(3);
      return data ?? [];
    },
  });

  const { data: taskStats } = useQuery({
    queryKey: ['meditask-stats'],
    queryFn: async () => {
      const [pending, urgent] = await Promise.all([
        supabase.from('meditask_tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('meditask_tasks').select('id', { count: 'exact', head: true }).eq('priority', 'urgent').neq('status', 'completed'),
      ]);
      return { pending: pending.count ?? 0, urgent: urgent.count ?? 0 };
    },
  });

  const { data: insights } = useDashboardInsights();
  const { data: alerts } = useHealthAlerts({ acknowledged: false });

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) reorderWidgets(active.id as string, over.id as string);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-3 w-3 text-success" />;
      case 'failed':
      case 'no_answer': return <XCircle className="h-3 w-3 text-destructive" />;
      default: return <Clock className="h-3 w-3 text-warning" />;
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const successRate = stats?.totalCalls ? Math.round((stats.completedCalls / stats.totalCalls) * 100) : 0;
  const criticalAlerts = alerts?.filter(a => a.severity === 'critical').length ?? 0;
  const qofScore = insights ? Math.round(
    ((insights.bp_coverage?.recorded || 0) / Math.max(insights.bp_coverage?.total || 1, 1) +
    (insights.smoking_coverage?.recorded || 0) / Math.max(insights.smoking_coverage?.total || 1, 1)) / 2 * 100
  ) : 0;

  const widgetIds = widgets.map((w) => w.id);

  // Compact widget renderer
  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case 'ai-insights':
        return (
          <Card className="h-full">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">AI Insights</span>
                </div>
                <Link to="/ai-analytics" className="text-xs text-primary hover:underline">View</Link>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Due Annual Check</span>
                  <span className="font-medium">{insights?.due_for_annual || 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Completion Rate</span>
                  <span className="font-medium">{insights?.call_completion_rate || 0}%</span>
                </div>
                {insights?.trend_insights?.[0] && (
                  <p className="text-xs text-muted-foreground line-clamp-1 pt-1 border-t">
                    {insights.trend_insights[0]}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      case 'risk-alerts':
        return (
          <Card className="h-full">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium">Alerts</span>
                  {(alerts?.length ?? 0) > 0 && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0">{alerts?.length}</Badge>
                  )}
                </div>
                <Link to="/ai-analytics" className="text-xs text-primary hover:underline">View</Link>
              </div>
              {alerts && alerts.length > 0 ? (
                <div className="space-y-1.5">
                  {alerts.slice(0, 3).map(alert => (
                    <div key={alert.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                      <span className={`w-1.5 h-1.5 rounded-full ${alert.severity === 'critical' ? 'bg-destructive' : 'bg-warning'}`} />
                      <span className="truncate flex-1">{alert.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">All clear ✓</p>
              )}
            </CardContent>
          </Card>
        );
      case 'qof-progress':
        return (
          <Card className="h-full">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">QOF</span>
                </div>
                <Link to="/ai-analytics" className="text-xs text-primary hover:underline">Details</Link>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl font-bold">{qofScore}%</span>
                <Progress value={qofScore} className="flex-1 h-2" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">BP</span>
                  <span>{insights?.bp_coverage?.recorded || 0}/{insights?.bp_coverage?.total || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Smoking</span>
                  <span>{insights?.smoking_coverage?.recorded || 0}/{insights?.smoking_coverage?.total || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case 'meditask':
        return (
          <Card className="h-full">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Tasks</span>
                </div>
                <Link to="/meditask" className="text-xs text-primary hover:underline">Open</Link>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 text-center p-2 rounded bg-muted/50">
                  <p className="text-xl font-bold">{taskStats?.pending ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
                <div className="flex-1 text-center p-2 rounded bg-destructive/10">
                  <p className="text-xl font-bold text-destructive">{taskStats?.urgent ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Urgent</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case 'recent-calls':
        return (
          <Card className="h-full">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Recent Calls</span>
                </div>
                <Link to="/calls" className="text-xs text-primary hover:underline">All</Link>
              </div>
              {recentCalls && recentCalls.length > 0 ? (
                <div className="space-y-1">
                  {recentCalls.map((call: any) => (
                    <div key={call.id} className="flex items-center gap-2 text-xs py-1">
                      {getStatusIcon(call.status)}
                      <span className="truncate flex-1">{call.patients?.name ?? 'Unknown'}</span>
                      <span className="text-muted-foreground capitalize">{call.status.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">No calls yet</p>
              )}
            </CardContent>
          </Card>
        );
      case 'upcoming-batches':
        return (
          <Card className="h-full">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Batches</span>
                </div>
                <Link to="/batches" className="text-xs text-primary hover:underline">All</Link>
              </div>
              {upcomingBatches && upcomingBatches.length > 0 ? (
                <div className="space-y-1">
                  {upcomingBatches.map((batch) => (
                    <div key={batch.id} className="flex items-center justify-between text-xs py-1">
                      <span className="truncate flex-1">{batch.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        batch.status === 'in_progress' ? 'bg-warning/20 text-warning' : 'bg-muted'
                      }`}>
                        {format(new Date(batch.scheduled_date), 'd MMM')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">No batches</p>
              )}
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-4 lg:p-5 h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src={issaCareLogo} alt="ISSA.CARE" className="h-8 object-contain" />
          <div>
            <h1 className="text-lg font-bold text-foreground">{getGreeting()} 👋</h1>
            <p className="text-xs text-muted-foreground">{format(new Date(), 'EEE, d MMM yyyy')}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button onClick={toggleEditMode} variant={isEditMode ? 'default' : 'ghost'} size="sm" className="h-7 px-2 text-xs">
            {isEditMode ? <><X className="h-3 w-3 mr-1" />Done</> : <Settings2 className="h-3 w-3" />}
          </Button>
          {isEditMode && (
            <Button onClick={resetLayout} variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
          {!isEditMode && (
            <>
              <Button onClick={() => navigate('/batches')} size="sm" className="h-7 px-2 text-xs gap-1">
                <Plus className="h-3 w-3" />Batch
              </Button>
              <Button onClick={() => navigate('/ai-analytics')} variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
                <BarChart3 className="h-3 w-3" />Analytics
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Edit Mode Banner - Compact */}
      {isEditMode && (
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 flex items-center gap-2 mb-3 flex-shrink-0">
          <Settings2 className="h-4 w-4 text-primary" />
          <span className="text-xs flex-1">Drag to reorder, click eye to show/hide</span>
          <Badge variant="secondary" className="text-xs">{widgets.filter(w => w.visible).length} visible</Badge>
        </div>
      )}

      {/* Stats Row - Ultra Compact */}
      <div className="grid grid-cols-4 gap-3 mb-4 flex-shrink-0">
        <Card className="relative overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
          <CardContent className="p-3 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Patients</p>
                <p className="text-xl font-bold">{stats?.totalPatients ?? 0}</p>
              </div>
              <Users className="h-5 w-5 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-warning/10 to-transparent" />
          <CardContent className="p-3 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Batches</p>
                <p className="text-xl font-bold">{stats?.pendingBatches ?? 0}</p>
              </div>
              <Calendar className="h-5 w-5 text-warning opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent" />
          <CardContent className="p-3 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Calls</p>
                <p className="text-xl font-bold">{stats?.totalCalls ?? 0}</p>
              </div>
              <Phone className="h-5 w-5 text-accent opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-success/10 to-transparent" />
          <CardContent className="p-3 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Success</p>
                <div className="flex items-center gap-1">
                  <p className="text-xl font-bold">{successRate}%</p>
                  {successRate >= 80 && <TrendingUp className="h-3 w-3 text-success" />}
                </div>
              </div>
              <CheckCircle className="h-5 w-5 text-success opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Draggable Widget Grid - Compact */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 flex-1 min-h-0">
            {widgets.filter(w => w.visible || isEditMode).map((widget) => (
              <DraggableWidget
                key={widget.id}
                id={widget.id}
                isEditMode={isEditMode}
                isVisible={widget.visible}
                onToggleVisibility={() => toggleWidgetVisibility(widget.id)}
              >
                {renderWidget(widget.id)}
              </DraggableWidget>
            ))}
          </div>
        </SortableContext>
        
        <DragOverlay>
          {activeId ? (
            <div className="opacity-80 rotate-1 scale-105">
              {renderWidget(activeId)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}