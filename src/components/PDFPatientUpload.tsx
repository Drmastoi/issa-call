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
import { FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ExtractedData {
  name: string | null;
  phone_number: string | null;
  nhs_number: string | null;
}

interface PDFPatientUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PDFPatientUpload({ open, onOpenChange }: PDFPatientUploadProps) {
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [editedData, setEditedData] = useState<ExtractedData>({
    name: null,
    phone_number: null,
    nhs_number: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { logAction } = useAuditLog();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const addPatientMutation = useMutation({
    mutationFn: async (patient: { name: string; phone_number: string; nhs_number?: string | null }) => {
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
      logAction('create', 'patient', data.id, { name: data.name, source: 'pdf_upload' });
      toast({ title: 'Patient added successfully from PDF' });
      handleClose();
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to add patient', description: error.message });
    },
  });

  const extractTextFromPDF = async (file: File): Promise<string> => {
    // Dynamically import pdfjs-dist to avoid top-level await issues
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload a PDF file',
      });
      return;
    }

    setIsExtracting(true);
    setExtractedData(null);

    try {
      // Extract text from PDF
      const pdfText = await extractTextFromPDF(file);
      console.log('Extracted PDF text length:', pdfText.length);

      if (pdfText.trim().length < 10) {
        throw new Error('Could not extract text from PDF. The PDF may be scanned or image-based.');
      }

      // Send to AI for extraction
      const { data, error } = await supabase.functions.invoke('extract-patient-from-pdf', {
        body: { pdfText },
      });

      if (error) throw error;

      if (data.success && data.data) {
        setExtractedData(data.data);
        setEditedData(data.data);
        toast({
          title: 'Data extracted successfully',
          description: 'Please review and confirm the extracted information',
        });
      } else {
        throw new Error(data.error || 'Failed to extract patient data');
      }
    } catch (error) {
      console.error('PDF extraction error:', error);
      toast({
        variant: 'destructive',
        title: 'Extraction failed',
        description: error instanceof Error ? error.message : 'Failed to extract data from PDF',
      });
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddPatient = () => {
    if (!editedData.name || !editedData.phone_number) {
      toast({
        variant: 'destructive',
        title: 'Missing required fields',
        description: 'Name and phone number are required',
      });
      return;
    }

    addPatientMutation.mutate({
      name: editedData.name,
      phone_number: editedData.phone_number,
      nhs_number: editedData.nhs_number,
    });
  };

  const handleClose = () => {
    setExtractedData(null);
    setEditedData({ name: null, phone_number: null, nhs_number: null });
    setIsExtracting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload PDF Summary</DialogTitle>
          <DialogDescription>
            Upload a patient summary PDF. AI will extract the name and phone number automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!extractedData && (
            <Card className="border-dashed">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-4">
                  {isExtracting ? (
                    <>
                      <Loader2 className="h-12 w-12 text-primary animate-spin" />
                      <div className="text-center">
                        <p className="text-sm font-medium">Extracting patient data...</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          AI is analyzing the PDF content
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <FileText className="h-12 w-12 text-muted-foreground" />
                      <div className="text-center">
                        <p className="text-sm font-medium">Upload Patient Summary PDF</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          AI will extract name, phone number, and NHS number
                        </p>
                      </div>
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        onChange={handleFileUpload}
                        className="max-w-xs"
                      />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {extractedData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Data extracted - please review</span>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="extracted-name">
                    Full Name *
                    {!editedData.name && (
                      <span className="text-destructive ml-2 text-xs">
                        <AlertCircle className="h-3 w-3 inline mr-1" />
                        Not found
                      </span>
                    )}
                  </Label>
                  <Input
                    id="extracted-name"
                    value={editedData.name || ''}
                    onChange={(e) => setEditedData({ ...editedData, name: e.target.value || null })}
                    placeholder="Enter patient name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="extracted-phone">
                    Phone Number *
                    {!editedData.phone_number && (
                      <span className="text-destructive ml-2 text-xs">
                        <AlertCircle className="h-3 w-3 inline mr-1" />
                        Not found
                      </span>
                    )}
                  </Label>
                  <Input
                    id="extracted-phone"
                    value={editedData.phone_number || ''}
                    onChange={(e) => setEditedData({ ...editedData, phone_number: e.target.value || null })}
                    placeholder="Enter phone number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="extracted-nhs">NHS Number</Label>
                  <Input
                    id="extracted-nhs"
                    value={editedData.nhs_number || ''}
                    onChange={(e) => setEditedData({ ...editedData, nhs_number: e.target.value || null })}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setExtractedData(null);
                  setEditedData({ name: null, phone_number: null, nhs_number: null });
                }}
              >
                Upload Different PDF
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {extractedData && (
            <Button
              onClick={handleAddPatient}
              disabled={addPatientMutation.isPending || !editedData.name || !editedData.phone_number}
            >
              {addPatientMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Patient'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
