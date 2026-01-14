import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Check, X, Loader2, AlertCircle, File } from "lucide-react";
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
  const queryClient = useQueryClient();

  const addPatientsMutation = useMutation({
    mutationFn: async (patientsData: { name: string; phone_number: string; nhs_number: string }[]) => {
      const { data, error } = await supabase
        .from("patients")
        .insert(patientsData)
        .select();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Successfully added ${data.length} patients`);
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
    // Use the enhanced RTF parser for complex medical documents
    return parseRTF(rtfContent);
  };

  const processFile = async (file: File, id: string): Promise<Partial<ExtractedPatient>> => {
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

      // The edge function returns { success, data: { name, phone_number, nhs_number } }
      const patientData = data.data || data;
      
      if (!patientData.name && !patientData.phone_number && !patientData.nhs_number) {
        return {
          status: "error",
          error: "No patient information found in document",
        };
      }

      return {
        name: patientData.name || "",
        phone_number: patientData.phone_number || "",
        nhs_number: patientData.nhs_number || "",
        status: "success",
        fileType,
      };
    } catch (error: any) {
      return {
        status: "error",
        error: error.message || "Failed to process document",
      };
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setProcessedCount(0);

    const fileArray = Array.from(files);
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
      }));

    if (selectedPatients.length === 0) {
      toast.error("No patients selected");
      return;
    }

    addPatientsMutation.mutate(selectedPatients);
  };

  const handleClose = () => {
    setPatients([]);
    setProcessedCount(0);
    setIsProcessing(false);
    onOpenChange(false);
  };

  const successfulPatients = patients.filter((p) => p.status === "success");
  const selectedCount = patients.filter((p) => p.selected).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Bulk Patient Summary Upload
          </DialogTitle>
          <DialogDescription>
            Upload PDF or RTF patient summaries to extract and add patient information in bulk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Area */}
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
            <input
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
              <Upload className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm font-medium">
                Click to upload PDF or RTF files
              </span>
              <span className="text-xs text-muted-foreground">
                Supports multiple files • PDF and RTF formats
              </span>
            </label>
          </div>

          {/* Processing Progress */}
          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing {processedCount} of {patients.length} documents...
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

              <ScrollArea className="h-[400px] rounded-md border">
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
                            <span className="truncate">{patient.fileName}</span>
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
