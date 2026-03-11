import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Users, Phone, Calendar, CheckCircle, XCircle, Clock, 
  TrendingUp, TrendingDown, Plus, Upload, BarChart3, Sparkles
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { QOFProgressPanel } from '@/components/dashboard/QOFProgressPanel';
import { CommandStrip } from '@/components/dashboard/CommandStrip';
import { ClinicalOverview } from '@/components/dashboard/ClinicalOverview';
import { useRealtimeDashboard } from '@/hooks/useRealtimeDashboard';
import issaCareLogo from '@/assets/issa-care-logo.jpg';
import { format } from 'date-fns';
import { KPICard } from '@/components/dashboard/KPICard';

export default function Dashboard() {
  const navigate = useNavigate();
  useRealtimeDashboard();

  const { data: stats, isLoading: statsLoading } = useQuery({
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
        .select('id, status, started_at, duration_seconds, patients (name, phone_number)')
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-3.5 w-3.5 text-success" />;
      case 'failed':
      case 'no_answer':
        return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-warning" />;
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const successRate = stats?.totalCalls ? Math.round((stats.completedCalls / stats.totalCalls) * 100) : 0;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <img src={issaCareLogo} alt="ISSA.CARE" className="h-10 object-contain" />
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground">
              {getGreeting()} 👋
            </h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(), 'EEEE, d MMMM yyyy')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/batches')} size="sm" className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" />
            New Batch
          </Button>
          <Button onClick={() => navigate('/patients')} variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
            <Upload className="h-3.5 w-3.5" />
            Upload Patients
          </Button>
          <Button onClick={() => navigate('/ai-analytics')} variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
            <BarChart3 className="h-3.5 w-3.5" />
            Analytics
          </Button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          title="Total Patients"
          value={stats?.totalPatients ?? 0}
          icon={Users}
          iconColor="text-primary"
          gradientFrom="from-primary/10 via-primary/5"
          loading={statsLoading}
          delay={50}
          footer={
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-success flex items-center gap-0.5">
                <TrendingUp className="h-2.5 w-2.5" /> Active
              </span>
              <Link to="/patients" className="text-[10px] text-primary hover:underline">View →</Link>
            </div>
          }
        />
        <KPICard
          title="Pending Batches"
          value={stats?.pendingBatches ?? 0}
          icon={Calendar}
          iconColor="text-warning"
          gradientFrom="from-warning/10 via-warning/5"
          loading={statsLoading}
          delay={100}
          footer={
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" /> Awaiting
              </span>
              <Link to="/batches" className="text-[10px] text-primary hover:underline">Manage →</Link>
            </div>
          }
        />
        <KPICard
          title="Total Calls"
          value={stats?.totalCalls ?? 0}
          icon={Phone}
          iconColor="text-accent"
          gradientFrom="from-accent/10 via-accent/5"
          loading={statsLoading}
          delay={150}
          footer={
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Sparkles className="h-2.5 w-2.5" /> All time
              </span>
              <Link to="/calls" className="text-[10px] text-primary hover:underline">History →</Link>
            </div>
          }
        />
        <KPICard
          title="Success Rate"
          value={`${successRate}%`}
          icon={CheckCircle}
          iconColor="text-success"
          gradientFrom="from-success/10 via-success/5"
          loading={statsLoading}
          delay={200}
          footer={
            <div className="flex items-center justify-between">
              {successRate >= 80 ? (
                <span className="text-[10px] text-success flex items-center gap-0.5">
                  <TrendingUp className="h-2.5 w-2.5" /> On target
                </span>
              ) : (
                <span className="text-[10px] text-warning flex items-center gap-0.5">
                  <TrendingDown className="h-2.5 w-2.5" /> Below
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">{stats?.completedCalls ?? 0} done</span>
            </div>
          }
        />
      </div>

      {/* Command Strip */}
      <CommandStrip />

      {/* Clinical Overview */}
      <ClinicalOverview />

      {/* Activity Row: QOF + Recent Calls + Upcoming Batches */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* QOF Progress */}
        <QOFProgressPanel />

        {/* Recent Calls */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-primary" />
                Recent Calls
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <Link to="/calls">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {recentCalls && recentCalls.length > 0 ? (
              <div className="space-y-1.5">
                {recentCalls.slice(0, 4).map((call: any) => (
                  <div key={call.id} className="flex items-center justify-between p-1.5 rounded-md hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      {getStatusIcon(call.status)}
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{call.patients?.name ?? 'Unknown'}</p>
                        <p className="text-[10px] text-muted-foreground">{call.patients?.phone_number}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground capitalize px-1.5 py-0.5 rounded-full bg-muted shrink-0">
                      {call.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4 text-xs">No calls yet</p>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Batches */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                Upcoming Batches
              </CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <Link to="/batches">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {upcomingBatches && upcomingBatches.length > 0 ? (
              <div className="space-y-1.5">
                {upcomingBatches.slice(0, 4).map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between p-1.5 rounded-md hover:bg-muted/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{batch.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(batch.scheduled_date).toLocaleDateString('en-GB', {
                          weekday: 'short', day: 'numeric', month: 'short',
                        })}
                      </p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
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
              <p className="text-muted-foreground text-center py-4 text-xs">No upcoming batches</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
