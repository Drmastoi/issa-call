import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BatchExportProps {
  batchId: string;
  batchName: string;
}

type ExportFormat = "emis_csv" | "full_csv" | "summary_csv";

export function BatchExport({ batchId, batchName }: BatchExportProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("emis_csv");
  const [isExporting, setIsExporting] = useState(false);

  const exportData = async () => {
    setIsExporting(true);
    try {
      // Fetch all related data
      const { data: batchPatients } = await supabase
        .from("batch_patients")
        .select("patient_id")
        .eq("batch_id", batchId);

      if (!batchPatients?.length) {
        toast.error("No patients found in this batch");
        return;
      }

      const patientIds = batchPatients.map(bp => bp.patient_id);

      const [patientsRes, callsRes, responsesRes] = await Promise.all([
        supabase.from("patients").select("*").in("id", patientIds),
        supabase.from("calls").select("*").eq("batch_id", batchId),
        supabase.from("call_responses").select("*").in("patient_id", patientIds),
      ]);

      const patients = patientsRes.data || [];
      const calls = callsRes.data || [];
      const responses = responsesRes.data || [];

      let csvContent = "";
      let filename = "";

      if (format === "emis_csv") {
        // EMIS-compatible format with just the collected metrics
        csvContent = "NHS_Number,Name,Smoking_Status,BP_Systolic,BP_Diastolic,Weight_Kg,Height_Cm,Alcohol_Units,Is_Carer,Collection_Date\n";
        
        for (const patient of patients) {
          const patientResponses = responses.filter(r => r.patient_id === patient.id);
          const latestResponse = patientResponses.sort((a, b) => 
            new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()
          )[0];

          if (latestResponse) {
            csvContent += `"${patient.nhs_number || ""}","${patient.name}","${latestResponse.smoking_status || ""}",${latestResponse.blood_pressure_systolic || ""},${latestResponse.blood_pressure_diastolic || ""},${latestResponse.weight_kg || ""},${latestResponse.height_cm || ""},${latestResponse.alcohol_units_per_week || ""},${latestResponse.is_carer ? "Yes" : "No"},"${latestResponse.collected_at.split("T")[0]}"\n`;
          }
        }
        filename = `${batchName.replace(/[^a-z0-9]/gi, "_")}_EMIS_Import.csv`;
      } else if (format === "full_csv") {
        // Full export with all data
        csvContent = "NHS_Number,Name,Phone,DOB,Conditions,Smoking_Status,BP_Systolic,BP_Diastolic,Weight_Kg,Height_Cm,Alcohol_Units,HbA1c,Call_Status,Call_Duration,Collection_Date\n";
        
        for (const patient of patients) {
          const patientCalls = calls.filter(c => c.patient_id === patient.id);
          const patientResponses = responses.filter(r => r.patient_id === patient.id);
          const latestCall = patientCalls[0];
          const latestResponse = patientResponses[0];

          csvContent += `"${patient.nhs_number || ""}","${patient.name}","${patient.phone_number}","${patient.date_of_birth || ""}","${(patient.conditions || []).join("; ")}","${latestResponse?.smoking_status || ""}",${latestResponse?.blood_pressure_systolic || ""},${latestResponse?.blood_pressure_diastolic || ""},${latestResponse?.weight_kg || ""},${latestResponse?.height_cm || ""},${latestResponse?.alcohol_units_per_week || ""},${patient.hba1c_mmol_mol || ""},"${latestCall?.status || ""}",${latestCall?.duration_seconds || ""},"${latestResponse?.collected_at?.split("T")[0] || ""}"\n`;
        }
        filename = `${batchName.replace(/[^a-z0-9]/gi, "_")}_Full_Export.csv`;
      } else {
        // Summary export
        const completed = calls.filter(c => c.status === "completed").length;
        const failed = calls.filter(c => c.status === "failed" || c.status === "no_answer").length;
        const pending = calls.filter(c => c.status === "pending").length;

        csvContent = "Batch Summary Report\n\n";
        csvContent += `Batch Name,${batchName}\n`;
        csvContent += `Total Patients,${patients.length}\n`;
        csvContent += `Completed Calls,${completed}\n`;
        csvContent += `Failed Calls,${failed}\n`;
        csvContent += `Pending Calls,${pending}\n`;
        csvContent += `Responses Collected,${responses.length}\n\n`;
        csvContent += "Collected Metrics Summary\n";
        
        const smokingCounts: Record<string, number> = {};
        responses.forEach(r => {
          if (r.smoking_status) {
            smokingCounts[r.smoking_status] = (smokingCounts[r.smoking_status] || 0) + 1;
          }
        });
        
        csvContent += "Smoking Status Breakdown\n";
        Object.entries(smokingCounts).forEach(([status, count]) => {
          csvContent += `${status},${count}\n`;
        });

        filename = `${batchName.replace(/[^a-z0-9]/gi, "_")}_Summary.csv`;
      }

      // Download file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${filename}`);
      setOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Export Batch Results
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Export Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="emis_csv">
                  <div>
                    <span className="font-medium">EMIS Import Format</span>
                    <p className="text-xs text-muted-foreground">NHS#, metrics only - ready for EMIS import</p>
                  </div>
                </SelectItem>
                <SelectItem value="full_csv">
                  <div>
                    <span className="font-medium">Full Export</span>
                    <p className="text-xs text-muted-foreground">All patient data and call results</p>
                  </div>
                </SelectItem>
                <SelectItem value="summary_csv">
                  <div>
                    <span className="font-medium">Summary Report</span>
                    <p className="text-xs text-muted-foreground">Batch statistics and metrics breakdown</p>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={exportData} className="w-full" disabled={isExporting}>
            {isExporting ? "Exporting..." : "Download CSV"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
