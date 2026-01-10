import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Phone, PhoneCall, PhoneOff, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Call {
  id: string;
  status: string;
  patient_id: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
}

interface CallWithPatient extends Call {
  patientName?: string;
}

const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  pending: { 
    icon: <Loader2 className="h-6 w-6 animate-spin" />, 
    label: 'Initiating...', 
    color: 'text-muted-foreground' 
  },
  in_progress: { 
    icon: <PhoneCall className="h-6 w-6 animate-pulse" />, 
    label: 'Call in Progress', 
    color: 'text-primary' 
  },
  completed: { 
    icon: <CheckCircle className="h-6 w-6" />, 
    label: 'Call Completed', 
    color: 'text-green-500' 
  },
  failed: { 
    icon: <XCircle className="h-6 w-6" />, 
    label: 'Call Failed', 
    color: 'text-destructive' 
  },
  no_answer: { 
    icon: <PhoneOff className="h-6 w-6" />, 
    label: 'No Answer', 
    color: 'text-amber-500' 
  },
};

interface CallStatusMonitorProps {
  callId: string | null;
  patientName?: string;
  onClose: () => void;
}

export function CallStatusMonitor({ callId, patientName, onClose }: CallStatusMonitorProps) {
  const [call, setCall] = useState<CallWithPatient | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!callId) return;

    // Fetch initial call data
    const fetchCall = async () => {
      const { data } = await supabase
        .from('calls')
        .select('*')
        .eq('id', callId)
        .single();
      
      if (data) {
        setCall({ ...data, patientName });
      }
    };

    fetchCall();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`call-${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${callId}`,
        },
        (payload) => {
          console.log('Call update received:', payload);
          setCall((prev) => ({ ...prev, ...payload.new as Call, patientName: prev?.patientName }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callId, patientName]);

  // Timer for in-progress calls
  useEffect(() => {
    if (call?.status !== 'in_progress' || !call.started_at) {
      return;
    }

    const startTime = new Date(call.started_at).getTime();
    
    const timer = setInterval(() => {
      const now = Date.now();
      setElapsedTime(Math.floor((now - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [call?.status, call?.started_at]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const status = call?.status || 'pending';
  const config = statusConfig[status] || statusConfig.pending;
  const isFinished = ['completed', 'failed', 'no_answer'].includes(status);

  return (
    <Dialog open={!!callId} onOpenChange={() => isFinished && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Call Status
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center py-8 space-y-4">
          <div className={cn(
            "p-4 rounded-full bg-muted",
            config.color
          )}>
            {config.icon}
          </div>
          
          <div className="text-center space-y-1">
            <p className={cn("text-lg font-medium", config.color)}>
              {config.label}
            </p>
            {call?.patientName && (
              <p className="text-muted-foreground">
                Calling {call.patientName}
              </p>
            )}
          </div>

          {status === 'in_progress' && (
            <div className="text-2xl font-mono tabular-nums">
              {formatTime(elapsedTime)}
            </div>
          )}

          {status === 'completed' && call?.duration_seconds && (
            <p className="text-muted-foreground">
              Duration: {formatTime(call.duration_seconds)}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
