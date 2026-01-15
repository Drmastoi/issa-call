import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Clock, Activity, Heart, Scale, Ruler, Wine, Cigarette, User } from "lucide-react";
import { format } from "date-fns";

interface CallResponse {
  id: string;
  call_id: string;
  patient_id: string;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  pulse_rate: number | null;
  smoking_status: string | null;
  alcohol_units_per_week: number | null;
  is_carer: boolean | null;
  verification_status: string;
  verified_by: string | null;
  verified_at: string | null;
  clinical_notes: string | null;
  collected_at: string;
  patients: {
    name: string;
    nhs_number: string | null;
    date_of_birth: string | null;
  };
}

const statusConfig = {
  unverified: { icon: Clock, label: "Pending Review", color: "bg-yellow-500/10 text-yellow-600 border-yellow-200" },
  verified: { icon: CheckCircle2, label: "Verified", color: "bg-green-500/10 text-green-600 border-green-200" },
  rejected: { icon: XCircle, label: "Rejected", color: "bg-red-500/10 text-red-600 border-red-200" },
};

const smokingStatusLabels: Record<string, string> = {
  never_smoked: "Never Smoked",
  ex_smoker: "Ex-Smoker",
  current_smoker: "Current Smoker",
};

export default function ClinicalVerification() {
  const queryClient = useQueryClient();
  const [selectedResponse, setSelectedResponse] = useState<string | null>(null);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [filter, setFilter] = useState<"all" | "unverified" | "verified" | "rejected">("unverified");

  // Fetch call responses with patient info
  const { data: responses, isLoading } = useQuery({
    queryKey: ["call-responses-verification", filter],
    queryFn: async () => {
      let query = supabase
        .from("call_responses")
        .select(`
          *,
          patients (
            name,
            nhs_number,
            date_of_birth
          )
        `)
        .order("collected_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("verification_status", filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CallResponse[];
    },
  });

  // Verify mutation
  const verifyMutation = useMutation({
    mutationFn: async ({ responseId, notes }: { responseId: string; notes: string }) => {
      const { error } = await supabase.rpc("verify_call_response", {
        p_response_id: responseId,
        p_verified_by: (await supabase.auth.getUser()).data.user?.id,
        p_clinical_notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-responses-verification"] });
      toast.success("Metrics verified and approved for patient record");
      setSelectedResponse(null);
      setClinicalNotes("");
    },
    onError: (error) => {
      toast.error("Failed to verify metrics: " + error.message);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ responseId, reason }: { responseId: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_call_response", {
        p_response_id: responseId,
        p_rejected_by: (await supabase.auth.getUser()).data.user?.id,
        p_rejection_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-responses-verification"] });
      toast.success("Metrics rejected - will not be added to patient record");
      setSelectedResponse(null);
      setClinicalNotes("");
    },
    onError: (error) => {
      toast.error("Failed to reject metrics: " + error.message);
    },
  });

  const handleVerify = (responseId: string) => {
    verifyMutation.mutate({ responseId, notes: clinicalNotes });
  };

  const handleReject = (responseId: string) => {
    if (!clinicalNotes.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    rejectMutation.mutate({ responseId, reason: clinicalNotes });
  };

  const getMetricsCount = (response: CallResponse) => {
    let count = 0;
    if (response.blood_pressure_systolic) count++;
    if (response.weight_kg) count++;
    if (response.height_cm) count++;
    if (response.pulse_rate) count++;
    if (response.smoking_status) count++;
    if (response.alcohol_units_per_week !== null) count++;
    if (response.is_carer !== null) count++;
    return count;
  };

  const unverifiedCount = responses?.filter(r => r.verification_status === "unverified").length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clinical Verification</h1>
          <p className="text-muted-foreground mt-1">
            Review and approve AI-extracted health metrics before adding to patient records
          </p>
        </div>
        {unverifiedCount > 0 && (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-200 px-3 py-1">
            <AlertTriangle className="h-4 w-4 mr-2" />
            {unverifiedCount} pending review
          </Badge>
        )}
      </div>

      {/* CQC Compliance Notice */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">CQC Regulation 12 Compliance</p>
              <p className="text-sm text-blue-700 mt-1">
                AI-extracted health metrics must be clinically verified before being used for care decisions. 
                Review each entry for accuracy and flag any concerns.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(["unverified", "verified", "rejected", "all"] as const).map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(status)}
            className="capitalize"
          >
            {status === "unverified" && <Clock className="h-4 w-4 mr-2" />}
            {status === "verified" && <CheckCircle2 className="h-4 w-4 mr-2" />}
            {status === "rejected" && <XCircle className="h-4 w-4 mr-2" />}
            {status}
          </Button>
        ))}
      </div>

      {/* Responses Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-3">
                <div className="h-5 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : responses?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-medium">All caught up!</p>
            <p className="text-muted-foreground">No {filter === "all" ? "" : filter} metrics to review</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {responses?.map((response) => {
            const status = statusConfig[response.verification_status as keyof typeof statusConfig] || statusConfig.unverified;
            const StatusIcon = status.icon;
            const isSelected = selectedResponse === response.id;

            return (
              <Card 
                key={response.id} 
                className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary" : "hover:shadow-md"}`}
                onClick={() => {
                  setSelectedResponse(isSelected ? null : response.id);
                  setClinicalNotes(response.clinical_notes || "");
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{response.patients?.name || "Unknown Patient"}</CardTitle>
                    <Badge variant="outline" className={status.color}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {status.label}
                    </Badge>
                  </div>
                  <CardDescription>
                    {response.patients?.nhs_number && `NHS: ${response.patients.nhs_number} • `}
                    Collected {format(new Date(response.collected_at), "dd MMM yyyy HH:mm")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Metrics Summary */}
                  <div className="grid grid-cols-2 gap-3">
                    {response.blood_pressure_systolic && response.blood_pressure_diastolic && (
                      <div className="flex items-center gap-2 text-sm">
                        <Heart className="h-4 w-4 text-red-500" />
                        <span>{response.blood_pressure_systolic}/{response.blood_pressure_diastolic} mmHg</span>
                      </div>
                    )}
                    {response.pulse_rate && (
                      <div className="flex items-center gap-2 text-sm">
                        <Activity className="h-4 w-4 text-pink-500" />
                        <span>{response.pulse_rate} bpm</span>
                      </div>
                    )}
                    {response.weight_kg && (
                      <div className="flex items-center gap-2 text-sm">
                        <Scale className="h-4 w-4 text-blue-500" />
                        <span>{response.weight_kg} kg</span>
                      </div>
                    )}
                    {response.height_cm && (
                      <div className="flex items-center gap-2 text-sm">
                        <Ruler className="h-4 w-4 text-green-500" />
                        <span>{response.height_cm} cm</span>
                      </div>
                    )}
                    {response.smoking_status && (
                      <div className="flex items-center gap-2 text-sm">
                        <Cigarette className="h-4 w-4 text-orange-500" />
                        <span>{smokingStatusLabels[response.smoking_status] || response.smoking_status}</span>
                      </div>
                    )}
                    {response.alcohol_units_per_week !== null && (
                      <div className="flex items-center gap-2 text-sm">
                        <Wine className="h-4 w-4 text-purple-500" />
                        <span>{response.alcohol_units_per_week} units/week</span>
                      </div>
                    )}
                    {response.is_carer !== null && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-teal-500" />
                        <span>{response.is_carer ? "Is a carer" : "Not a carer"}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {getMetricsCount(response)} metrics extracted by AI
                  </p>

                  {/* Expanded Actions */}
                  {isSelected && response.verification_status === "unverified" && (
                    <div className="space-y-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                      <Textarea
                        placeholder="Add clinical notes or reason for rejection..."
                        value={clinicalNotes}
                        onChange={(e) => setClinicalNotes(e.target.value)}
                        className="min-h-[80px]"
                      />
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => handleVerify(response.id)}
                          disabled={verifyMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Verify & Approve
                        </Button>
                        <Button
                          variant="destructive"
                          className="flex-1"
                          onClick={() => handleReject(response.id)}
                          disabled={rejectMutation.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Show notes for verified/rejected */}
                  {response.clinical_notes && response.verification_status !== "unverified" && (
                    <div className="pt-3 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Clinical Notes:</p>
                      <p className="text-sm">{response.clinical_notes}</p>
                      {response.verified_at && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {response.verification_status === "verified" ? "Verified" : "Rejected"} on{" "}
                          {format(new Date(response.verified_at), "dd MMM yyyy HH:mm")}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
