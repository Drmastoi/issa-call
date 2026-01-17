import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Monitor, Smartphone, Globe, LogOut, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ActiveSession {
  id: string;
  device_info: string | null;
  ip_address: string | null;
  last_active_at: string;
  created_at: string;
}

function getDeviceIcon(deviceInfo: string | null) {
  if (!deviceInfo) return <Globe className="h-4 w-4" />;
  if (/mobile|android|iphone|ipad/i.test(deviceInfo)) {
    return <Smartphone className="h-4 w-4" />;
  }
  return <Monitor className="h-4 w-4" />;
}

export function ActiveSessions() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['active-sessions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('active_sessions')
        .select('*')
        .eq('user_id', user?.id)
        .order('last_active_at', { ascending: false });

      if (error) throw error;
      return data as ActiveSession[];
    },
    enabled: !!user,
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('active_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
      toast.success('Session terminated successfully');
    },
    onError: () => {
      toast.error('Failed to terminate session');
    },
  });

  const deleteAllSessionsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('active_sessions')
        .delete()
        .eq('user_id', user?.id);

      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success('All sessions terminated. You will be signed out.');
      await signOut();
    },
    onError: () => {
      toast.error('Failed to terminate sessions');
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>Manage your active sessions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Active Sessions</CardTitle>
          <CardDescription>Devices currently signed in to your account</CardDescription>
        </div>
        {sessions && sessions.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out from all devices?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will terminate all active sessions including your current one. You will need to sign in again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteAllSessionsMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Sign Out All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardHeader>
      <CardContent>
        {!sessions || sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No active sessions found.
          </p>
        ) : (
          <div className="space-y-4">
            {sessions.map((session, index) => (
              <div
                key={session.id}
                className="flex items-start justify-between p-4 rounded-lg border bg-card"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 text-muted-foreground">
                    {getDeviceIcon(session.device_info)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {session.device_info || 'Unknown Device'}
                      </span>
                      {index === 0 && (
                        <Badge variant="secondary" className="text-xs">
                          Current
                        </Badge>
                      )}
                    </div>
                    {session.ip_address && (
                      <p className="text-xs text-muted-foreground">
                        IP: {session.ip_address}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Last active: {formatDistanceToNow(new Date(session.last_active_at), { addSuffix: true })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Signed in: {format(new Date(session.created_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                </div>
                {index !== 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteSessionMutation.mutate(session.id)}
                    disabled={deleteSessionMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
