import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { FileText, Loader2, CheckCircle2, AlertCircle, X, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface ExtractedPatient {
  id: string;
  fileName: string;
  name: string | null;
  phone_number: string | null;
  nhs_number: string | null;
  status: 'pending' | 'extracting' | 'success' | 'error';
  error?: string;
  selected: boolean;
}

interface PDFPatientUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PDFPatientUpload({ open, onOpenChange }: PDFPatientUploadProps) {
  const [patients, setPatients] = useState<ExtractedPatient[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { logAction } = useAuditLog();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const addPatientsMutation = useMutation({
    mutationFn: async (patientsToAdd: { name: string; phone_number: string; nhs_number?: string | null }[]) => {
      const { data, error } = await supabase
        .from('patients')
        .insert(patientsToAdd.map(p => ({ ...p, created_by: user?.id })))
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      data.forEach(patient => {
        logAction('create', 'patient', patient.id, { name: patient.name, source: 'pdf_batch_upload' });
      });
      toast({ title: `${data.length} patient(s) added successfully` });
      handleClose();
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to add patients', description: error.message });
    },
  });

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: unknown) => (item as { str: string }).str)
        .join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  };

  const processFile = async (file: File, id: string): Promise<Partial<ExtractedPatient>> => {
    try {
      const pdfText = await extractTextFromPDF(file);
      
      if (pdfText.trim().length < 10) {
        return { status: 'error', error: 'Could not extract text from PDF' };
      }

      const { data, error } = await supabase.functions.invoke('extract-patient-from-pdf', {
        body: { pdfText },
      });

      if (error) throw error;

      if (data.success && data.data) {
        return {
          name: data.data.name,
          phone_number: data.data.phone_number,
          nhs_number: data.data.nhs_number,
          status: 'success',
          selected: !!(data.data.name && data.data.phone_number),
        };
      } else {
        return { status: 'error', error: data.error || 'Extraction failed' };
      }
    } catch (error) {
      return { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const invalidFiles = files.filter(f => f.type !== 'application/pdf');
    if (invalidFiles.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: `${invalidFiles.length} file(s) skipped - only PDF files are accepted`,
      });
    }

    const pdfFiles = files.filter(f => f.type === 'application/pdf');
    if (pdfFiles.length === 0) return;

    // Initialize patient entries
    const initialPatients: ExtractedPatient[] = pdfFiles.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      fileName: file.name,
      name: null,
      phone_number: null,
      nhs_number: null,
      status: 'pending',
      selected: false,
    }));

    setPatients(prev => [...prev, ...initialPatients]);
    setIsProcessing(true);
    setProcessedCount(0);

    // Process files sequentially to avoid rate limiting
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      const patientId = initialPatients[i].id;

      // Update status to extracting
      setPatients(prev => prev.map(p => 
        p.id === patientId ? { ...p, status: 'extracting' } : p
      ));

      const result = await processFile(file, patientId);

      // Update with result
      setPatients(prev => prev.map(p => 
        p.id === patientId ? { ...p, ...result } : p
      ));

      setProcessedCount(i + 1);
    }

    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    toast({
      title: 'Processing complete',
      description: `${pdfFiles.length} PDF(s) processed`,
    });
  };

  const handlePatientEdit = (id: string, field: keyof ExtractedPatient, value: string | boolean) => {
    setPatients(prev => prev.map(p => 
      p.id === id ? { ...p, [field]: value || null } : p
    ));
  };

  const handleRemovePatient = (id: string) => {
    setPatients(prev => prev.filter(p => p.id !== id));
  };

  const handleSelectAll = (checked: boolean) => {
    setPatients(prev => prev.map(p => ({
      ...p,
      selected: p.status === 'success' && !!p.name && !!p.phone_number ? checked : false
    })));
  };

  const handleAddSelectedPatients = () => {
    const selectedPatients = patients.filter(p => 
      p.selected && p.name && p.phone_number
    );

    if (selectedPatients.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No patients selected',
        description: 'Please select at least one patient with valid data',
      });
      return;
    }

    addPatientsMutation.mutate(
      selectedPatients.map(p => ({
        name: p.name!,
        phone_number: p.phone_number!,
        nhs_number: p.nhs_number,
      }))
    );
  };

  const handleClose = () => {
    setPatients([]);
    setIsProcessing(false);
    setProcessedCount(0);
    onOpenChange(false);
  };

  const successfulPatients = patients.filter(p => p.status === 'success');
  const selectedCount = patients.filter(p => p.selected).length;
  const validSelectedCount = patients.filter(p => p.selected && p.name && p.phone_number).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Batch Upload PDF Summaries</DialogTitle>
          <DialogDescription>
            Upload multiple patient summary PDFs. AI will extract patient information from each file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Area */}
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {isProcessing ? 'Processing PDFs...' : 'Upload Patient Summary PDFs'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select multiple PDF files to process at once
                  </p>
                </div>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={handleFileUpload}
                  disabled={isProcessing}
                  className="max-w-xs"
                />
              </div>
            </CardContent>
          </Card>

          {/* Progress Bar */}
          {isProcessing && patients.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing...</span>
                <span>{processedCount} / {patients.filter(p => p.status !== 'success' && p.status !== 'error').length + processedCount}</span>
              </div>
              <Progress value={(processedCount / patients.length) * 100} />
            </div>
          )}

          {/* Patients List */}
          {patients.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={successfulPatients.length > 0 && successfulPatients.every(p => p.selected)}
                    onCheckedChange={handleSelectAll}
                    disabled={successfulPatients.length === 0}
                  />
                  <Label className="text-sm font-medium">
                    Select all ({selectedCount} selected)
                  </Label>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">{patients.length} total</Badge>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {successfulPatients.length} extracted
                  </Badge>
                </div>
              </div>

              <ScrollArea className="h-[300px] rounded-md border p-3">
                <div className="space-y-3">
                  {patients.map((patient) => (
                    <Card key={patient.id} className={`relative ${patient.status === 'error' ? 'border-destructive/50' : ''}`}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          {patient.status === 'success' && (
                            <Checkbox
                              checked={patient.selected}
                              onCheckedChange={(checked) => handlePatientEdit(patient.id, 'selected', !!checked)}
                              disabled={!patient.name || !patient.phone_number}
                              className="mt-1"
                            />
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-xs text-muted-foreground truncate">
                                {patient.fileName}
                              </span>
                              {patient.status === 'extracting' && (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              )}
                              {patient.status === 'success' && (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              )}
                              {patient.status === 'error' && (
                                <Badge variant="destructive" className="text-xs">
                                  {patient.error}
                                </Badge>
                              )}
                            </div>

                            {patient.status === 'success' && (
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <Label className="text-xs">Name *</Label>
                                  <Input
                                    value={patient.name || ''}
                                    onChange={(e) => handlePatientEdit(patient.id, 'name', e.target.value)}
                                    placeholder="Name"
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Phone *</Label>
                                  <Input
                                    value={patient.phone_number || ''}
                                    onChange={(e) => handlePatientEdit(patient.id, 'phone_number', e.target.value)}
                                    placeholder="Phone"
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">NHS #</Label>
                                  <Input
                                    value={patient.nhs_number || ''}
                                    onChange={(e) => handlePatientEdit(patient.id, 'nhs_number', e.target.value)}
                                    placeholder="Optional"
                                    className="h-8 text-sm"
                                  />
                                </div>
                              </div>
                            )}

                            {patient.status === 'pending' && (
                              <p className="text-xs text-muted-foreground">Waiting...</p>
                            )}
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => handleRemovePatient(patient.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {patients.length > 0 && (
            <Button
              onClick={handleAddSelectedPatients}
              disabled={addPatientsMutation.isPending || validSelectedCount === 0 || isProcessing}
            >
              {addPatientsMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                `Add ${validSelectedCount} Patient${validSelectedCount !== 1 ? 's' : ''}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
