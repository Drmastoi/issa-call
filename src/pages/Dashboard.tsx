import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Users, Phone, Calendar, CheckCircle, XCircle, Clock, ArrowRight, 
  TrendingUp, TrendingDown, Plus, Upload, BarChart3, Sparkles,
  Settings2, RotateCcw, X
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AIInsightsPanel } from '@/components/dashboard/AIInsightsPanel';
import { RiskAlertsWidget } from '@/components/dashboard/RiskAlertsWidget';
import { QOFProgressPanel } from '@/components/dashboard/QOFProgressPanel';
import { MediTaskWidget } from '@/components/dashboard/MediTaskWidget';
import { DraggableWidget } from '@/components/dashboard/DraggableWidget';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
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
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
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
        .select(`
          id,
          status,
          started_at,
          duration_seconds,
          patients (name, phone_number)
        `)
        .order('created_at', { ascending: false })
        .limit(5);
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
        .limit(5);
      return data ?? [];
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    
    if (over && active.id !== over.id) {
      reorderWidgets(active.id as string, over.id as string);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'failed':
      case 'no_answer':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-warning" />;
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const successRate = stats?.totalCalls ? Math.round((stats.completedCalls / stats.totalCalls) * 100) : 0;

  // Widget renderer
  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case 'ai-insights':
        return <AIInsightsPanel />;
      case 'risk-alerts':
        return <RiskAlertsWidget maxItems={4} />;
      case 'qof-progress':
        return <QOFProgressPanel />;
      case 'meditask':
        return <MediTaskWidget />;
      case 'recent-calls':
        return (
          <Card className="h-full shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  Recent Calls
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/calls">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentCalls && recentCalls.length > 0 ? (
                <div className="space-y-3">
                  {recentCalls.slice(0, 4).map((call: any) => (
                    <div key={call.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(call.status)}
                        <div>
                          <p className="text-sm font-medium">{call.patients?.name ?? 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{call.patients?.phone_number}</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground capitalize px-2 py-1 rounded-full bg-muted">
                        {call.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-6 text-sm">No calls yet</p>
              )}
            </CardContent>
          </Card>
        );
      case 'upcoming-batches':
        return (
          <Card className="h-full shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Upcoming Batches
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/batches">View All</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingBatches && upcomingBatches.length > 0 ? (
                <div className="space-y-3">
                  {upcomingBatches.slice(0, 4).map((batch) => (
                    <div key={batch.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div>
                        <p className="text-sm font-medium">{batch.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(batch.scheduled_date).toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        batch.status === 'in_progress' 
                          ? 'bg-warning/10 text-warning' 
                          : 'bg-secondary text-secondary-foreground'
                      }`}>
                        {batch.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-6 text-sm">No upcoming batches</p>
              )}
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  const widgetIds = widgets.map((w) => w.id);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Enhanced Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 animate-fade-in">
        <div className="flex items-center gap-4">
          <img 
            src={issaCareLogo} 
            alt="ISSA.CARE" 
            className="h-12 object-contain"
          />
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              {getGreeting()} 👋
            </h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {format(new Date(), 'EEEE, d MMMM yyyy')}
            </p>
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={toggleEditMode} 
            variant={isEditMode ? 'default' : 'outline'} 
            size="sm" 
            className="gap-2"
          >
            {isEditMode ? (
              <>
                <X className="h-4 w-4" />
                Done Editing
              </>
            ) : (
              <>
                <Settings2 className="h-4 w-4" />
                Customize
              </>
            )}
          </Button>
          {isEditMode && (
            <Button onClick={resetLayout} variant="ghost" size="sm" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          )}
          {!isEditMode && (
            <>
              <Button onClick={() => navigate('/batches')} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                New Batch
              </Button>
              <Button onClick={() => navigate('/patients')} variant="outline" size="sm" className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Patients
              </Button>
              <Button onClick={() => navigate('/ai-analytics')} variant="outline" size="sm" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Edit Mode Banner */}
      {isEditMode && (
        <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 flex items-center gap-3 animate-fade-in">
          <Settings2 className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Customization Mode</p>
            <p className="text-xs text-muted-foreground">
              Drag widgets to reorder. Click the eye icon to show/hide widgets.
            </p>
          </div>
          <Badge variant="secondary">{widgets.filter(w => w.visible).length} visible</Badge>
        </div>
      )}

      {/* Stats Grid - Enhanced with gradients and trends */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 animate-fade-in" style={{ animationDelay: '50ms' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Patients</CardTitle>
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold">{stats?.totalPatients ?? 0}</div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1 text-xs text-success">
                <TrendingUp className="h-3 w-3" />
                <span>Active cohort</span>
              </div>
              <Link to="/patients" className="text-xs text-primary hover:underline">
                View all →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 animate-fade-in" style={{ animationDelay: '100ms' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-warning/10 via-warning/5 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Batches</CardTitle>
            <div className="p-2 rounded-lg bg-warning/10">
              <Calendar className="h-4 w-4 text-warning" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold">{stats?.pendingBatches ?? 0}</div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Awaiting processing</span>
              </div>
              <Link to="/batches" className="text-xs text-primary hover:underline">
                Manage →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 animate-fade-in" style={{ animationDelay: '150ms' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Calls</CardTitle>
            <div className="p-2 rounded-lg bg-accent/10">
              <Phone className="h-4 w-4 text-accent" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold">{stats?.totalCalls ?? 0}</div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                <span>All time</span>
              </div>
              <Link to="/calls" className="text-xs text-primary hover:underline">
                History →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-success/10 via-success/5 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
            <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
            <div className="p-2 rounded-lg bg-success/10">
              <CheckCircle className="h-4 w-4 text-success" />
            </div>
          </CardHeader>
          <CardContent className="relative">
            <div className="text-3xl font-bold">{successRate}%</div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1 text-xs text-success">
                {successRate >= 80 ? (
                  <>
                    <TrendingUp className="h-3 w-3" />
                    <span>Above target</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-3 w-3 text-warning" />
                    <span className="text-warning">Below target</span>
                  </>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {stats?.completedCalls ?? 0} completed
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Draggable Widget Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {widgets.map((widget, index) => (
              <DraggableWidget
                key={widget.id}
                id={widget.id}
                isEditMode={isEditMode}
                isVisible={widget.visible}
                onToggleVisibility={() => toggleWidgetVisibility(widget.id)}
                className="animate-fade-in"
              >
                {renderWidget(widget.id)}
              </DraggableWidget>
            ))}
          </div>
        </SortableContext>
        
        <DragOverlay>
          {activeId ? (
            <div className="opacity-80 rotate-2 scale-105">
              {renderWidget(activeId)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}