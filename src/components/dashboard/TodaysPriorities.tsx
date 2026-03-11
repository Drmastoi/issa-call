import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ShieldCheck, Phone, Sparkles } from 'lucide-react';
import { analyzeAllPatients, getClinicalActionStats, Patient, CallResponse } from '@/lib/clinical-analysis';

export function TodaysPriorities() {
  const navigate = useNavigate();

  const { data: patients = [] } = useQuery({
    queryKey: ['clinical-patients'],
    queryFn: async () => {
      const { data } = await supabase
        .from('patients')
        .select('id, name, nhs_number, phone_number, date_of_birth, conditions, medications, hba1c_mmol_mol, hba1c_date, cholesterol_ldl, cholesterol_hdl, cholesterol_date, frailty_status, last_review_date, cha2ds2_vasc_score')
        .order('name');
      return (data ?? []) as Patient[];
    },
    refetchInterval: 60000,
  });

  const { data: callResponses = [] } = useQuery({
    queryKey: ['clinical-responses'],
    queryFn: async () => {
      const { data } = await supabase
        .from('call_responses')
        .select('id, patient_id, blood_pressure_systolic, blood_pressure_diastolic, smoking_status, collected_at, weight_kg, height_cm')
        .order('collected_at', { ascending: false });
      return (data ?? []) as CallResponse[];
    },
    refetchInterval: 60000,
  });

  const { data: unverifiedCount = 0 } = useQuery({
    queryKey: ['unverified-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('call_responses')
        .select('id', { count: 'exact', head: true })
        .eq('verification_status', 'unverified');
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  const { data: pendingCalls = 0 } = useQuery({
    queryKey: ['pending-calls-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  const stats = getClinicalActionStats(analyzeAllPatients(patients, callResponses));

  const items = [
    {
      icon: <AlertTriangle className="h-4 w-4" />,
      label: 'Critical actions',
      count: stats.critical,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
      path: '/ai-tasks',
    },
    {
      icon: <Sparkles className="h-4 w-4" />,
      label: 'Total clinical actions',
      count: stats.total,
      color: 'text-primary',
      bg: 'bg-primary/10',
      path: '/ai-tasks',
    },
    {
      icon: <ShieldCheck className="h-4 w-4" />,
      label: 'Awaiting verification',
      count: unverifiedCount,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      path: '/clinical-verification',
    },
    {
      icon: <Phone className="h-4 w-4" />,
      label: 'Pending calls',
      count: pendingCalls,
      color: 'text-warning',
      bg: 'bg-warning/10',
      path: '/calls',
    },
  ];

  return (
    <Card className="h-full shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          Today's Priorities
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map(item => (
          <button
            key={item.label}
            onClick={() => navigate(item.path)}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
          >
            <div className={`p-1.5 rounded-md ${item.bg}`}>
              <span className={item.color}>{item.icon}</span>
            </div>
            <span className="flex-1 text-sm">{item.label}</span>
            <Badge variant={item.count > 0 ? 'default' : 'secondary'} className="text-xs">
              {item.count}
            </Badge>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
