import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Check, X, Loader2, AlertCircle, File, FolderOpen, CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import * as pdfjsLib from "pdfjs-dist";
import { parseRTF } from "@/lib/rtf-parser";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface ExtractedPatient {
  id: string;
  name: string;
  phone_number: string;
  nhs_number: string;
  status: "pending" | "success" | "error";
  error?: string;
  selected: boolean;
  fileName: string;
  fileType: "pdf" | "rtf";
}

interface DocumentPatientUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentPatientUpload({ open, onOpenChange }: DocumentPatientUploadProps) {
  const [patients, setPatients] = useState<ExtractedPatient[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Store extracted text for each patient for AI extraction
  const [extractedTexts, setExtractedTexts] = useState<Record<string, string>>({});

  const addPatientsMutation = useMutation({
    mutationFn: async (patientsData: { name: string; phone_number: string; nhs_number: string; extractedText?: string }[]) => {
      const { data, error } = await supabase
        .from("patients")
        .insert(patientsData.map(p => ({
          name: p.name,
          phone_number: p.phone_number,
          nhs_number: p.nhs_number
        })))
        .select();
      
      if (error) throw error;
      
      // Trigger AI extraction for each patient with extracted text
      const extractionPromises = data.map(async (patient, index) => {
        const patientWithText = patientsData[index];
        if (patientWithText.extractedText) {
          try {
            await supabase.functions.invoke('extract-patient-data', {
              body: { 
                patientId: patient.id, 
                documentText: patientWithText.extractedText 
              }
            });
          } catch (err) {
            console.error(`AI extraction failed for patient ${patient.name}:`, err);
          }
        }
      });
      
      // Run extractions in background (don't block the main flow)
      Promise.all(extractionPromises).then(() => {
        toast.success('AI extraction completed for all patients');
        queryClient.invalidateQueries({ queryKey: ["patients"] });
      });
      
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Successfully added ${data.length} patients. AI extraction in progress...`);
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      handleClose();
    },
    onError: (error) => {
      toast.error(`Failed to add patients: ${error.message}`);
    },
  });

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }
    
    return fullText;
  };

  const extractTextFromRTF = async (file: File): Promise<string> => {
    const rtfContent = await file.text();
    return parseRTF(rtfContent);
  };

  const processFile = async (file: File, id: string): Promise<Partial<ExtractedPatient> & { extractedText?: string }> => {
    try {
      const fileType = file.name.toLowerCase().endsWith('.rtf') ? 'rtf' : 'pdf';
      let text: string;
      
      if (fileType === 'pdf') {
        text = await extractTextFromPDF(file);
      } else {
        text = await extractTextFromRTF(file);
      }

      if (!text || text.trim().length < 10) {
        return {
          status: "error",
          error: "Could not extract text from document",
        };
      }

      const { data, error } = await supabase.functions.invoke("extract-patient-from-pdf", {
        body: { pdfText: text },
      });

      if (error) {
        return {
          status: "error",
          error: error.message,
        };
      }

      const patientData = data.data || data;
      
      if (!patientData.name && !patientData.phone_number && !patientData.nhs_number) {
        return {
          status: "error",
          error: "No patient information found in document",
        };
      }

      // Store the extracted text for later AI extraction
      setExtractedTexts(prev => ({ ...prev, [id]: text }));

      return {
        name: patientData.name || "",
        phone_number: patientData.phone_number || "",
        nhs_number: patientData.nhs_number || "",
        status: "success",
        fileType,
        extractedText: text,
      };
    } catch (error: any) {
      return {
        status: "error",
        error: error.message || "Failed to process document",
      };
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(file => {
      const name = file.name.toLowerCase();
      return name.endsWith('.pdf') || name.endsWith('.rtf');
    });

    if (fileArray.length === 0) {
      toast.error("No PDF or RTF files found");
      return;
    }

    setIsProcessing(true);
    setProcessedCount(0);

    const initialPatients: ExtractedPatient[] = fileArray.map((file, index) => ({
      id: `patient-${Date.now()}-${index}`,
      name: "",
      phone_number: "",
      nhs_number: "",
      status: "pending" as const,
      selected: false,
      fileName: file.name,
      fileType: file.name.toLowerCase().endsWith('.rtf') ? 'rtf' as const : 'pdf' as const,
    }));

    setPatients(initialPatients);

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const result = await processFile(file, initialPatients[i].id);

      setPatients((prev) =>
        prev.map((p, idx) =>
          idx === i
            ? {
                ...p,
                ...result,
                selected: result.status === "success",
              }
            : p
        )
      );
      setProcessedCount(i + 1);
    }

    setIsProcessing(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
    event.target.value = "";
  };

  const handlePatientEdit = (id: string, field: keyof ExtractedPatient, value: string) => {
    setPatients((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleRemovePatient = (id: string) => {
    setPatients((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSelectAll = (checked: boolean) => {
    setPatients((prev) =>
      prev.map((p) => (p.status === "success" ? { ...p, selected: checked } : p))
    );
  };

  const handleAddSelectedPatients = () => {
    const selectedPatients = patients
      .filter((p) => p.selected && p.status === "success")
      .map((p) => ({
        name: p.name,
        phone_number: p.phone_number,
        nhs_number: p.nhs_number,
        extractedText: extractedTexts[p.id] || undefined,
      }));

    if (selectedPatients.length === 0) {
      toast.error("No patients selected");
      return;
    }

    addPatientsMutation.mutate(selectedPatients);
  };

  const handleClose = () => {
    setPatients([]);
    setExtractedTexts({});
    setProcessedCount(0);
    setIsProcessing(false);
    onOpenChange(false);
  };

  const successfulPatients = patients.filter((p) => p.status === "success");
  const failedPatients = patients.filter((p) => p.status === "error");
  const selectedCount = patients.filter((p) => p.selected).length;
  const progressPercentage = patients.length > 0 ? (processedCount / patients.length) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Batch Patient Summary Upload
          </DialogTitle>
          <DialogDescription>
            Upload multiple PDF or RTF patient summaries, or select an entire folder for batch processing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Area */}
          <div className="grid grid-cols-2 gap-4">
            {/* File Upload */}
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.rtf"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="document-upload"
                disabled={isProcessing}
              />
              <label
                htmlFor="document-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Upload Files</span>
                <span className="text-xs text-muted-foreground">
                  Select multiple PDF/RTF files
                </span>
              </label>
            </div>

            {/* Folder Upload */}
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
              <input
                ref={folderInputRef}
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                id="folder-upload"
                disabled={isProcessing}
                {...{ webkitdirectory: "", directory: "" } as any}
              />
              <label
                htmlFor="folder-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Upload Folder</span>
                <span className="text-xs text-muted-foreground">
                  Process all RTF/PDF in folder
                </span>
              </label>
            </div>
          </div>

          {/* Processing Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing documents...
                </div>
                <span className="font-medium">
                  {processedCount} / {patients.length}
                </span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}

          {/* Summary Stats */}
          {patients.length > 0 && !isProcessing && (
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{patients.length} files processed</span>
              </div>
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm">{successfulPatients.length} successful</span>
              </div>
              {failedPatients.length > 0 && (
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm">{failedPatients.length} failed</span>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {patients.length > 0 && !isProcessing && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={
                      successfulPatients.length > 0 &&
                      successfulPatients.every((p) => p.selected)
                    }
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm font-medium">
                    Select All ({successfulPatients.length} valid)
                  </span>
                </div>
                <Badge variant="outline">
                  {selectedCount} selected
                </Badge>
              </div>

              <ScrollArea className="h-[350px] rounded-md border">
                <div className="p-4 space-y-3">
                  {patients.map((patient) => (
                    <div
                      key={patient.id}
                      className={`p-4 rounded-lg border ${
                        patient.status === "error"
                          ? "border-destructive/50 bg-destructive/5"
                          : patient.selected
                          ? "border-primary/50 bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {patient.status === "success" && (
                          <Checkbox
                            checked={patient.selected}
                            onCheckedChange={(checked) =>
                              handlePatientEdit(patient.id, "selected", checked as any)
                            }
                            className="mt-1"
                          />
                        )}
                        {patient.status === "error" && (
                          <AlertCircle className="h-5 w-5 text-destructive mt-1 shrink-0" />
                        )}
                        {patient.status === "pending" && (
                          <Loader2 className="h-5 w-5 animate-spin mt-1 shrink-0" />
                        )}

                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <File className="h-3 w-3" />
                            <span className="truncate max-w-[300px]">{patient.fileName}</span>
                            <Badge variant="secondary" className="text-xs">
                              {patient.fileType.toUpperCase()}
                            </Badge>
                          </div>

                          {patient.status === "error" ? (
                            <p className="text-sm text-destructive">
                              {patient.error}
                            </p>
                          ) : patient.status === "success" ? (
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-xs text-muted-foreground">
                                  Name
                                </label>
                                <Input
                                  value={patient.name}
                                  onChange={(e) =>
                                    handlePatientEdit(patient.id, "name", e.target.value)
                                  }
                                  className="h-8 text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">
                                  Phone
                                </label>
                                <Input
                                  value={patient.phone_number}
                                  onChange={(e) =>
                                    handlePatientEdit(
                                      patient.id,
                                      "phone_number",
                                      e.target.value
                                    )
                                  }
                                  className="h-8 text-sm"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">
                                  NHS Number
                                </label>
                                <Input
                                  value={patient.nhs_number}
                                  onChange={(e) =>
                                    handlePatientEdit(
                                      patient.id,
                                      "nhs_number",
                                      e.target.value
                                    )
                                  }
                                  className="h-8 text-sm"
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Processing...
                            </p>
                          )}
                        </div>

                        {patient.status !== "pending" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemovePatient(patient.id)}
                            className="shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddSelectedPatients}
                  disabled={selectedCount === 0 || addPatientsMutation.isPending}
                >
                  {addPatientsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Add {selectedCount} Patient{selectedCount !== 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
