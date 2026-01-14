import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Users, Loader2, X, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface ExtractedPatient {
  file: string;
  name: string | null;
  phone_number: string | null;
  nhs_number: string | null;
  date_of_birth: string | null;
  conditions: string[];
  smoking_status: string | null;
  hba1c_mmol_mol: number | null;
  medications: string[];
  frailty_status: string | null;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
  selected: boolean;
}

interface CreateBatchFromUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BATCH_PURPOSES = [
  { value: "smoking_status", label: "Smoking Status Check", description: "Collect/update smoking status" },
  { value: "bp_check", label: "Blood Pressure Check", description: "Collect blood pressure readings" },
  { value: "qof_review", label: "QOF Review Call", description: "General health metrics collection" },
  { value: "medication_review", label: "Medication Review", description: "Medication adherence check" },
  { value: "hba1c_check", label: "HbA1c Check", description: "For diabetic patients" },
  { value: "custom", label: "Custom Questions", description: "Define your own questions" },
];

export function CreateBatchFromUpload({ open, onOpenChange }: CreateBatchFromUploadProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [patients, setPatients] = useState<ExtractedPatient[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  
  // Batch details
  const [batchName, setBatchName] = useState("");
  const [batchPurpose, setBatchPurpose] = useState("qof_review");
  const [customQuestions, setCustomQuestions] = useState("");
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split("T")[0]);
  const [scheduledTimeStart, setScheduledTimeStart] = useState("09:00");
  const [scheduledTimeEnd, setScheduledTimeEnd] = useState("17:00");

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    return fullText;
  };

  const parseCSV = (content: string): ExtractedPatient[] => {
    const lines = content.trim().split("\n");
    if (lines.length < 2) return [];
    
    const headers = lines[0].toLowerCase().split(",").map(h => h.trim());
    const patients: ExtractedPatient[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h] = values[idx] || "";
      });
      
      patients.push({
        file: `Row ${i}`,
        name: record.name || record.patient_name || record.full_name || null,
        phone_number: record.phone || record.phone_number || record.telephone || record.mobile || null,
        nhs_number: record.nhs || record.nhs_number || record.nhsnumber || null,
        date_of_birth: record.dob || record.date_of_birth || record.dateofbirth || null,
        conditions: (record.conditions || record.diagnoses || "").split(";").filter(Boolean),
        smoking_status: record.smoking || record.smoking_status || null,
        hba1c_mmol_mol: record.hba1c ? parseFloat(record.hba1c) : null,
        medications: (record.medications || record.meds || "").split(";").filter(Boolean),
        frailty_status: record.frailty || record.frailty_status || null,
        status: "success",
        selected: true,
      });
    }
    
    return patients;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    // Store files in array to avoid losing reference
    const fileArray = Array.from(files);
    
    setIsProcessing(true);
    setProcessedCount(0);

    const initialPatients: ExtractedPatient[] = fileArray.map(file => ({
      file: file.name,
      name: null,
      phone_number: null,
      nhs_number: null,
      date_of_birth: null,
      conditions: [],
      smoking_status: null,
      hba1c_mmol_mol: null,
      medications: [],
      frailty_status: null,
      status: "pending" as const,
      selected: false,
    }));

    setPatients(initialPatients);

    // Process files sequentially with the stored array
    for (let i = 0; i < fileArray.length; i++) {
      await processFileWithData(fileArray[i], i);
    }

    setIsProcessing(false);
  };

  const processFileWithData = async (file: File, index: number) => {
    setPatients(prev => prev.map((p, i) => 
      i === index ? { ...p, status: "processing" as const } : p
    ));

    try {
      if (file.name.endsWith(".csv")) {
        const content = await file.text();
        const csvPatients = parseCSV(content);
        setPatients(prev => {
          const newPatients = [...prev];
          newPatients.splice(index, 1, ...csvPatients);
          return newPatients;
        });
        setProcessedCount(prev => prev + csvPatients.length);
      } else {
        console.log("Extracting text from PDF:", file.name);
        const pdfText = await extractTextFromPDF(file);
        console.log("PDF text length:", pdfText.length);
        
        const { data, error } = await supabase.functions.invoke("extract-patient-from-pdf", {
          body: { pdfText },
        });

        console.log("Extraction response:", { data, error });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Extraction failed");

        const extractedData = data.data;
        console.log("Extracted patient data:", extractedData);

        setPatients(prev => {
          const updated = prev.map((p, i) => 
            i === index ? {
              ...p,
              name: extractedData.name || null,
              phone_number: extractedData.phone_number || null,
              nhs_number: extractedData.nhs_number || null,
              date_of_birth: extractedData.date_of_birth || null,
              conditions: extractedData.conditions || [],
              smoking_status: extractedData.smoking_status || null,
              hba1c_mmol_mol: extractedData.hba1c_mmol_mol || null,
              medications: extractedData.medications || [],
              frailty_status: extractedData.frailty_status || null,
              status: "success" as const,
              selected: Boolean(extractedData.name && extractedData.phone_number),
            } : p
          );
          console.log("Updated patients:", updated);
          return updated;
        });
        setProcessedCount(prev => prev + 1);
      }
    } catch (error) {
      console.error("Error processing file:", error);
      setPatients(prev => prev.map((p, i) => 
        i === index ? { ...p, status: "error" as const, error: String(error) } : p
      ));
      setProcessedCount(prev => prev + 1);
    }
  };

  const createBatchMutation = useMutation({
    mutationFn: async () => {
      const selectedPatients = patients.filter(p => p.selected && p.name && p.phone_number);
      if (selectedPatients.length === 0) throw new Error("No valid patients selected");

      // Insert patients
      const patientInserts = selectedPatients.map(p => ({
        name: p.name!,
        phone_number: p.phone_number!,
        nhs_number: p.nhs_number,
        date_of_birth: p.date_of_birth,
        conditions: p.conditions,
        medications: p.medications,
        frailty_status: p.frailty_status,
        hba1c_mmol_mol: p.hba1c_mmol_mol,
      }));

      const { data: insertedPatients, error: patientsError } = await supabase
        .from("patients")
        .insert(patientInserts)
        .select("id");

      if (patientsError) throw patientsError;

      // Create batch
      const { data: batch, error: batchError } = await supabase
        .from("call_batches")
        .insert({
          name: batchName || `Batch - ${new Date().toLocaleDateString()}`,
          scheduled_date: scheduledDate,
          scheduled_time_start: scheduledTimeStart,
          scheduled_time_end: scheduledTimeEnd,
          purpose: batchPurpose,
          custom_questions: batchPurpose === "custom" ? customQuestions.split("\n").filter(Boolean) : null,
          target_qof_indicators: getTargetIndicators(batchPurpose),
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Link patients to batch
      const batchPatients = insertedPatients.map((p, idx) => ({
        batch_id: batch.id,
        patient_id: p.id,
        priority: idx,
      }));

      const { error: linkError } = await supabase
        .from("batch_patients")
        .insert(batchPatients);

      if (linkError) throw linkError;

      return { batch, patientCount: insertedPatients.length };
    },
    onSuccess: (data) => {
      toast.success(`Created batch "${data.batch.name}" with ${data.patientCount} patients`);
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      handleClose();
    },
    onError: (error) => {
      toast.error(`Failed to create batch: ${error.message}`);
    },
  });

  const getTargetIndicators = (purpose: string): string[] => {
    switch (purpose) {
      case "smoking_status": return ["SMOKING"];
      case "bp_check": return ["BP"];
      case "hba1c_check": return ["HBA1C"];
      case "qof_review": return ["SMOKING", "BP", "BMI"];
      default: return [];
    }
  };

  const handleClose = () => {
    setStep(1);
    setPatients([]);
    setBatchName("");
    setBatchPurpose("qof_review");
    setCustomQuestions("");
    setProcessedCount(0);
    onOpenChange(false);
  };

  const selectedCount = patients.filter(p => p.selected && p.name && p.phone_number).length;
  const validCount = patients.filter(p => p.name && p.phone_number).length;
  
  // Debug logging
  console.log("Patient state:", { 
    totalPatients: patients.length, 
    selectedCount, 
    validCount, 
    step,
    patients: patients.map(p => ({ name: p.name, phone: p.phone_number, selected: p.selected, status: p.status }))
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Create Batch from EMIS Upload
          </DialogTitle>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 py-4 border-b">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {s}
              </div>
              <span className={`text-sm ${step >= s ? "text-foreground" : "text-muted-foreground"}`}>
                {s === 1 ? "Upload" : s === 2 ? "Review" : "Configure"}
              </span>
              {s < 3 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        <ScrollArea className="flex-1 pr-4">
          {step === 1 && (
            <div className="space-y-6 py-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">Upload EMIS Patient Data</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload PDF summaries or CSV export from EMIS
                </p>
                <Input
                  type="file"
                  accept=".pdf,.csv"
                  multiple
                  onChange={handleFileUpload}
                  className="max-w-xs mx-auto"
                  disabled={isProcessing}
                />
              </div>

              {isProcessing && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing {processedCount}/{patients.length} files...
                </div>
              )}

              {patients.length > 0 && !isProcessing && (
                <div className="space-y-2">
                  <p className="font-medium">Extracted {validCount} valid patients from {patients.length} files</p>
                  <Button onClick={() => setStep(2)} disabled={validCount === 0}>
                    Review Patients →
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {selectedCount} of {validCount} patients selected
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPatients(prev => prev.map(p => ({ ...p, selected: Boolean(p.name && p.phone_number) })))}
                >
                  Select All Valid
                </Button>
              </div>

              <div className="space-y-2">
                {patients.map((patient, idx) => (
                  <Card key={idx} className={`${patient.status === "error" ? "border-destructive" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={patient.selected}
                          disabled={!patient.name || !patient.phone_number}
                          onCheckedChange={(checked) => 
                            setPatients(prev => prev.map((p, i) => i === idx ? { ...p, selected: Boolean(checked) } : p))
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium truncate">{patient.name || "Unknown"}</span>
                            {patient.status === "success" && <Check className="h-4 w-4 text-green-500" />}
                            {patient.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>📞 {patient.phone_number || "No phone"} | 🏥 NHS: {patient.nhs_number || "N/A"}</p>
                            {patient.conditions.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {patient.conditions.map((c, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                                ))}
                              </div>
                            )}
                            {patient.smoking_status && (
                              <Badge variant="outline" className="text-xs">Smoking: {patient.smoking_status}</Badge>
                            )}
                          </div>
                          {patient.error && (
                            <p className="text-xs text-destructive mt-1">{patient.error}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{patient.file}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex gap-2 pointer-events-auto">
                <Button
                  variant="outline"
                  type="button"
                  className="pointer-events-auto"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStep(1);
                  }}
                >
                  ← Back
                </Button>
                <Button
                  type="button"
                  className="pointer-events-auto"
                  onPointerDownCapture={() => console.log("Configure pointerdown")}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("Configure Batch clicked", { selectedCount, validCount, step });
                    setStep(3);
                  }}
                  disabled={selectedCount === 0}
                >
                  Configure Batch →
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Batch Name</Label>
                  <Input
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder={`Batch - ${new Date().toLocaleDateString()}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Batch Purpose</Label>
                  <Select value={batchPurpose} onValueChange={setBatchPurpose}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BATCH_PURPOSES.map(p => (
                        <SelectItem key={p.value} value={p.value}>
                          <div>
                            <span className="font-medium">{p.label}</span>
                            <span className="text-muted-foreground ml-2 text-sm">- {p.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {batchPurpose === "custom" && (
                  <div className="space-y-2">
                    <Label>Custom Questions (one per line)</Label>
                    <Textarea
                      value={customQuestions}
                      onChange={(e) => setCustomQuestions(e.target.value)}
                      placeholder="What is your current smoking status?&#10;Have you checked your blood pressure recently?"
                      rows={4}
                    />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Scheduled Date</Label>
                    <Input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={scheduledTimeStart}
                      onChange={(e) => setScheduledTimeStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={scheduledTimeEnd}
                      onChange={(e) => setScheduledTimeEnd(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Users className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">{selectedCount} patients will be added</p>
                      <p className="text-sm text-muted-foreground">
                        Purpose: {BATCH_PURPOSES.find(p => p.value === batchPurpose)?.label}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
                <Button 
                  onClick={() => createBatchMutation.mutate()}
                  disabled={createBatchMutation.isPending}
                >
                  {createBatchMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Batch"
                  )}
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
