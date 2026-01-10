import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, XCircle, Clock, Phone, PhoneOff, Eye } from 'lucide-react';
import { useState } from 'react';

interface Call {
  id: string;
  status: string;
  attempt_number: number;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  created_at: string;
  patients: {
    name: string;
    phone_number: string;
  };
  call_batches: {
    name: string;
  } | null;
}

interface CallResponse {
  id: string;
  weight_kg: number | null;
  height_cm: number | null;
  smoking_status: string | null;
  alcohol_units_per_week: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  pulse_rate: number | null;
  is_carer: boolean | null;
  collected_at: string;
}

export default function Calls() {
  const [viewCallId, setViewCallId] = useState<string | null>(null);

  const { data: calls, isLoading } = useQuery({
    queryKey: ['calls'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select(`
          id,
          status,
          attempt_number,
          started_at,
          ended_at,
          duration_seconds,
          transcript,
          created_at,
          patients (name, phone_number),
          call_batches (name)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Call[];
    },
  });

  const { data: callResponse } = useQuery({
    queryKey: ['call-response', viewCallId],
    enabled: !!viewCallId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_responses')
        .select('*')
        .eq('call_id', viewCallId)
        .maybeSingle();
      if (error) throw error;
      return data as CallResponse | null;
    },
  });

  const viewingCall = calls?.find(c => c.id === viewCallId);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'no_answer':
        return <PhoneOff className="h-4 w-4 text-muted-foreground" />;
      case 'in_progress':
        return <Phone className="h-4 w-4 text-primary animate-pulse" />;
      default:
        return <Clock className="h-4 w-4 text-warning" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary',
      in_progress: 'default',
      completed: 'outline',
      failed: 'destructive',
      no_answer: 'secondary',
      callback_requested: 'default',
    };
    return (
      <Badge variant={variants[status] ?? 'secondary'} className="gap-1">
        {getStatusIcon(status)}
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

  const formatSmokingStatus = (status: string | null) => {
    if (!status) return '-';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Call History</h1>
        <p className="text-muted-foreground mt-1">View all patient calls and collected health data</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {['completed', 'in_progress', 'pending', 'failed'].map((status) => {
          const count = calls?.filter(c => c.status === status).length ?? 0;
          return (
            <Card key={status}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground capitalize">{status.replace('_', ' ')}</p>
                    <p className="text-2xl font-bold">{count}</p>
                  </div>
                  {getStatusIcon(status)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Calls Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Calls</CardTitle>
          <CardDescription>
            {calls?.length ?? 0} calls in history
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : calls && calls.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempt</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="font-medium">{call.patients.name}</TableCell>
                    <TableCell>{call.patients.phone_number}</TableCell>
                    <TableCell>{call.call_batches?.name ?? '-'}</TableCell>
                    <TableCell>{getStatusBadge(call.status)}</TableCell>
                    <TableCell>{call.attempt_number}</TableCell>
                    <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                    <TableCell>
                      {new Date(call.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setViewCallId(call.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No calls yet. Start a batch to begin making calls.
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Call Dialog */}
      <Dialog open={!!viewCallId} onOpenChange={() => setViewCallId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Call Details</DialogTitle>
            <DialogDescription>
              {viewingCall && `Call to ${viewingCall.patients.name}`}
            </DialogDescription>
          </DialogHeader>
          {viewingCall && (
            <div className="space-y-6">
              {/* Call Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Patient</p>
                  <p className="font-medium">{viewingCall.patients.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{viewingCall.patients.phone_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(viewingCall.status)}</div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-medium">{formatDuration(viewingCall.duration_seconds)}</p>
                </div>
              </div>

              {/* Health Data */}
              {callResponse && (
                <div>
                  <h4 className="font-medium mb-3">Collected Health Data</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">Weight</p>
                        <p className="text-lg font-medium">
                          {callResponse.weight_kg ? `${callResponse.weight_kg} kg` : '-'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">Height</p>
                        <p className="text-lg font-medium">
                          {callResponse.height_cm ? `${callResponse.height_cm} cm` : '-'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">Blood Pressure</p>
                        <p className="text-lg font-medium">
                          {callResponse.blood_pressure_systolic && callResponse.blood_pressure_diastolic
                            ? `${callResponse.blood_pressure_systolic}/${callResponse.blood_pressure_diastolic}`
                            : '-'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">Pulse Rate</p>
                        <p className="text-lg font-medium">
                          {callResponse.pulse_rate ? `${callResponse.pulse_rate} bpm` : '-'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">Smoking Status</p>
                        <p className="text-lg font-medium">
                          {formatSmokingStatus(callResponse.smoking_status)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">Alcohol (units/week)</p>
                        <p className="text-lg font-medium">
                          {callResponse.alcohol_units_per_week ?? '-'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground">Is Carer</p>
                        <p className="text-lg font-medium">
                          {callResponse.is_carer === null ? '-' : callResponse.is_carer ? 'Yes' : 'No'}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* Transcript */}
              {viewingCall.transcript && (
                <div>
                  <h4 className="font-medium mb-3">Call Transcript</h4>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm whitespace-pre-wrap">{viewingCall.transcript}</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {!callResponse && viewingCall.status !== 'completed' && (
                <div className="text-center py-4 text-muted-foreground">
                  No health data collected for this call.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
