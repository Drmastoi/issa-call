import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Monitor, Smartphone, Globe, CheckCircle, XCircle, LogOut, KeyRound } from 'lucide-react';
import { format } from 'date-fns';

interface LoginActivity {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  location_info: Record<string, unknown> | null;
  created_at: string;
}

function getDeviceIcon(userAgent: string | null) {
  if (!userAgent) return <Globe className="h-4 w-4" />;
  if (/mobile|android|iphone|ipad/i.test(userAgent)) {
    return <Smartphone className="h-4 w-4" />;
  }
  return <Monitor className="h-4 w-4" />;
}

function getEventBadge(eventType: string) {
  switch (eventType) {
    case 'login_success':
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Login Success</Badge>;
    case 'login_failed':
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Login Failed</Badge>;
    case 'logout':
      return <Badge variant="secondary"><LogOut className="h-3 w-3 mr-1" />Logout</Badge>;
    case 'password_reset':
      return <Badge variant="outline"><KeyRound className="h-3 w-3 mr-1" />Password Reset</Badge>;
    case 'signup':
      return <Badge variant="default" className="bg-blue-500"><CheckCircle className="h-3 w-3 mr-1" />Signup</Badge>;
    default:
      return <Badge variant="outline">{eventType}</Badge>;
  }
}

function getDeviceInfo(userAgent: string | null): string {
  if (!userAgent) return 'Unknown Device';
  
  // Simple browser/OS detection
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  
  if (/chrome/i.test(userAgent) && !/edge/i.test(userAgent)) browser = 'Chrome';
  else if (/firefox/i.test(userAgent)) browser = 'Firefox';
  else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
  else if (/edge/i.test(userAgent)) browser = 'Edge';
  
  if (/windows/i.test(userAgent)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(userAgent)) os = 'macOS';
  else if (/linux/i.test(userAgent) && !/android/i.test(userAgent)) os = 'Linux';
  else if (/android/i.test(userAgent)) os = 'Android';
  else if (/iphone|ipad/i.test(userAgent)) os = 'iOS';
  
  return `${browser} on ${os}`;
}

export function LoginActivityLog() {
  const { user } = useAuth();

  const { data: activities, isLoading } = useQuery({
    queryKey: ['login-activity', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('login_activity')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as LoginActivity[];
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Login Activity</CardTitle>
          <CardDescription>Recent login history</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Login Activity</CardTitle>
        <CardDescription>Your recent login history (last 30 days)</CardDescription>
      </CardHeader>
      <CardContent>
        {!activities || activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No login activity recorded yet.
          </p>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1 text-muted-foreground">
                    {getDeviceIcon(activity.user_agent)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getEventBadge(activity.event_type)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getDeviceInfo(activity.user_agent)}
                    </p>
                    {activity.ip_address && (
                      <p className="text-xs text-muted-foreground">
                        IP: {activity.ip_address}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>{format(new Date(activity.created_at), 'MMM d, yyyy')}</p>
                  <p>{format(new Date(activity.created_at), 'HH:mm')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
