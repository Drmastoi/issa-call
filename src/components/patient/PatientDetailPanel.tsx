import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  User, Heart, Activity, Cigarette, Wine, Scale, Ruler, 
  Calendar, AlertTriangle, CheckCircle, XCircle, Brain,
  HeartPulse, Wind, Pill, FileText, Phone, Clock
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

        <Tabs defaultValue="clinical" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="clinical">Clinical Data</TabsTrigger>
            <TabsTrigger value="qof">QOF Gaps</TabsTrigger>
            <TabsTrigger value="history">Call History</TabsTrigger>
            <TabsTrigger value="summaries">AI Summaries</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
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

                {/* Conditions & Medications */}
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
