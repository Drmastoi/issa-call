import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, Phone, CheckCircle, XCircle, Clock, 
  Activity, Scale, Ruler, Heart, Wine, Cigarette, 
  UserCheck, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BatchExport } from './BatchExport';

interface BatchSummaryViewProps {
  batchId: string;
  batchName: string;
  batchStatus: string;
  scheduledDate: string;
  onRemovePatient?: (batchPatientId: string) => void;
}

interface CallWithPatient {
  id: string;
  status: string;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  attempt_number: number;
  patients: {
    id: string;
    name: string;
    phone_number: string;
  };
}

interface CallResponse {
  id: string;
  call_id: string;
  patient_id: string;
  weight_kg: number | null;
  height_cm: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  pulse_rate: number | null;
  smoking_status: string | null;
  alcohol_units_per_week: number | null;
  is_carer: boolean | null;
  collected_at: string;
  patients: {
    id: string;
    name: string;
  };
}

export function BatchSummaryView({ 
  batchId, 
  batchName, 
  batchStatus, 
  scheduledDate,
  onRemovePatient 
}: BatchSummaryViewProps) {
  // Fetch batch patients
  const { data: batchPatients } = useQuery({
    queryKey: ['batch-patients-summary', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_patients')
        .select(`
          id,
          priority,
          patient_id,
          patients (id, name, phone_number)
        `)
        .eq('batch_id', batchId)
        .order('priority');
      if (error) throw error;
      return data;
    },
  });

  // Fetch calls for this batch
  const { data: calls } = useQuery({
    queryKey: ['batch-calls', batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select(`
          id,
          status,
          duration_seconds,
          started_at,
          ended_at,
          attempt_number,
          patients (id, name, phone_number)
        `)
        .eq('batch_id', batchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CallWithPatient[];
    },
  });

  // Fetch call responses for this batch's calls
  const { data: callResponses } = useQuery({
    queryKey: ['batch-responses', batchId],
    enabled: !!calls && calls.length > 0,
    queryFn: async () => {
      const callIds = calls?.map(c => c.id) || [];
      if (callIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('call_responses')
        .select(`
          id,
          call_id,
          patient_id,
          weight_kg,
          height_cm,
          blood_pressure_systolic,
          blood_pressure_diastolic,
          pulse_rate,
          smoking_status,
          alcohol_units_per_week,
          is_carer,
          collected_at,
          patients (id, name)
        `)
        .in('call_id', callIds)
        .order('collected_at', { ascending: false });
      if (error) throw error;
      return data as CallResponse[];
    },
  });

  // Calculate stats
  const totalPatients = batchPatients?.length || 0;
  const completedCalls = calls?.filter(c => c.status === 'completed').length || 0;
  const failedCalls = calls?.filter(c => c.status === 'failed' || c.status === 'no_answer').length || 0;
  const pendingCalls = calls?.filter(c => c.status === 'pending' || c.status === 'in_progress').length || 0;
  const responsesCollected = callResponses?.length || 0;

  const getCallStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      pending: 'secondary',
      in_progress: 'secondary',
      failed: 'destructive',
      no_answer: 'destructive',
    };
    const colors: Record<string, string> = {
      completed: 'bg-green-500/10 text-green-600 border-green-200',
      pending: '',
      in_progress: 'bg-blue-500/10 text-blue-600 border-blue-200',
      failed: '',
      no_answer: 'bg-orange-500/10 text-orange-600 border-orange-200',
    };
    return (
      <Badge variant={variants[status] ?? 'secondary'} className={colors[status]}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Export Button */}
      <div className="flex justify-end">
        <BatchExport batchId={batchId} batchName={batchName} />
      </div>
      
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Patients</p>
              <p className="text-lg font-semibold">{totalPatients}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-lg font-semibold">{completedCalls}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-lg font-semibold">{failedCalls}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Data Collected</p>
              <p className="text-lg font-semibold">{responsesCollected}</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="patients" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="patients">Patients</TabsTrigger>
          <TabsTrigger value="calls">Call Results</TabsTrigger>
          <TabsTrigger value="data">Health Data</TabsTrigger>
        </TabsList>

        <TabsContent value="patients" className="mt-4">
          <ScrollArea className="h-64">
            {batchPatients && batchPatients.length > 0 ? (
              <div className="space-y-2">
                {batchPatients.map((bp: any) => (
                  <div key={bp.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">{bp.patients.name}</p>
                      <p className="text-sm text-muted-foreground">{bp.patients.phone_number}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Priority {bp.priority + 1}</Badge>
                      {batchStatus === 'pending' && onRemovePatient && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onRemovePatient(bp.id)}
                          title="Remove from batch"
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No patients in this batch</p>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="calls" className="mt-4">
          <ScrollArea className="h-64">
            {calls && calls.length > 0 ? (
              <div className="space-y-2">
                {calls.map((call) => (
                  <div key={call.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{call.patients?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Attempt #{call.attempt_number} • Duration: {formatDuration(call.duration_seconds)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getCallStatusBadge(call.status)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No calls made yet</p>
                <p className="text-sm">Start the batch to begin calling patients</p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="data" className="mt-4">
          <ScrollArea className="h-64">
            {callResponses && callResponses.length > 0 ? (
              <div className="space-y-3">
                {callResponses.map((response) => (
                  <Card key={response.id} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium">{response.patients?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(response.collected_at).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      {response.weight_kg && (
                        <div className="flex items-center gap-1.5">
                          <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{response.weight_kg} kg</span>
                        </div>
                      )}
                      {response.height_cm && (
                        <div className="flex items-center gap-1.5">
                          <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{response.height_cm} cm</span>
                        </div>
                      )}
                      {(response.blood_pressure_systolic || response.blood_pressure_diastolic) && (
                        <div className="flex items-center gap-1.5">
                          <Heart className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{response.blood_pressure_systolic}/{response.blood_pressure_diastolic} mmHg</span>
                        </div>
                      )}
                      {response.pulse_rate && (
                        <div className="flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{response.pulse_rate} bpm</span>
                        </div>
                      )}
                      {response.smoking_status && (
                        <div className="flex items-center gap-1.5">
                          <Cigarette className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="capitalize">{response.smoking_status}</span>
                        </div>
                      )}
                      {response.alcohol_units_per_week !== null && (
                        <div className="flex items-center gap-1.5">
                          <Wine className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{response.alcohol_units_per_week} units/wk</span>
                        </div>
                      )}
                      {response.is_carer !== null && (
                        <div className="flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{response.is_carer ? 'Is carer' : 'Not a carer'}</span>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No health data collected yet</p>
                <p className="text-sm">Data will appear here after successful calls</p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
