import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Shield, 
  Download, 
  Trash2, 
  FileText, 
  Database, 
  Clock,
  AlertTriangle 
} from 'lucide-react';
import { format } from 'date-fns';
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

interface ConsentLog {
  id: string;
  consent_type: string;
  policy_version: string;
  consented_at: string;
}

function getConsentIcon(type: string) {
  switch (type) {
    case 'privacy_policy':
      return <FileText className="h-4 w-4" />;
    case 'terms_of_service':
      return <Shield className="h-4 w-4" />;
    case 'data_processing':
      return <Database className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

function formatConsentType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function PrivacySettings() {
  const { user, signOut } = useAuth();
  const [isRequestingData, setIsRequestingData] = useState(false);

  const { data: consentLogs, isLoading } = useQuery({
    queryKey: ['consent-logs', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_consent_log')
        .select('*')
        .eq('user_id', user?.id)
        .order('consented_at', { ascending: false });

      if (error) throw error;
      return data as ConsentLog[];
    },
    enabled: !!user,
  });

  const requestDataExportMutation = useMutation({
    mutationFn: async () => {
      // In a real implementation, this would call an edge function
      // For now, we'll simulate the request
      setIsRequestingData(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      // Create a mock data export
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      const exportData = {
        profile,
        consentHistory: consentLogs,
        exportedAt: new Date().toISOString(),
        gdprArticle: 'Article 15 - Right of Access',
      };

      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-data-export-${format(new Date(), 'yyyy-MM-dd')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success('Your data has been exported successfully');
      setIsRequestingData(false);
    },
    onError: () => {
      toast.error('Failed to export data. Please try again.');
      setIsRequestingData(false);
    },
  });

  const requestAccountDeletionMutation = useMutation({
    mutationFn: async () => {
      // In a real implementation, this would submit a GDPR erasure request
      const { error } = await supabase
        .from('data_subject_requests')
        .insert({
          patient_id: null,
          request_type: 'erasure',
          status: 'pending',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Account deletion request submitted. We will process your request within 30 days.');
    },
    onError: () => {
      toast.error('Failed to submit deletion request. Please contact support.');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Data Rights Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Your Data Rights (GDPR)
          </CardTitle>
          <CardDescription>
            Exercise your rights under the General Data Protection Regulation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                <h4 className="font-medium">Export Your Data</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Download a copy of your personal data (Article 15 - Right of Access)
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => requestDataExportMutation.mutate()}
                disabled={isRequestingData}
              >
                {isRequestingData ? 'Preparing...' : 'Download My Data'}
              </Button>
            </div>

            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                <h4 className="font-medium">Delete Account</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Request permanent deletion of your account and data (Article 17 - Right to Erasure)
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    Request Deletion
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Delete Your Account?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. Your account and all associated data will be permanently deleted within 30 days. You will receive a confirmation email once the process is complete.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => requestAccountDeletionMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Yes, Delete My Account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consent History Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Consent History
          </CardTitle>
          <CardDescription>
            Record of your policy acceptances
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!consentLogs || consentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No consent records found.
            </p>
          ) : (
            <div className="space-y-3">
              {consentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-muted-foreground">
                      {getConsentIcon(log.consent_type)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {formatConsentType(log.consent_type)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Version {log.policy_version}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className="text-xs">
                      Accepted
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(log.consented_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Processing Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            How We Process Your Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Data We Collect</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Account information (name, email)</li>
              <li>Login activity and session data</li>
              <li>Audit logs for security and compliance</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Legal Basis</h4>
            <p className="text-sm text-muted-foreground">
              We process your data based on your consent and our legitimate interests in providing healthcare management services in compliance with NHS data protection standards.
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Data Retention</h4>
            <p className="text-sm text-muted-foreground">
              We retain your data for as long as your account is active. Audit logs are retained for 7 years for regulatory compliance.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
