import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Heart, 
  Weight, 
  Ruler, 
  Activity,
  Cigarette,
  Wine,
  User,
  Calendar,
  X,
  FileText
} from 'lucide-react';

interface HealthMetricsSummaryProps {
  patientId: string;
  patientName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface CallResponse {
  id: string;
  call_id: string;
  patient_id: string;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  pulse_rate: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  smoking_status: string | null;
  alcohol_units_per_week: number | null;
  is_carer: boolean | null;
  collected_at: string;
  call?: {
    transcript: string | null;
  };
}

export function HealthMetricsSummary({ 
  patientId, 
  patientName, 
  isOpen, 
  onClose 
}: HealthMetricsSummaryProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [selectedTranscript, setSelectedTranscript] = useState<string | null>(null);

  const { data: responses, isLoading } = useQuery({
    queryKey: ['health-metrics', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_responses')
        .select(`
          *,
          call:calls(transcript)
        `)
        .eq('patient_id', patientId)
        .order('collected_at', { ascending: false });
      
      if (error) throw error;
      return data as (CallResponse & { call: { transcript: string | null } | null })[];
    },
    enabled: isOpen,
  });

  const latestResponse = responses?.[0];

  const getSmokingBadgeVariant = (status: string | null) => {
    if (!status) return 'secondary';
    const lower = status.toLowerCase();
    if (lower === 'never' || lower === 'never smoked') return 'default';
    if (lower === 'former' || lower === 'ex-smoker' || lower === 'quit') return 'secondary';
    return 'destructive';
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleViewTranscript = (transcript: string | null) => {
    setSelectedTranscript(transcript);
    setShowTranscript(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Health Metrics - {patientName}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : !responses || responses.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No health data collected yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Data will appear here after a call with this patient
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Latest Metrics */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold">Latest Reading</h3>
                  <Badge variant="outline" className="text-xs">
                    <Calendar className="h-3 w-3 mr-1" />
                    {formatDate(latestResponse!.collected_at)}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Blood Pressure */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Heart className="h-4 w-4 text-red-500" />
                        Blood Pressure
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {latestResponse?.blood_pressure_systolic && latestResponse?.blood_pressure_diastolic ? (
                        <div className="text-2xl font-bold">
                          {latestResponse.blood_pressure_systolic}/{latestResponse.blood_pressure_diastolic}
                          <span className="text-sm font-normal text-muted-foreground ml-1">mmHg</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not recorded</span>
                      )}
                    </CardContent>
                  </Card>

                  {/* Pulse Rate */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4 text-pink-500" />
                        Pulse Rate
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {latestResponse?.pulse_rate ? (
                        <div className="text-2xl font-bold">
                          {latestResponse.pulse_rate}
                          <span className="text-sm font-normal text-muted-foreground ml-1">bpm</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not recorded</span>
                      )}
                    </CardContent>
                  </Card>

                  {/* Weight */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Weight className="h-4 w-4 text-blue-500" />
                        Weight
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {latestResponse?.weight_kg ? (
                        <div className="text-2xl font-bold">
                          {latestResponse.weight_kg}
                          <span className="text-sm font-normal text-muted-foreground ml-1">kg</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not recorded</span>
                      )}
                    </CardContent>
                  </Card>

                  {/* Height */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Ruler className="h-4 w-4 text-green-500" />
                        Height
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {latestResponse?.height_cm ? (
                        <div className="text-2xl font-bold">
                          {latestResponse.height_cm}
                          <span className="text-sm font-normal text-muted-foreground ml-1">cm</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not recorded</span>
                      )}
                    </CardContent>
                  </Card>

                  {/* Smoking Status */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Cigarette className="h-4 w-4 text-orange-500" />
                        Smoking Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {latestResponse?.smoking_status ? (
                        <Badge variant={getSmokingBadgeVariant(latestResponse.smoking_status)}>
                          {latestResponse.smoking_status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Not recorded</span>
                      )}
                    </CardContent>
                  </Card>

                  {/* Alcohol */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Wine className="h-4 w-4 text-purple-500" />
                        Alcohol
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {latestResponse?.alcohol_units_per_week !== null && latestResponse?.alcohol_units_per_week !== undefined ? (
                        <div className="text-2xl font-bold">
                          {latestResponse.alcohol_units_per_week}
                          <span className="text-sm font-normal text-muted-foreground ml-1">units/week</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not recorded</span>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Carer Status */}
                {latestResponse?.is_carer !== null && latestResponse?.is_carer !== undefined && (
                  <div className="mt-4">
                    <Badge variant="outline" className="flex items-center gap-1 w-fit">
                      <User className="h-3 w-3" />
                      {latestResponse.is_carer ? 'Response provided by carer' : 'Self-reported'}
                    </Badge>
                  </div>
                )}
              </div>

              {/* History */}
              {responses.length > 1 && (
                <div>
                  <h3 className="font-semibold mb-3">Previous Readings</h3>
                  <div className="space-y-2">
                    {responses.slice(1).map((response) => (
                      <Card key={response.id} className="bg-muted/30">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-muted-foreground">
                                {formatDate(response.collected_at)}
                              </span>
                              {response.blood_pressure_systolic && response.blood_pressure_diastolic && (
                                <span>
                                  BP: {response.blood_pressure_systolic}/{response.blood_pressure_diastolic}
                                </span>
                              )}
                              {response.weight_kg && (
                                <span>Weight: {response.weight_kg}kg</span>
                              )}
                              {response.pulse_rate && (
                                <span>Pulse: {response.pulse_rate}bpm</span>
                              )}
                            </div>
                            {response.call?.transcript && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewTranscript(response.call?.transcript ?? null)}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Transcript
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* View Latest Transcript Button */}
              {latestResponse?.call?.transcript && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleViewTranscript(latestResponse.call?.transcript ?? null)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Latest Call Transcript
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transcript Dialog */}
      <Dialog open={showTranscript} onOpenChange={setShowTranscript}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Call Transcript
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="bg-muted/50 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
            <pre className="whitespace-pre-wrap text-sm font-mono">
              {selectedTranscript || 'No transcript available'}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
