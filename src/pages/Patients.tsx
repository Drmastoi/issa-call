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
import { useToast } from '@/hooks/use-toast';
import { Plus, Upload, Search, Trash2, Edit, FileSpreadsheet, Phone, Loader2, Activity } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { CallStatusMonitor } from '@/components/CallStatusMonitor';
import { HealthMetricsSummary } from '@/components/HealthMetricsSummary';

interface Patient {
  id: string;
  name: string;
  phone_number: string;
  nhs_number: string | null;
  preferred_call_time: string | null;
  notes: string | null;
  created_at: string;
}

export default function Patients() {
  const [search, setSearch] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [callingPatientId, setCallingPatientId] = useState<string | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [activeCallPatientName, setActiveCallPatientName] = useState<string | undefined>(undefined);
  const [metricsPatient, setMetricsPatient] = useState<Patient | null>(null);
  const { user } = useAuth();
  const { logAction } = useAuditLog();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: patients, isLoading } = useQuery({
    queryKey: ['patients', search],
    queryFn: async () => {
      let query = supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (search) {
        query = query.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%,nhs_number.ilike.%${search}%`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Patient[];
    },
  });

  const addPatientMutation = useMutation({
    mutationFn: async (patient: { name: string; phone_number: string; nhs_number?: string | null; preferred_call_time?: string | null; notes?: string | null }) => {
      const { data, error } = await supabase
        .from('patients')
        .insert({ ...patient, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      logAction('create', 'patient', data.id, { name: data.name });
      toast({ title: 'Patient added successfully' });
      setAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to add patient', description: error.message });
    },
  });

  const updatePatientMutation = useMutation({
    mutationFn: async (patient: Partial<Patient> & { id: string }) => {
      const { data, error } = await supabase
        .from('patients')
        .update(patient)
        .eq('id', patient.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      logAction('update', 'patient', data.id, { name: data.name });
      toast({ title: 'Patient updated successfully' });
      setEditingPatient(null);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update patient', description: error.message });
    },
  });

  const deletePatientMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('patients').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      logAction('delete', 'patient', id);
      toast({ title: 'Patient deleted' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to delete patient', description: error.message });
    },
  });

  const testCallMutation = useMutation({
    mutationFn: async (patient: Patient) => {
      setCallingPatientId(patient.id);
      setActiveCallPatientName(patient.name);
      
      // First create a call record
      const { data: callData, error: callError } = await supabase
        .from('calls')
        .insert({
          patient_id: patient.id,
          status: 'pending',
          attempt_number: 1,
        })
        .select()
        .single();
      
      if (callError) throw callError;

      // Set active call ID to show monitor
      setActiveCallId(callData.id);

      // Then initiate the call
      const { data, error } = await supabase.functions.invoke('initiate-call', {
        body: {
          callId: callData.id,
          patientId: patient.id,
          patientName: patient.name,
          phoneNumber: patient.phone_number,
        },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calls'] });
      logAction('test_call', 'call', callingPatientId ?? undefined);
      toast({ 
        title: 'Call initiated', 
        description: 'The call is now in progress.' 
      });
      setCallingPatientId(null);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to initiate call', description: error.message });
      setCallingPatientId(null);
      setActiveCallId(null);
      setActiveCallPatientName(undefined);
    },
  });

  const batchUploadMutation = useMutation({
    mutationFn: async (patients: { name: string; phone_number: string; nhs_number?: string | null; preferred_call_time?: string | null }[]) => {
      const { data, error } = await supabase
        .from('patients')
        .insert(patients.map(p => ({ name: p.name, phone_number: p.phone_number, nhs_number: p.nhs_number, preferred_call_time: p.preferred_call_time, created_by: user?.id })))
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      logAction('batch_upload', 'patient', undefined, { count: data.length });
      toast({ title: `${data.length} patients uploaded successfully` });
      setUploadDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to upload patients', description: error.message });
    },
  });

  const handleAddPatient = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    addPatientMutation.mutate({
      name: formData.get('name') as string,
      phone_number: formData.get('phone_number') as string,
      nhs_number: formData.get('nhs_number') as string || null,
      preferred_call_time: formData.get('preferred_call_time') as string || null,
      notes: formData.get('notes') as string || null,
    });
  };

  const handleUpdatePatient = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingPatient) return;
    const formData = new FormData(e.currentTarget);
    updatePatientMutation.mutate({
      id: editingPatient.id,
      name: formData.get('name') as string,
      phone_number: formData.get('phone_number') as string,
      nhs_number: formData.get('nhs_number') as string || null,
      preferred_call_time: formData.get('preferred_call_time') as string || null,
      notes: formData.get('notes') as string || null,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header row
      const dataLines = lines.slice(1);
      const patients: { name: string; phone_number: string; nhs_number?: string | null; preferred_call_time?: string | null }[] = [];
      const errors: string[] = [];

      dataLines.forEach((line, index) => {
        const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        if (values.length >= 2) {
          const name = values[0];
          const phone = values[1];
          
          if (name && phone) {
            patients.push({
              name,
              phone_number: phone,
              nhs_number: values[2] || null,
              preferred_call_time: values[3] || null,
            });
          } else {
            errors.push(`Row ${index + 2}: Missing name or phone number`);
          }
        }
      });

      if (errors.length > 0) {
        toast({
          variant: 'destructive',
          title: 'Some rows had errors',
          description: errors.slice(0, 3).join(', ') + (errors.length > 3 ? `... and ${errors.length - 3} more` : ''),
        });
      }

      if (patients.length > 0) {
        batchUploadMutation.mutate(patients);
      } else {
        toast({
          variant: 'destructive',
          title: 'No valid patients found',
          description: 'Please check your CSV format',
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
    <CallStatusMonitor
      callId={activeCallId}
      patientName={activeCallPatientName}
      onClose={() => {
        setActiveCallId(null);
        setActiveCallPatientName(undefined);
      }}
    />
    {metricsPatient && (
      <HealthMetricsSummary
        patientId={metricsPatient.id}
        patientName={metricsPatient.name}
        isOpen={!!metricsPatient}
        onClose={() => setMetricsPatient(null)}
      />
    )}
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Patients</h1>
          <p className="text-muted-foreground mt-1">Manage your patient database</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Batch Upload
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Batch Upload Patients</DialogTitle>
                <DialogDescription>
                  Upload a CSV file with patient data. Required columns: Name, Phone Number.
                  Optional: NHS Number, Preferred Call Time.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Card className="border-dashed">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center gap-4">
                      <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
                      <div className="text-center">
                        <p className="text-sm font-medium">Upload CSV File</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Format: Name, Phone, NHS Number (optional), Preferred Time (optional)
                        </p>
                      </div>
                      <Input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="max-w-xs"
                      />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Example CSV Format</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
{`Name,Phone Number,NHS Number,Preferred Time
John Smith,07700900123,1234567890,Morning
Jane Doe,07700900456,,Afternoon`}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Patient
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Patient</DialogTitle>
                <DialogDescription>Enter the patient's details below.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddPatient}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input id="name" name="name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone_number">Phone Number *</Label>
                    <Input id="phone_number" name="phone_number" type="tel" placeholder="+44 7700 900123" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nhs_number">NHS Number</Label>
                    <Input id="nhs_number" name="nhs_number" placeholder="Optional" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preferred_call_time">Preferred Call Time</Label>
                    <Input id="preferred_call_time" name="preferred_call_time" placeholder="e.g., Morning, 10am-12pm" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" name="notes" placeholder="Any additional notes..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={addPatientMutation.isPending}>
                    {addPatientMutation.isPending ? 'Adding...' : 'Add Patient'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone number, or NHS number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Patients Table */}
      <Card>
        <CardHeader>
          <CardTitle>Patient List</CardTitle>
          <CardDescription>
            {patients?.length ?? 0} patients in database
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : patients && patients.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>NHS Number</TableHead>
                  <TableHead>Preferred Time</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell className="font-medium">{patient.name}</TableCell>
                    <TableCell>{patient.phone_number}</TableCell>
                    <TableCell>{patient.nhs_number || '-'}</TableCell>
                    <TableCell>{patient.preferred_call_time || '-'}</TableCell>
                    <TableCell>
                      {new Date(patient.created_at).toLocaleDateString('en-GB')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setMetricsPatient(patient)}
                          title="View health metrics"
                        >
                          <Activity className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => testCallMutation.mutate(patient)}
                          disabled={callingPatientId === patient.id}
                          title="Test call"
                        >
                          {callingPatientId === patient.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Phone className="h-4 w-4 text-primary" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingPatient(patient)}
                          title="Edit patient"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deletePatientMutation.mutate(patient.id)}
                          title="Delete patient"
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
              No patients found. Add your first patient or upload a CSV file.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Patient Dialog */}
      <Dialog open={!!editingPatient} onOpenChange={() => setEditingPatient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Patient</DialogTitle>
            <DialogDescription>Update the patient's details.</DialogDescription>
          </DialogHeader>
          {editingPatient && (
            <form onSubmit={handleUpdatePatient}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Full Name *</Label>
                  <Input id="edit-name" name="name" defaultValue={editingPatient.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone_number">Phone Number *</Label>
                  <Input id="edit-phone_number" name="phone_number" type="tel" defaultValue={editingPatient.phone_number} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-nhs_number">NHS Number</Label>
                  <Input id="edit-nhs_number" name="nhs_number" defaultValue={editingPatient.nhs_number ?? ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-preferred_call_time">Preferred Call Time</Label>
                  <Input id="edit-preferred_call_time" name="preferred_call_time" defaultValue={editingPatient.preferred_call_time ?? ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-notes">Notes</Label>
                  <Textarea id="edit-notes" name="notes" defaultValue={editingPatient.notes ?? ''} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={updatePatientMutation.isPending}>
                  {updatePatientMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
