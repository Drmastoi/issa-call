import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Shield, CheckCircle, XCircle, Clock, FileText, Users, Activity, AlertTriangle } from 'lucide-react';

interface DataSharingRequest {
  id: string;
  requested_by: string;
  patient_id: string;
  request_type: string;
  recipient_organization: string;
  purpose: string;
  data_categories: string[];
  legal_basis: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  expires_at: string | null;
  created_at: string;
}

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface PatientAccessLog {
  id: string;
  patient_id: string | null;
  user_id: string | null;
  access_type: string;
  accessed_fields: string[] | null;
  created_at: string | null;
}

export default function CaldicottDashboard() {
  const { user } = useAuth();
  const { isCaldicottGuardian, loading: roleLoading } = useUserRole();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<DataSharingRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');

  // Fetch pending data sharing requests
  const { data: pendingRequests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['data-sharing-requests', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_sharing_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as DataSharingRequest[];
    },
    enabled: isCaldicottGuardian,
  });

  // Fetch all requests for history
  const { data: allRequests = [] } = useQuery({
    queryKey: ['data-sharing-requests', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_sharing_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as DataSharingRequest[];
    },
    enabled: isCaldicottGuardian,
  });

  // Fetch audit logs
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      return data as AuditLog[];
    },
    enabled: isCaldicottGuardian,
  });

  // Fetch patient access logs
  const { data: accessLogs = [] } = useQuery({
    queryKey: ['patient-access-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patient_access_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      return data as PatientAccessLog[];
    },
    enabled: isCaldicottGuardian,
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, decision, notes }: { requestId: string; decision: string; notes: string }) => {
      const { data, error } = await supabase.rpc('review_data_sharing_request', {
        p_request_id: requestId,
        p_decision: decision,
        p_notes: notes,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-sharing-requests'] });
      toast.success(`Request ${reviewAction === 'approved' ? 'approved' : 'rejected'} successfully`);
      setReviewDialogOpen(false);
      setSelectedRequest(null);
      setReviewNotes('');
    },
    onError: (error) => {
      toast.error('Failed to review request: ' + error.message);
    },
  });

  const handleReview = (request: DataSharingRequest, action: 'approved' | 'rejected') => {
    setSelectedRequest(request);
    setReviewAction(action);
    setReviewDialogOpen(true);
  };

  const submitReview = () => {
    if (!selectedRequest) return;
    reviewMutation.mutate({
      requestId: selectedRequest.id,
      decision: reviewAction,
      notes: reviewNotes,
    });
  };

  const getRequestTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      external_share: 'bg-blue-100 text-blue-800',
      research: 'bg-purple-100 text-purple-800',
      third_party: 'bg-orange-100 text-orange-800',
      clinical_handover: 'bg-green-100 text-green-800',
    };
    return <Badge className={colors[type] || 'bg-muted'}>{type.replace('_', ' ')}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      approved: 'default',
      rejected: 'destructive',
      expired: 'secondary',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isCaldicottGuardian) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Shield className="h-16 w-16 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Access Restricted</h1>
        <p className="text-muted-foreground">
          This page is only accessible to Caldicott Guardians.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Caldicott Guardian Dashboard</h1>
          <p className="text-muted-foreground">
            Data sharing oversight and compliance monitoring
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingRequests.length}</div>
            <p className="text-xs text-muted-foreground">Awaiting review</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Approved (30d)</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allRequests.filter(r => r.status === 'approved').length}
            </div>
            <p className="text-xs text-muted-foreground">Data sharing approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Rejected (30d)</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allRequests.filter(r => r.status === 'rejected').length}
            </div>
            <p className="text-xs text-muted-foreground">Requests denied</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Access Events</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accessLogs.length}</div>
            <p className="text-xs text-muted-foreground">Patient record accesses</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            Pending Requests
            {pendingRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Request History</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          <TabsTrigger value="access">Access Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-lg font-medium">No pending requests</p>
                <p className="text-muted-foreground">All data sharing requests have been reviewed</p>
              </CardContent>
            </Card>
          ) : (
            pendingRequests.map((request) => (
              <Card key={request.id} className="border-l-4 border-l-orange-400">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getRequestTypeBadge(request.request_type)}
                      <CardTitle className="text-lg">{request.recipient_organization}</CardTitle>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(request.created_at), 'PPp')}
                    </span>
                  </div>
                  <CardDescription>{request.purpose}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Legal Basis:</span>
                      <p className="text-muted-foreground">{request.legal_basis}</p>
                    </div>
                    <div>
                      <span className="font-medium">Data Categories:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {request.data_categories.map((cat) => (
                          <Badge key={cat} variant="outline" className="text-xs">{cat}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => handleReview(request, 'rejected')}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                    <Button onClick={() => handleReview(request, 'approved')}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Request History</CardTitle>
              <CardDescription>All data sharing requests and their outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {allRequests.map((request) => (
                    <div key={request.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {getRequestTypeBadge(request.request_type)}
                        <div>
                          <p className="font-medium">{request.recipient_organization}</p>
                          <p className="text-sm text-muted-foreground">{request.purpose}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {getStatusBadge(request.status)}
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(request.created_at), 'PP')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>System Audit Trail</CardTitle>
              <CardDescription>All system actions and compliance events</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 border rounded-lg">
                      <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">{log.action}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(log.created_at), 'PPp')}
                          </span>
                        </div>
                        <p className="text-sm mt-1">
                          <span className="font-medium">{log.entity_type}</span>
                          {log.entity_id && <span className="text-muted-foreground"> • {log.entity_id}</span>}
                        </p>
                        {log.details && (
                          <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access">
          <Card>
            <CardHeader>
              <CardTitle>Patient Access Logs</CardTitle>
              <CardDescription>Track who accessed patient records and when (ICO/CQC Regulation 17)</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {accessLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 border rounded-lg">
                      <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <Badge 
                            variant={log.access_type === 'delete' ? 'destructive' : 'outline'}
                          >
                            {log.access_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {log.created_at && format(new Date(log.created_at), 'PPp')}
                          </span>
                        </div>
                        <p className="text-sm mt-1">
                          <span className="font-medium">Patient:</span>{' '}
                          <span className="text-muted-foreground">{log.patient_id?.slice(0, 8)}...</span>
                        </p>
                        {log.accessed_fields && log.accessed_fields.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {log.accessed_fields.map((field) => (
                              <Badge key={field} variant="secondary" className="text-xs">{field}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approved' ? 'Approve' : 'Reject'} Data Sharing Request
            </DialogTitle>
            <DialogDescription>
              {reviewAction === 'approved'
                ? 'Confirm approval for data sharing with ' + selectedRequest?.recipient_organization
                : 'Provide reason for rejecting this request'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedRequest && (
              <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                <p><strong>Type:</strong> {selectedRequest.request_type}</p>
                <p><strong>Purpose:</strong> {selectedRequest.purpose}</p>
                <p><strong>Legal Basis:</strong> {selectedRequest.legal_basis}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Review Notes</label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={reviewAction === 'approved' 
                  ? 'Add any conditions or notes for this approval...'
                  : 'Explain why this request is being rejected...'}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={reviewAction === 'approved' ? 'default' : 'destructive'}
              onClick={submitReview}
              disabled={reviewMutation.isPending}
            >
              {reviewMutation.isPending ? 'Processing...' : `Confirm ${reviewAction === 'approved' ? 'Approval' : 'Rejection'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
