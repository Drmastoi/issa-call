import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Heart, Scale, Ruler, Activity, Cigarette, Wine, User,
  Calendar, FileText, Brain, Pill, AlertTriangle, Shield,
  Accessibility, TrendingUp, TrendingDown, Minus
} from 'lucide-react';

interface HealthMetricsSummaryProps {
  patientId: string;
  patientName: string;
  isOpen: boolean;
  onClose: () => void;
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
  clinical_notes: string | null;
  call?: { transcript: string | null } | null;
}

interface PatientRecord {
  conditions: string[] | null;
  medications: string[] | null;
  allergies: string[] | null;
  hba1c_mmol_mol: number | null;
  hba1c_date: string | null;
  cholesterol_ldl: number | null;
  cholesterol_hdl: number | null;
  cholesterol_date: string | null;
  frailty_status: string | null;
  cha2ds2_vasc_score: number | null;
  dnacpr_status: string | null;
  dnacpr_date: string | null;
  mobility_status: string | null;
  date_of_birth: string | null;
  last_review_date: string | null;
}

export function HealthMetricsSummary({ 
  patientId, patientName, isOpen, onClose 
}: HealthMetricsSummaryProps) {
  const [selectedTranscript, setSelectedTranscript] = useState<string | null>(null);

  // Fetch patient record for extracted clinical data
  const { data: patient } = useQuery({
    queryKey: ['health-patient', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('conditions, medications, allergies, hba1c_mmol_mol, hba1c_date, cholesterol_ldl, cholesterol_hdl, cholesterol_date, frailty_status, cha2ds2_vasc_score, dnacpr_status, dnacpr_date, mobility_status, date_of_birth, last_review_date')
        .eq('id', patientId)
        .maybeSingle();
      if (error) throw error;
      return data as PatientRecord | null;
    },
    enabled: isOpen,
  });

  // Fetch call responses for vitals history
  const { data: responses = [], isLoading } = useQuery({
    queryKey: ['health-metrics', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_responses')
        .select('*, call:calls(transcript)')
        .eq('patient_id', patientId)
        .order('collected_at', { ascending: false });
      if (error) throw error;
      return data as CallResponse[];
    },
    enabled: isOpen,
  });

  const latest = responses[0];
  const previous = responses[1];

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const calculateAge = (dob: string | null) => {
    if (!dob) return null;
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const bmi = latest?.weight_kg && latest?.height_cm
    ? (latest.weight_kg / ((latest.height_cm / 100) ** 2)).toFixed(1)
    : null;

  const getTrend = (current: number | null | undefined, prev: number | null | undefined) => {
    if (!current || !prev) return null;
    if (current > prev) return 'up';
    if (current < prev) return 'down';
    return 'same';
  };

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'same' | null }) => {
    if (!trend) return null;
    if (trend === 'up') return <TrendingUp className="h-3 w-3 text-amber-500" />;
    if (trend === 'down') return <TrendingDown className="h-3 w-3 text-green-600" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  // Determine clinical flags
  const bpHigh = latest?.blood_pressure_systolic && latest.blood_pressure_systolic > 140;
  const hba1cHigh = patient?.hba1c_mmol_mol && patient.hba1c_mmol_mol > 58;
  const ldlHigh = patient?.cholesterol_ldl && patient.cholesterol_ldl > 2.0;
  const bmiFlag = bmi && (parseFloat(bmi) > 30 || parseFloat(bmi) < 18.5);
  const alcoholHigh = latest?.alcohol_units_per_week != null && latest.alcohol_units_per_week > 14;
  const age = calculateAge(patient?.date_of_birth ?? null);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Health Metrics — {patientName}
              {age && <Badge variant="outline" className="ml-2">Age {age}</Badge>}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="space-y-5">

              {/* Clinical Flags Banner */}
              {(bpHigh || hba1cHigh || ldlHigh || bmiFlag || alcoholHigh || patient?.frailty_status === 'severe') && (
                <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  {bpHigh && <Badge variant="destructive" className="text-xs">BP Elevated</Badge>}
                  {hba1cHigh && <Badge variant="destructive" className="text-xs">HbA1c Above Target</Badge>}
                  {ldlHigh && <Badge variant="destructive" className="text-xs">LDL Above Target</Badge>}
                  {bmiFlag && <Badge variant="destructive" className="text-xs">BMI {parseFloat(bmi!) > 30 ? 'Obese' : 'Underweight'}</Badge>}
                  {alcoholHigh && <Badge variant="destructive" className="text-xs">Alcohol &gt;14u/wk</Badge>}
                  {patient?.frailty_status === 'severe' && <Badge variant="destructive" className="text-xs">Severe Frailty</Badge>}
                </div>
              )}

              {/* Key Status Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className={`p-3 rounded-lg border ${patient?.dnacpr_status === 'In Place' ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/30'}`}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Shield className="h-3 w-3" /> DNACPR
                  </div>
                  <p className={`font-semibold text-sm ${patient?.dnacpr_status === 'In Place' ? 'text-destructive' : ''}`}>
                    {patient?.dnacpr_status || 'Not recorded'}
                  </p>
                </div>
                <div className={`p-3 rounded-lg border ${patient?.frailty_status === 'severe' ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/30'}`}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Accessibility className="h-3 w-3" /> Frailty
                  </div>
                  <p className="font-semibold text-sm capitalize">{patient?.frailty_status || 'Not assessed'}</p>
                </div>
                <div className={`p-3 rounded-lg border ${patient?.allergies && patient.allergies.length > 0 ? 'border-amber-300 bg-amber-50' : 'bg-muted/30'}`}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <AlertTriangle className="h-3 w-3" /> Allergies
                  </div>
                  <p className="font-semibold text-sm">
                    {patient?.allergies && patient.allergies.length > 0 
                      ? patient.allergies.join(', ')
                      : 'NKDA'}
                  </p>
                </div>
              </div>

              {/* Vital Signs */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-sm">Vital Signs</h3>
                  {latest && (
                    <Badge variant="outline" className="text-xs">
                      <Calendar className="h-3 w-3 mr-1" />
                      {formatDate(latest.collected_at)}
                    </Badge>
                  )}
                  {!latest && <span className="text-xs text-muted-foreground">No call data yet</span>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className={bpHigh ? 'border-destructive/40' : ''}>
                    <CardContent className="pt-3 pb-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Heart className="h-3 w-3" /> Blood Pressure
                      </div>
                      <div className="flex items-center gap-1">
                        <p className={`text-xl font-bold ${bpHigh ? 'text-destructive' : ''}`}>
                          {latest?.blood_pressure_systolic && latest?.blood_pressure_diastolic
                            ? `${latest.blood_pressure_systolic}/${latest.blood_pressure_diastolic}`
                            : '—'}
                        </p>
                        <TrendIcon trend={getTrend(latest?.blood_pressure_systolic, previous?.blood_pressure_systolic)} />
                      </div>
                      {latest?.blood_pressure_systolic && <span className="text-xs text-muted-foreground">mmHg</span>}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-3 pb-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Activity className="h-3 w-3" /> Pulse
                      </div>
                      <div className="flex items-center gap-1">
                        <p className="text-xl font-bold">{latest?.pulse_rate || '—'}</p>
                        <TrendIcon trend={getTrend(latest?.pulse_rate, previous?.pulse_rate)} />
                      </div>
                      {latest?.pulse_rate && <span className="text-xs text-muted-foreground">bpm</span>}
                    </CardContent>
                  </Card>

                  <Card className={bmiFlag ? 'border-amber-300' : ''}>
                    <CardContent className="pt-3 pb-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Scale className="h-3 w-3" /> Weight / BMI
                      </div>
                      <p className={`text-xl font-bold ${bmiFlag ? 'text-amber-600' : ''}`}>
                        {latest?.weight_kg ? `${latest.weight_kg}kg` : '—'}
                      </p>
                      {bmi && <span className="text-xs text-muted-foreground">BMI {bmi}</span>}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-3 pb-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Ruler className="h-3 w-3" /> Height
                      </div>
                      <p className="text-xl font-bold">{latest?.height_cm ? `${latest.height_cm}cm` : '—'}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Lifestyle + Lab Results */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-muted/40 border">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Cigarette className="h-3 w-3" /> Smoking
                  </div>
                  <p className="font-semibold text-sm capitalize">{latest?.smoking_status || 'Not recorded'}</p>
                </div>
                <div className={`p-3 rounded-lg border ${alcoholHigh ? 'bg-amber-50 border-amber-300' : 'bg-muted/40'}`}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Wine className="h-3 w-3" /> Alcohol
                  </div>
                  <p className={`font-semibold text-sm ${alcoholHigh ? 'text-amber-700' : ''}`}>
                    {latest?.alcohol_units_per_week != null ? `${latest.alcohol_units_per_week} units/wk` : 'Not recorded'}
                  </p>
                </div>
                <div className={`p-3 rounded-lg border ${hba1cHigh ? 'bg-destructive/5 border-destructive/30' : 'bg-muted/40'}`}>
                  <div className="text-xs text-muted-foreground mb-1">HbA1c</div>
                  <p className={`font-semibold text-sm ${hba1cHigh ? 'text-destructive' : ''}`}>
                    {patient?.hba1c_mmol_mol ? `${patient.hba1c_mmol_mol} mmol/mol` : 'Not recorded'}
                  </p>
                  {patient?.hba1c_date && <span className="text-xs text-muted-foreground">{formatDate(patient.hba1c_date)}</span>}
                </div>
                <div className={`p-3 rounded-lg border ${ldlHigh ? 'bg-amber-50 border-amber-300' : 'bg-muted/40'}`}>
                  <div className="text-xs text-muted-foreground mb-1">LDL Cholesterol</div>
                  <p className={`font-semibold text-sm ${ldlHigh ? 'text-amber-700' : ''}`}>
                    {patient?.cholesterol_ldl ? `${patient.cholesterol_ldl} mmol/L` : 'Not recorded'}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/40 border">
                  <div className="text-xs text-muted-foreground mb-1">HDL Cholesterol</div>
                  <p className="font-semibold text-sm">
                    {patient?.cholesterol_hdl ? `${patient.cholesterol_hdl} mmol/L` : 'Not recorded'}
                  </p>
                  {patient?.cholesterol_date && <span className="text-xs text-muted-foreground">{formatDate(patient.cholesterol_date)}</span>}
                </div>
                <div className="p-3 rounded-lg bg-muted/40 border">
                  <div className="text-xs text-muted-foreground mb-1">CHA₂DS₂-VASc</div>
                  <p className={`font-semibold text-sm ${patient?.cha2ds2_vasc_score && patient.cha2ds2_vasc_score >= 2 ? 'text-amber-700' : ''}`}>
                    {patient?.cha2ds2_vasc_score ?? 'Not recorded'}
                  </p>
                </div>
              </div>

              {/* Conditions & Medications */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">Conditions ({patient?.conditions?.length || 0})</h3>
                  </div>
                  {patient?.conditions && patient.conditions.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {patient.conditions.map((c, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">None recorded</p>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Pill className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">Medications ({patient?.medications?.length || 0})</h3>
                  </div>
                  {patient?.medications && patient.medications.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {patient.medications.map((m, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{m}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">None recorded</p>
                  )}
                </div>
              </div>

              {/* Vitals History */}
              {responses.length > 1 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-sm mb-3">Vitals History ({responses.length} readings)</h3>
                    <div className="space-y-2">
                      {responses.slice(1, 6).map((r) => (
                        <div key={r.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 border text-sm">
                          <span className="text-xs text-muted-foreground w-24">{formatDate(r.collected_at)}</span>
                          <div className="flex items-center gap-3 flex-1">
                            {r.blood_pressure_systolic && r.blood_pressure_diastolic && (
                              <span className={r.blood_pressure_systolic > 140 ? 'text-destructive font-medium' : ''}>
                                BP {r.blood_pressure_systolic}/{r.blood_pressure_diastolic}
                              </span>
                            )}
                            {r.pulse_rate && <span>HR {r.pulse_rate}</span>}
                            {r.weight_kg && <span>Wt {r.weight_kg}kg</span>}
                            {r.smoking_status && <Badge variant="outline" className="text-xs">{r.smoking_status}</Badge>}
                          </div>
                          {r.call?.transcript && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs"
                              onClick={() => setSelectedTranscript(r.call?.transcript ?? null)}>
                              <FileText className="h-3 w-3 mr-1" />Transcript
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Carer indicator */}
              {latest?.is_carer != null && (
                <Badge variant="outline" className="flex items-center gap-1 w-fit text-xs">
                  <User className="h-3 w-3" />
                  {latest.is_carer ? 'Carer-reported' : 'Self-reported'}
                </Badge>
              )}

              {/* Last review */}
              {patient?.last_review_date && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Last clinical review: {formatDate(patient.last_review_date)}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transcript Dialog */}
      <Dialog open={!!selectedTranscript} onOpenChange={() => setSelectedTranscript(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Call Transcript
            </DialogTitle>
          </DialogHeader>
          <div className="bg-muted/50 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
            <pre className="whitespace-pre-wrap text-sm font-sans">{selectedTranscript || 'No transcript available'}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
