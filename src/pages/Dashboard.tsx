import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Phone, Calendar, CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AIInsightsPanel } from '@/components/dashboard/AIInsightsPanel';
import { RiskAlertsWidget } from '@/components/dashboard/RiskAlertsWidget';
import { QOFProgressPanel } from '@/components/dashboard/QOFProgressPanel';

export default function Dashboard() {
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

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your patient call system</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Patients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPatients ?? 0}</div>
            <Link to="/patients" className="text-sm text-primary hover:underline mt-1 inline-block">
              Manage patients →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Batches</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingBatches ?? 0}</div>
            <Link to="/batches" className="text-sm text-primary hover:underline mt-1 inline-block">
              View batches →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCalls ?? 0}</div>
            <Link to="/calls" className="text-sm text-primary hover:underline mt-1 inline-block">
              View all calls →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Calls</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completedCalls ?? 0}</div>
            <p className="text-sm text-muted-foreground mt-1">
              {stats?.totalCalls ? Math.round((stats.completedCalls / stats.totalCalls) * 100) : 0}% success rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: AI Insights + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left Column: AI Insights */}
        <div className="lg:col-span-1 space-y-6">
          <AIInsightsPanel />
        </div>

        {/* Right Column: Risk Alerts + QOF */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RiskAlertsWidget maxItems={4} />
            <QOFProgressPanel />
          </div>
        </div>
      </div>

      {/* Recent Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Calls */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Calls</CardTitle>
            <CardDescription>Latest call activity</CardDescription>
          </CardHeader>
          <CardContent>
            {recentCalls && recentCalls.length > 0 ? (
              <div className="space-y-4">
                {recentCalls.map((call: any) => (
                  <div key={call.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(call.status)}
                      <div>
                        <p className="font-medium">{call.patients?.name ?? 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{call.patients?.phone_number}</p>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground capitalize">{call.status.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No calls yet</p>
            )}
            <Button asChild variant="outline" className="w-full mt-4">
              <Link to="/calls">
                View All Calls <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Upcoming Batches */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Batches</CardTitle>
            <CardDescription>Scheduled call batches</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingBatches && upcomingBatches.length > 0 ? (
              <div className="space-y-4">
                {upcomingBatches.map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{batch.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(batch.scheduled_date).toLocaleDateString('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    </div>
                    <span className={`text-sm px-2 py-1 rounded-full ${
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
              <p className="text-muted-foreground text-center py-8">No upcoming batches</p>
            )}
            <Button asChild variant="outline" className="w-full mt-4">
              <Link to="/batches">
                Manage Batches <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
