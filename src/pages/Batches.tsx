import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Calendar, Users, Play, Pause, Trash2, Eye, Pencil, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Batch {
  id: string;
  name: string;
  scheduled_date: string;
  scheduled_time_start: string;
  scheduled_time_end: string;
  status: string;
  retry_attempts: number;
  created_at: string;
}

interface Patient {
  id: string;
  name: string;
  phone_number: string;
}

export default function Batches() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewBatchId, setViewBatchId] = useState<string | null>(null);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [selectedPatients, setSelectedPatients] = useState<string[]>([]);
  const [editSelectedPatients, setEditSelectedPatients] = useState<string[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [removePatientId, setRemovePatientId] = useState<string | null>(null);
  const { user } = useAuth();
  const { logAction } = useAuditLog();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: batches, isLoading } = useQuery({
    queryKey: ['batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_batches')
        .select('*')
        .order('scheduled_date', { ascending: false });
      if (error) throw error;
      return data as Batch[];
    },
  });

  const { data: patients } = useQuery({
    queryKey: ['patients-for-batch'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, phone_number')
        .order('name');
      if (error) throw error;
      return data as Patient[];
    },
  });

  const { data: batchPatients, refetch: refetchBatchPatients } = useQuery({
    queryKey: ['batch-patients', viewBatchId],
    enabled: !!viewBatchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('batch_patients')
        .select(`
          id,
          priority,
          patient_id,
          patients (id, name, phone_number)
        `)
        .eq('batch_id', viewBatchId);
      if (error) throw error;
      return data;
    },
  });

  const createBatchMutation = useMutation({
    mutationFn: async (batch: { name: string; scheduled_date: string; scheduled_time_start: string; scheduled_time_end: string; patientIds: string[] }) => {
      const { data: batchData, error: batchError } = await supabase
        .from('call_batches')
        .insert({
          name: batch.name,
          scheduled_date: batch.scheduled_date,
          scheduled_time_start: batch.scheduled_time_start,
          scheduled_time_end: batch.scheduled_time_end,
          created_by: user?.id,
        })
        .select()
        .single();
      
      if (batchError) throw batchError;

      if (batch.patientIds.length > 0) {
        const { error: patientsError } = await supabase
          .from('batch_patients')
          .insert(
            batch.patientIds.map((patientId, index) => ({
              batch_id: batchData.id,
              patient_id: patientId,
              priority: index,
            }))
          );
        if (patientsError) throw patientsError;
      }

      return batchData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      logAction('create', 'batch', data.id, { name: data.name, patients: selectedPatients.length });
      toast({ title: 'Batch created successfully' });
      setCreateDialogOpen(false);
      setSelectedPatients([]);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to create batch', description: error.message });
    },
  });

  const updateBatchMutation = useMutation({
    mutationFn: async (batch: { id: string; name: string; scheduled_date: string; scheduled_time_start: string; scheduled_time_end: string; retry_attempts: number; patientIds: string[] }) => {
      const { error: updateError } = await supabase
        .from('call_batches')
        .update({
          name: batch.name,
          scheduled_date: batch.scheduled_date,
          scheduled_time_start: batch.scheduled_time_start,
          scheduled_time_end: batch.scheduled_time_end,
          retry_attempts: batch.retry_attempts,
        })
        .eq('id', batch.id);
      
      if (updateError) throw updateError;

      // Get current patients in batch
      const { data: currentPatients } = await supabase
        .from('batch_patients')
        .select('patient_id')
        .eq('batch_id', batch.id);
      
      const currentPatientIds = currentPatients?.map(p => p.patient_id) ?? [];
      const toAdd = batch.patientIds.filter(id => !currentPatientIds.includes(id));
      const toRemove = currentPatientIds.filter(id => !batch.patientIds.includes(id));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('batch_patients')
          .delete()
          .eq('batch_id', batch.id)
          .in('patient_id', toRemove);
        if (error) throw error;
      }

      if (toAdd.length > 0) {
        const maxPriority = currentPatients?.length ?? 0;
        const { error } = await supabase
          .from('batch_patients')
          .insert(
            toAdd.map((patientId, index) => ({
              batch_id: batch.id,
              patient_id: patientId,
              priority: maxPriority + index,
            }))
          );
        if (error) throw error;
      }

      return batch;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['batch-patients'] });
      logAction('update', 'batch', data.id, { name: data.name });
      toast({ title: 'Batch updated successfully' });
      setEditDialogOpen(false);
      setEditingBatch(null);
      setEditSelectedPatients([]);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update batch', description: error.message });
    },
  });

  const startBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const { data, error } = await supabase.functions.invoke('process-batch', {
        body: { batchId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, batchId) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      logAction('start_calls', 'batch', batchId);
      toast({ title: 'Batch calls started', description: 'Calls are being initiated in the background.' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to start batch calls', description: error.message });
    },
  });

  const updateBatchStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('call_batches')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      return { id, status };
    },
    onSuccess: ({ id, status }) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      logAction('update_status', 'batch', id, { status });
      toast({ title: `Batch ${status === 'cancelled' ? 'cancelled' : 'updated'}` });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update batch', description: error.message });
    },
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (id: string) => {
      // First delete batch_patients
      const { error: bpError } = await supabase.from('batch_patients').delete().eq('batch_id', id);
      if (bpError) throw bpError;
      
      const { error } = await supabase.from('call_batches').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      logAction('delete', 'batch', id);
      toast({ title: 'Batch deleted' });
      setDeleteConfirmId(null);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to delete batch', description: error.message });
    },
  });

  const removePatientFromBatchMutation = useMutation({
    mutationFn: async (batchPatientId: string) => {
      const { error } = await supabase
        .from('batch_patients')
        .delete()
        .eq('id', batchPatientId);
      if (error) throw error;
      return batchPatientId;
    },
    onSuccess: () => {
      refetchBatchPatients();
      toast({ title: 'Patient removed from batch' });
      setRemovePatientId(null);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to remove patient', description: error.message });
    },
  });

  const handleCreateBatch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createBatchMutation.mutate({
      name: formData.get('name') as string,
      scheduled_date: formData.get('scheduled_date') as string,
      scheduled_time_start: formData.get('scheduled_time_start') as string,
      scheduled_time_end: formData.get('scheduled_time_end') as string,
      patientIds: selectedPatients,
    });
  };

  const handleEditBatch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingBatch) return;
    const formData = new FormData(e.currentTarget);
    updateBatchMutation.mutate({
      id: editingBatch.id,
      name: formData.get('name') as string,
      scheduled_date: formData.get('scheduled_date') as string,
      scheduled_time_start: formData.get('scheduled_time_start') as string,
      scheduled_time_end: formData.get('scheduled_time_end') as string,
      retry_attempts: parseInt(formData.get('retry_attempts') as string) || 3,
      patientIds: editSelectedPatients,
    });
  };

  const openEditDialog = async (batch: Batch) => {
    setEditingBatch(batch);
    // Load current patients for this batch
    const { data } = await supabase
      .from('batch_patients')
      .select('patient_id')
      .eq('batch_id', batch.id);
    setEditSelectedPatients(data?.map(p => p.patient_id) ?? []);
    setEditDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary',
      in_progress: 'default',
      completed: 'outline',
      cancelled: 'destructive',
    };
    return (
      <Badge variant={variants[status] ?? 'secondary'}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const viewingBatch = batches?.find(b => b.id === viewBatchId);
  const deletingBatch = batches?.find(b => b.id === deleteConfirmId);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Call Batches</h1>
          <p className="text-muted-foreground mt-1">Schedule and manage patient call batches</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Batch
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Batch</DialogTitle>
              <DialogDescription>
                Schedule a batch of patient calls. Select patients and set the calling window.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateBatch}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Batch Name *</Label>
                  <Input id="name" name="name" placeholder="e.g., Monday Morning Calls" required />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="scheduled_date">Date *</Label>
                    <Input 
                      id="scheduled_date" 
                      name="scheduled_date" 
                      type="date" 
                      min={new Date().toISOString().split('T')[0]}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheduled_time_start">Start Time *</Label>
                    <Input id="scheduled_time_start" name="scheduled_time_start" type="time" defaultValue="09:00" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheduled_time_end">End Time *</Label>
                    <Input id="scheduled_time_end" name="scheduled_time_end" type="time" defaultValue="17:00" required />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Select Patients ({selectedPatients.length} selected)</Label>
                  <Card>
                    <div className="p-4 pb-2 border-b">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="select-all-create"
                          checked={patients && patients.length > 0 && selectedPatients.length === patients.length}
                          onCheckedChange={(checked) => {
                            if (checked && patients) {
                              setSelectedPatients(patients.map(p => p.id));
                            } else {
                              setSelectedPatients([]);
                            }
                          }}
                        />
                        <label htmlFor="select-all-create" className="cursor-pointer font-medium">
                          Select All
                        </label>
                      </div>
                    </div>
                    <ScrollArea className="h-48">
                      <div className="p-4 space-y-2">
                        {patients?.map((patient) => (
                          <div key={patient.id} className="flex items-center space-x-3 p-2 hover:bg-muted rounded-md">
                            <Checkbox
                              id={patient.id}
                              checked={selectedPatients.includes(patient.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedPatients([...selectedPatients, patient.id]);
                                } else {
                                  setSelectedPatients(selectedPatients.filter(id => id !== patient.id));
                                }
                              }}
                            />
                            <label htmlFor={patient.id} className="flex-1 cursor-pointer">
                              <span className="font-medium">{patient.name}</span>
                              <span className="text-sm text-muted-foreground ml-2">{patient.phone_number}</span>
                            </label>
                          </div>
                        ))}
                        {!patients?.length && (
                          <p className="text-center text-muted-foreground py-4">
                            No patients available. Add patients first.
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </Card>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createBatchMutation.isPending || selectedPatients.length === 0}>
                  {createBatchMutation.isPending ? 'Creating...' : 'Create Batch'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Batches Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Batches</CardTitle>
          <CardDescription>
            {batches?.length ?? 0} batches created
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : batches && batches.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Scheduled Date</TableHead>
                  <TableHead>Time Window</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Retry Attempts</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">{batch.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {new Date(batch.scheduled_date).toLocaleDateString('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {batch.scheduled_time_start.slice(0, 5)} - {batch.scheduled_time_end.slice(0, 5)}
                    </TableCell>
                    <TableCell>{getStatusBadge(batch.status)}</TableCell>
                    <TableCell>{batch.retry_attempts}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setViewBatchId(batch.id)}
                          title="View batch"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {batch.status === 'pending' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(batch)}
                              title="Edit batch"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startBatchMutation.mutate(batch.id)}
                              disabled={startBatchMutation.isPending}
                              title="Start calls"
                            >
                              <Play className="h-4 w-4 text-green-600" />
                            </Button>
                          </>
                        )}
                        {batch.status === 'in_progress' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => updateBatchStatusMutation.mutate({ id: batch.id, status: 'cancelled' })}
                            title="Cancel batch"
                          >
                            <Pause className="h-4 w-4 text-orange-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirmId(batch.id)}
                          title="Delete batch"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No batches created yet. Create your first batch to start scheduling calls.
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Batch Dialog */}
      <Dialog open={!!viewBatchId} onOpenChange={() => setViewBatchId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewingBatch?.name}</DialogTitle>
            <DialogDescription>
              Scheduled for {viewingBatch && new Date(viewingBatch.scheduled_date).toLocaleDateString('en-GB')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Patients in this batch
            </h4>
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
                      {viewingBatch?.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setRemovePatientId(bp.id)}
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
              <p className="text-muted-foreground text-center py-4">No patients in this batch</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Batch Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditingBatch(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Batch</DialogTitle>
            <DialogDescription>
              Update the batch details and patient assignments.
            </DialogDescription>
          </DialogHeader>
          {editingBatch && (
            <form onSubmit={handleEditBatch}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Batch Name *</Label>
                  <Input id="edit-name" name="name" defaultValue={editingBatch.name} required />
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-scheduled_date">Date *</Label>
                    <Input 
                      id="edit-scheduled_date" 
                      name="scheduled_date" 
                      type="date" 
                      defaultValue={editingBatch.scheduled_date}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-scheduled_time_start">Start Time *</Label>
                    <Input 
                      id="edit-scheduled_time_start" 
                      name="scheduled_time_start" 
                      type="time" 
                      defaultValue={editingBatch.scheduled_time_start.slice(0, 5)} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-scheduled_time_end">End Time *</Label>
                    <Input 
                      id="edit-scheduled_time_end" 
                      name="scheduled_time_end" 
                      type="time" 
                      defaultValue={editingBatch.scheduled_time_end.slice(0, 5)} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-retry_attempts">Retry Attempts</Label>
                    <Input 
                      id="edit-retry_attempts" 
                      name="retry_attempts" 
                      type="number" 
                      min="0"
                      max="10"
                      defaultValue={editingBatch.retry_attempts} 
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Select Patients ({editSelectedPatients.length} selected)</Label>
                  <Card>
                    <div className="p-4 pb-2 border-b">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="select-all-edit"
                          checked={patients && patients.length > 0 && editSelectedPatients.length === patients.length}
                          onCheckedChange={(checked) => {
                            if (checked && patients) {
                              setEditSelectedPatients(patients.map(p => p.id));
                            } else {
                              setEditSelectedPatients([]);
                            }
                          }}
                        />
                        <label htmlFor="select-all-edit" className="cursor-pointer font-medium">
                          Select All
                        </label>
                      </div>
                    </div>
                    <ScrollArea className="h-48">
                      <div className="p-4 space-y-2">
                        {patients?.map((patient) => (
                          <div key={patient.id} className="flex items-center space-x-3 p-2 hover:bg-muted rounded-md">
                            <Checkbox
                              id={`edit-${patient.id}`}
                              checked={editSelectedPatients.includes(patient.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setEditSelectedPatients([...editSelectedPatients, patient.id]);
                                } else {
                                  setEditSelectedPatients(editSelectedPatients.filter(id => id !== patient.id));
                                }
                              }}
                            />
                            <label htmlFor={`edit-${patient.id}`} className="flex-1 cursor-pointer">
                              <span className="font-medium">{patient.name}</span>
                              <span className="text-sm text-muted-foreground ml-2">{patient.phone_number}</span>
                            </label>
                          </div>
                        ))}
                        {!patients?.length && (
                          <p className="text-center text-muted-foreground py-4">
                            No patients available.
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </Card>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateBatchMutation.isPending}>
                  {updateBatchMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingBatch?.name}"? This will also remove all patient assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteBatchMutation.mutate(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBatchMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Patient Confirmation Dialog */}
      <AlertDialog open={!!removePatientId} onOpenChange={() => setRemovePatientId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Patient from Batch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this patient from the batch?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removePatientId && removePatientFromBatchMutation.mutate(removePatientId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removePatientFromBatchMutation.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
