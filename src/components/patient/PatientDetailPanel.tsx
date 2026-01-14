import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  User, Heart, Activity, Cigarette, Wine, Scale, Ruler, 
  Calendar, AlertTriangle, CheckCircle, XCircle, Brain,
  HeartPulse, Wind, Pill, FileText, Phone, Clock, Shield,
  UserCheck, Stethoscope, Home, Accessibility, Apple, MessageSquare, Sparkles, Loader2, RefreshCw
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface PatientDetailPanelProps {
  patientId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface PatientData {
  id: string;
  name: string;
  phone_number: string;
  nhs_number: string | null;
  date_of_birth: string | null;
  conditions: string[] | null;
  medications: string[] | null;
  hba1c_mmol_mol: number | null;
  hba1c_date: string | null;
  cholesterol_ldl: number | null;
  cholesterol_hdl: number | null;
  cholesterol_date: string | null;
  frailty_status: string | null;
  cha2ds2_vasc_score: number | null;
  notes: string | null;
  preferred_call_time: string | null;
  last_review_date: string | null;
  created_at: string;
  // New AI-extracted fields
  dnacpr_status: string | null;
  dnacpr_date: string | null;
  allergies: string[] | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  gp_name: string | null;
  gp_practice: string | null;
  care_home_name: string | null;
  mobility_status: string | null;
  dietary_requirements: string | null;
  communication_needs: string | null;
  ai_extracted_summary: string | null;
  ai_extracted_at: string | null;
}

interface CallResponse {
  id: string;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  pulse_rate: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  smoking_status: string | null;
  alcohol_units_per_week: number | null;
  is_carer: boolean | null;
  collected_at: string;
}

interface AISummary {
  id: string;
  clinical_summary: string;
  qof_relevance: any;
  action_items: any;
  key_findings: any;
  created_at: string;
}

interface Call {
  id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  attempt_number: number;
  transcript: string | null;
}

export function PatientDetailPanel({ patientId, isOpen, onClose }: PatientDetailPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [extractText, setExtractText] = useState('');
  const [showExtractDialog, setShowExtractDialog] = useState(false);

  // AI extraction mutation
  const extractMutation = useMutation({
    mutationFn: async ({ patientId, documentText }: { patientId: string; documentText: string }) => {
      const { data, error } = await supabase.functions.invoke('extract-patient-data', {
        body: { patientId, documentText }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Data extracted successfully', description: 'Patient information has been updated with AI-extracted data.' });
      queryClient.invalidateQueries({ queryKey: ['patient-detail', patientId] });
      setShowExtractDialog(false);
      setExtractText('');
    },
    onError: (error: Error) => {
      if (error.message.includes('429')) {
        toast({ variant: 'destructive', title: 'Rate limit exceeded', description: 'Please try again in a moment.' });
      } else if (error.message.includes('402')) {
        toast({ variant: 'destructive', title: 'AI credits exhausted', description: 'Please add credits to continue using AI features.' });
      } else {
        toast({ variant: 'destructive', title: 'Extraction failed', description: error.message });
      }
    }
  });

  // Fetch patient data
  const { data: patient, isLoading: patientLoading } = useQuery({
    queryKey: ['patient-detail', patientId],
    enabled: isOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .maybeSingle();
      if (error) throw error;
      return data as PatientData | null;
    },
  });

  // Fetch call responses
  const { data: callResponses = [] } = useQuery({
    queryKey: ['patient-responses', patientId],
    enabled: isOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_responses')
        .select('*')
        .eq('patient_id', patientId)
        .order('collected_at', { ascending: false });
      if (error) throw error;
      return data as CallResponse[];
    },
  });

  // Fetch AI summaries
  const { data: aiSummaries = [] } = useQuery({
    queryKey: ['patient-summaries', patientId],
    enabled: isOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_summaries')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AISummary[];
    },
  });

  // Fetch calls
  const { data: calls = [] } = useQuery({
    queryKey: ['patient-calls', patientId],
    enabled: isOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as Call[];
    },
  });

  const latestResponse = callResponses[0];

  // Calculate age from DOB
  const calculateAge = (dob: string | null) => {
    if (!dob) return null;
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Calculate BMI
  const calculateBMI = () => {
    if (!latestResponse?.weight_kg || !latestResponse?.height_cm) return null;
    const heightM = latestResponse.height_cm / 100;
    return (latestResponse.weight_kg / (heightM * heightM)).toFixed(1);
  };

  // QOF Gap Analysis
  const getQOFGaps = () => {
    const gaps: { indicator: string; status: 'missing' | 'warning' | 'met'; detail: string }[] = [];
    
    // Blood Pressure
    if (latestResponse?.blood_pressure_systolic && latestResponse?.blood_pressure_diastolic) {
      const controlled = latestResponse.blood_pressure_systolic <= 140 && latestResponse.blood_pressure_diastolic <= 90;
      gaps.push({
        indicator: 'Blood Pressure',
        status: controlled ? 'met' : 'warning',
        detail: controlled 
          ? `${latestResponse.blood_pressure_systolic}/${latestResponse.blood_pressure_diastolic} mmHg (controlled)`
          : `${latestResponse.blood_pressure_systolic}/${latestResponse.blood_pressure_diastolic} mmHg (above target)`
      });
    } else {
      gaps.push({ indicator: 'Blood Pressure', status: 'missing', detail: 'No BP reading recorded' });
    }

    // Smoking status
    if (latestResponse?.smoking_status) {
      gaps.push({
        indicator: 'Smoking Status',
        status: 'met',
        detail: `Recorded: ${latestResponse.smoking_status}`
      });
    } else {
      gaps.push({ indicator: 'Smoking Status', status: 'missing', detail: 'Smoking status not recorded' });
    }

    // HbA1c for diabetic patients
    const isDiabetic = patient?.conditions?.some(c => c.toLowerCase().includes('diabetes'));
    if (isDiabetic) {
      if (patient?.hba1c_mmol_mol) {
        const controlled = patient.hba1c_mmol_mol <= 58;
        gaps.push({
          indicator: 'HbA1c (Diabetes)',
          status: controlled ? 'met' : 'warning',
          detail: controlled 
            ? `${patient.hba1c_mmol_mol} mmol/mol (at target)`
            : `${patient.hba1c_mmol_mol} mmol/mol (above 58 target)`
        });
      } else {
        gaps.push({ indicator: 'HbA1c (Diabetes)', status: 'missing', detail: 'HbA1c not recorded - diabetic patient' });
      }
    }

    // Cholesterol for CVD patients
    const hasCVD = patient?.conditions?.some(c => 
      c.toLowerCase().includes('chd') || 
      c.toLowerCase().includes('stroke') ||
      c.toLowerCase().includes('heart')
    );
    if (hasCVD) {
      if (patient?.cholesterol_ldl) {
        const atTarget = patient.cholesterol_ldl <= 2.0;
        gaps.push({
          indicator: 'LDL Cholesterol',
          status: atTarget ? 'met' : 'warning',
          detail: atTarget 
            ? `${patient.cholesterol_ldl} mmol/L (at target ≤2.0)`
            : `${patient.cholesterol_ldl} mmol/L (above 2.0 target)`
        });
      } else {
        gaps.push({ indicator: 'LDL Cholesterol', status: 'missing', detail: 'Cholesterol not recorded - CVD patient' });
      }
    }

    // AF anticoagulation
    const hasAF = patient?.conditions?.some(c => 
      c.toLowerCase().includes('atrial fibrillation') || c.toLowerCase().includes('af')
    );
    if (hasAF && patient?.cha2ds2_vasc_score !== null && patient.cha2ds2_vasc_score >= 2) {
      gaps.push({
        indicator: 'AF Anticoagulation',
        status: 'warning',
        detail: `CHA2DS2-VASc score: ${patient.cha2ds2_vasc_score} - check anticoagulation`
      });
    }

    return gaps;
  };

  const qofGaps = patient ? getQOFGaps() : [];
  const gapsMet = qofGaps.filter(g => g.status === 'met').length;
  const gapsTotal = qofGaps.length;

  const getStatusIcon = (status: 'missing' | 'warning' | 'met') => {
    switch (status) {
      case 'met': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'missing': return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getFrailtyBadge = (status: string | null) => {
    if (!status) return null;
    const colors: Record<string, string> = {
      mild: 'bg-green-100 text-green-700',
      moderate: 'bg-amber-100 text-amber-700',
      severe: 'bg-red-100 text-red-700',
    };
    return (
      <Badge className={colors[status] || 'bg-muted'}>
        Frailty: {status}
      </Badge>
    );
  };

  const getDnacprBadge = (status: string | null) => {
    if (!status) return null;
    const colors: Record<string, string> = {
      'In Place': 'bg-red-100 text-red-700 border-red-300',
      'Not in Place': 'bg-green-100 text-green-700 border-green-300',
      'Unknown': 'bg-gray-100 text-gray-700 border-gray-300',
    };
    return (
      <Badge className={`${colors[status] || 'bg-muted'} border`}>
        <Shield className="h-3 w-3 mr-1" />
        DNACPR: {status}
      </Badge>
    );
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  if (patientLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-3xl">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!patient) {
    return (
      <Dialog open={isOpen} onOpenChange={() => onClose()}>
        <DialogContent>
          <div className="text-center py-8 text-muted-foreground">
            Patient not found
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const age = calculateAge(patient.date_of_birth);
  const bmi = calculateBMI();

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <span className="text-xl">{patient.name}</span>
              {patient.nhs_number && (
                <span className="text-sm text-muted-foreground ml-2">NHS: {patient.nhs_number}</span>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Patient Quick Info */}
        <div className="flex flex-wrap gap-2 mb-2">
          {age && <Badge variant="outline">Age: {age}</Badge>}
          {getDnacprBadge(patient.dnacpr_status)}
          {getFrailtyBadge(patient.frailty_status)}
          {patient.conditions && patient.conditions.length > 0 && (
            patient.conditions.slice(0, 3).map((condition, i) => (
              <Badge key={i} variant="secondary">{condition}</Badge>
            ))
          )}
          {patient.conditions && patient.conditions.length > 3 && (
            <Badge variant="outline">+{patient.conditions.length - 3} more</Badge>
          )}
        </div>

        <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="clinical">Clinical Data</TabsTrigger>
            <TabsTrigger value="qof">QOF Gaps</TabsTrigger>
            <TabsTrigger value="history">Call History</TabsTrigger>
            <TabsTrigger value="summaries">AI Summaries</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            {/* Overview Tab - New AI Extracted Data */}
            <TabsContent value="overview" className="m-0">
              <div className="space-y-4">
                {/* AI Extract Action Card */}
                <Card className="border-dashed">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-full">
                          <Sparkles className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">AI Data Extraction</p>
                          <p className="text-xs text-muted-foreground">
                            {patient.ai_extracted_at 
                              ? `Last extracted ${formatDate(patient.ai_extracted_at)}` 
                              : 'Paste patient summary to extract data'}
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowExtractDialog(true)}
                        disabled={extractMutation.isPending}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${extractMutation.isPending ? 'animate-spin' : ''}`} />
                        {patient.ai_extracted_at ? 'Re-extract Data' : 'Extract Data'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Extract Dialog */}
                <Dialog open={showExtractDialog} onOpenChange={setShowExtractDialog}>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Extract Patient Data with AI
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Paste the patient summary, discharge letter, or clinical notes below. 
                        AI will extract key information like DNACPR status, allergies, next of kin, and more.
                      </p>
                      <Textarea
                        placeholder="Paste patient summary here..."
                        value={extractText}
                        onChange={(e) => setExtractText(e.target.value)}
                        className="min-h-[200px]"
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowExtractDialog(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={() => extractMutation.mutate({ patientId, documentText: extractText })}
                          disabled={!extractText.trim() || extractMutation.isPending}
                        >
                          {extractMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Extracting...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Extract Data
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* AI Extracted Summary */}
                {patient.ai_extracted_summary && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        AI-Extracted Summary
                        {patient.ai_extracted_at && (
                          <Badge variant="outline" className="ml-auto text-xs">
                            Extracted {formatDate(patient.ai_extracted_at)}
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{patient.ai_extracted_summary}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Key Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* DNACPR Status */}
                  <Card className={patient.dnacpr_status === 'In Place' ? 'border-red-200 bg-red-50' : ''}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        DNACPR Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        {patient.dnacpr_status ? (
                          <>
                            <span className={`text-lg font-semibold ${
                              patient.dnacpr_status === 'In Place' ? 'text-red-600' : 
                              patient.dnacpr_status === 'Not in Place' ? 'text-green-600' : 'text-gray-600'
                            }`}>
                              {patient.dnacpr_status}
                            </span>
                            {patient.dnacpr_date && (
                              <span className="text-sm text-muted-foreground">
                                (since {formatDate(patient.dnacpr_date)})
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Not recorded</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Allergies */}
                  <Card className={patient.allergies && patient.allergies.length > 0 ? 'border-amber-200 bg-amber-50' : ''}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        Allergies
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {patient.allergies && patient.allergies.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {patient.allergies.map((allergy, i) => (
                            <Badge key={i} variant="destructive" className="bg-amber-100 text-amber-800 border-amber-300">
                              {allergy}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">No known allergies recorded</span>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Next of Kin & GP Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Next of Kin */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-primary" />
                        Next of Kin
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {patient.next_of_kin_name ? (
                        <div className="space-y-1">
                          <p className="font-medium">{patient.next_of_kin_name}</p>
                          {patient.next_of_kin_relationship && (
                            <p className="text-sm text-muted-foreground">{patient.next_of_kin_relationship}</p>
                          )}
                          {patient.next_of_kin_phone && (
                            <p className="text-sm flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {patient.next_of_kin_phone}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not recorded</span>
                      )}
                    </CardContent>
                  </Card>

                  {/* GP Details */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Stethoscope className="h-4 w-4 text-primary" />
                        GP Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {patient.gp_name || patient.gp_practice ? (
                        <div className="space-y-1">
                          {patient.gp_name && <p className="font-medium">{patient.gp_name}</p>}
                          {patient.gp_practice && (
                            <p className="text-sm text-muted-foreground">{patient.gp_practice}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not recorded</span>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Care Needs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Mobility */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Accessibility className="h-4 w-4 text-primary" />
                        Mobility
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={patient.mobility_status ? 'font-medium' : 'text-muted-foreground text-sm'}>
                        {patient.mobility_status || 'Not recorded'}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Dietary */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Apple className="h-4 w-4 text-primary" />
                        Dietary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={patient.dietary_requirements ? 'font-medium' : 'text-muted-foreground text-sm'}>
                        {patient.dietary_requirements || 'Not recorded'}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Communication */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        Communication
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={patient.communication_needs ? 'font-medium' : 'text-muted-foreground text-sm'}>
                        {patient.communication_needs || 'No special needs'}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Care Home */}
                {patient.care_home_name && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Home className="h-4 w-4 text-primary" />
                        Care Home
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium">{patient.care_home_name}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Conditions & Medications in Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Conditions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {patient.conditions && patient.conditions.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {patient.conditions.map((c, i) => (
                            <Badge key={i} variant="secondary">{c}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">No conditions recorded</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Pill className="h-4 w-4" /> Medications
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {patient.medications && patient.medications.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {patient.medications.map((m, i) => (
                            <Badge key={i} variant="outline">{m}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">No medications recorded</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Clinical Data Tab */}
            <TabsContent value="clinical" className="m-0">
              <div className="space-y-4">
                {/* Vital Signs */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <HeartPulse className="h-4 w-4 text-primary" />
                      Latest Vital Signs
                      {latestResponse && (
                        <Badge variant="outline" className="ml-auto text-xs">
                          {formatDate(latestResponse.collected_at)}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Heart className="h-3 w-3" /> Blood Pressure
                        </div>
                        <p className="text-lg font-semibold">
                          {latestResponse?.blood_pressure_systolic && latestResponse?.blood_pressure_diastolic
                            ? `${latestResponse.blood_pressure_systolic}/${latestResponse.blood_pressure_diastolic} mmHg`
                            : '-'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Activity className="h-3 w-3" /> Pulse
                        </div>
                        <p className="text-lg font-semibold">
                          {latestResponse?.pulse_rate ? `${latestResponse.pulse_rate} bpm` : '-'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Scale className="h-3 w-3" /> Weight
                        </div>
                        <p className="text-lg font-semibold">
                          {latestResponse?.weight_kg ? `${latestResponse.weight_kg} kg` : '-'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Ruler className="h-3 w-3" /> Height
                        </div>
                        <p className="text-lg font-semibold">
                          {latestResponse?.height_cm ? `${latestResponse.height_cm} cm` : '-'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          BMI
                        </div>
                        <p className="text-lg font-semibold">{bmi || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Cigarette className="h-3 w-3" /> Smoking
                        </div>
                        <p className="text-lg font-semibold capitalize">
                          {latestResponse?.smoking_status || '-'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Clinical Values */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Brain className="h-4 w-4 text-primary" />
                      Clinical Values
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">HbA1c</div>
                        <p className="text-lg font-semibold">
                          {patient.hba1c_mmol_mol ? `${patient.hba1c_mmol_mol} mmol/mol` : '-'}
                        </p>
                        {patient.hba1c_date && (
                          <p className="text-xs text-muted-foreground">{formatDate(patient.hba1c_date)}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">LDL Cholesterol</div>
                        <p className="text-lg font-semibold">
                          {patient.cholesterol_ldl ? `${patient.cholesterol_ldl} mmol/L` : '-'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">HDL Cholesterol</div>
                        <p className="text-lg font-semibold">
                          {patient.cholesterol_hdl ? `${patient.cholesterol_hdl} mmol/L` : '-'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">CHA2DS2-VASc</div>
                        <p className="text-lg font-semibold">
                          {patient.cha2ds2_vasc_score ?? '-'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Alcohol</div>
                        <p className="text-lg font-semibold">
                          {latestResponse?.alcohol_units_per_week !== null && latestResponse?.alcohol_units_per_week !== undefined
                            ? `${latestResponse.alcohol_units_per_week} units/wk`
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                {patient.notes && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{patient.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* QOF Gaps Tab */}
            <TabsContent value="qof" className="m-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-primary" />
                      QOF Gap Analysis
                    </span>
                    <Badge variant={gapsMet === gapsTotal ? 'default' : 'secondary'}>
                      {gapsMet}/{gapsTotal} met
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <Progress value={(gapsMet / gapsTotal) * 100} className="h-2" />
                  </div>
                  <div className="space-y-3">
                    {qofGaps.map((gap, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                        {getStatusIcon(gap.status)}
                        <div className="flex-1">
                          <p className="font-medium text-sm">{gap.indicator}</p>
                          <p className="text-sm text-muted-foreground">{gap.detail}</p>
                        </div>
                      </div>
                    ))}
                    {qofGaps.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        No QOF indicators applicable for this patient
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Call History Tab */}
            <TabsContent value="history" className="m-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-primary" />
                    Recent Calls
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {calls.length > 0 ? (
                    <div className="space-y-3">
                      {calls.map((call) => (
                        <div key={call.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium text-sm">
                                Attempt #{call.attempt_number}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {call.started_at ? formatDate(call.started_at) : 'Pending'}
                                {call.duration_seconds && ` • ${Math.floor(call.duration_seconds / 60)}:${(call.duration_seconds % 60).toString().padStart(2, '0')}`}
                              </p>
                            </div>
                          </div>
                          <Badge variant={
                            call.status === 'completed' ? 'default' :
                            call.status === 'failed' ? 'destructive' : 'secondary'
                          }>
                            {call.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      No calls recorded for this patient
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Summaries Tab */}
            <TabsContent value="summaries" className="m-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    AI Clinical Summaries
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {aiSummaries.length > 0 ? (
                    <div className="space-y-4">
                      {aiSummaries.map((summary) => (
                        <div key={summary.id} className="p-4 border rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">
                              <Calendar className="h-3 w-3 mr-1" />
                              {formatDate(summary.created_at)}
                            </Badge>
                          </div>
                          <p className="text-sm">{summary.clinical_summary}</p>
                          {summary.key_findings && Array.isArray(summary.key_findings) && summary.key_findings.length > 0 && (
                            <div className="pt-2">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Key Findings:</p>
                              <ul className="text-sm list-disc list-inside">
                                {summary.key_findings.map((finding: string, i: number) => (
                                  <li key={i}>{finding}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {summary.action_items && Array.isArray(summary.action_items) && summary.action_items.length > 0 && (
                            <div className="pt-2">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Action Items:</p>
                              <ul className="text-sm list-disc list-inside">
                                {summary.action_items.map((item: string, i: number) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      No AI summaries generated for this patient yet
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
