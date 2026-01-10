import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Risk thresholds
const THRESHOLDS = {
  BP_SYSTOLIC_HIGH: 140,
  BP_DIASTOLIC_HIGH: 90,
  ALCOHOL_HIGH: 14,
  BMI_OBESE: 30,
  BMI_OVERWEIGHT: 25,
  WEIGHT_CHANGE_PERCENT: 5,
};

interface CallResponse {
  id: string;
  patient_id: string;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  pulse_rate: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  smoking_status: string | null;
  alcohol_units_per_week: number | null;
  transcript: string | null;
  collected_at: string;
}

interface HealthAlert {
  patient_id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metrics: Record<string, unknown>;
}

function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

function analyzePatientMetrics(responses: CallResponse[], patientName: string): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  if (!responses.length) return alerts;

  const latest = responses[0];
  const patientId = latest.patient_id;

  // Check blood pressure
  if (latest.blood_pressure_systolic && latest.blood_pressure_diastolic) {
    if (latest.blood_pressure_systolic >= 180 || latest.blood_pressure_diastolic >= 120) {
      alerts.push({
        patient_id: patientId,
        alert_type: 'high_bp',
        severity: 'critical',
        title: `Critical BP: ${patientName}`,
        description: `Hypertensive crisis detected. BP: ${latest.blood_pressure_systolic}/${latest.blood_pressure_diastolic} mmHg. Immediate review required.`,
        metrics: { systolic: latest.blood_pressure_systolic, diastolic: latest.blood_pressure_diastolic }
      });
    } else if (latest.blood_pressure_systolic >= THRESHOLDS.BP_SYSTOLIC_HIGH || 
               latest.blood_pressure_diastolic >= THRESHOLDS.BP_DIASTOLIC_HIGH) {
      alerts.push({
        patient_id: patientId,
        alert_type: 'high_bp',
        severity: 'warning',
        title: `Elevated BP: ${patientName}`,
        description: `Blood pressure above target. BP: ${latest.blood_pressure_systolic}/${latest.blood_pressure_diastolic} mmHg. Consider review.`,
        metrics: { systolic: latest.blood_pressure_systolic, diastolic: latest.blood_pressure_diastolic }
      });
    }
  }

  // Check alcohol consumption
  if (latest.alcohol_units_per_week !== null && latest.alcohol_units_per_week > THRESHOLDS.ALCOHOL_HIGH) {
    alerts.push({
      patient_id: patientId,
      alert_type: 'high_alcohol',
      severity: latest.alcohol_units_per_week > 21 ? 'critical' : 'warning',
      title: `High Alcohol: ${patientName}`,
      description: `Alcohol consumption ${latest.alcohol_units_per_week} units/week exceeds recommended limit of 14 units. Brief intervention advised.`,
      metrics: { units_per_week: latest.alcohol_units_per_week }
    });
  }

  // Check BMI
  if (latest.weight_kg && latest.height_cm) {
    const bmi = calculateBMI(latest.weight_kg, latest.height_cm);
    if (bmi >= THRESHOLDS.BMI_OBESE) {
      alerts.push({
        patient_id: patientId,
        alert_type: 'obesity',
        severity: bmi >= 40 ? 'critical' : 'warning',
        title: `Obesity Alert: ${patientName}`,
        description: `BMI ${bmi.toFixed(1)} indicates ${bmi >= 40 ? 'severe ' : ''}obesity. Weight management support recommended.`,
        metrics: { bmi: bmi.toFixed(1), weight_kg: latest.weight_kg, height_cm: latest.height_cm }
      });
    }
  }

  // Check weight change pattern
  if (responses.length >= 2) {
    const previous = responses.find(r => r.weight_kg && r.id !== latest.id);
    if (latest.weight_kg && previous?.weight_kg) {
      const changePercent = Math.abs((latest.weight_kg - previous.weight_kg) / previous.weight_kg * 100);
      if (changePercent >= THRESHOLDS.WEIGHT_CHANGE_PERCENT) {
        const direction = latest.weight_kg > previous.weight_kg ? 'gain' : 'loss';
        alerts.push({
          patient_id: patientId,
          alert_type: 'weight_change',
          severity: changePercent >= 10 ? 'critical' : 'warning',
          title: `Rapid Weight ${direction === 'gain' ? 'Gain' : 'Loss'}: ${patientName}`,
          description: `${changePercent.toFixed(1)}% weight ${direction} detected. Previous: ${previous.weight_kg}kg, Current: ${latest.weight_kg}kg.`,
          metrics: { change_percent: changePercent.toFixed(1), previous_kg: previous.weight_kg, current_kg: latest.weight_kg }
        });
      }
    }
  }

  // Check BP pattern (3+ consecutive high readings)
  const highBPCount = responses.slice(0, 5).filter(r => 
    (r.blood_pressure_systolic && r.blood_pressure_systolic >= THRESHOLDS.BP_SYSTOLIC_HIGH) ||
    (r.blood_pressure_diastolic && r.blood_pressure_diastolic >= THRESHOLDS.BP_DIASTOLIC_HIGH)
  ).length;

  if (highBPCount >= 3) {
    alerts.push({
      patient_id: patientId,
      alert_type: 'pattern',
      severity: 'warning',
      title: `Persistent High BP: ${patientName}`,
      description: `${highBPCount} consecutive elevated BP readings detected. Hypertension diagnosis and treatment review recommended.`,
      metrics: { consecutive_high_readings: highBPCount }
    });
  }

  return alerts;
}

async function generateClinicalSummary(
  transcript: string,
  metrics: CallResponse,
  patientName: string
): Promise<{ clinical_summary: string; key_findings: string[]; action_items: string[]; qof_relevance: Record<string, boolean> }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.error('LOVABLE_API_KEY not configured');
    return {
      clinical_summary: 'AI summary unavailable - API key not configured.',
      key_findings: [],
      action_items: [],
      qof_relevance: {}
    };
  }

  const bmi = metrics.weight_kg && metrics.height_cm 
    ? calculateBMI(metrics.weight_kg, metrics.height_cm).toFixed(1) 
    : 'Not recorded';

  const prompt = `You are a clinical summarization assistant for a GP practice. Generate a concise clinical summary from this patient health check call.

Patient: ${patientName}
Date: ${new Date(metrics.collected_at).toLocaleDateString('en-GB')}

Recorded Metrics:
- Blood Pressure: ${metrics.blood_pressure_systolic || 'N/R'}/${metrics.blood_pressure_diastolic || 'N/R'} mmHg
- Pulse: ${metrics.pulse_rate || 'N/R'} bpm
- Weight: ${metrics.weight_kg || 'N/R'} kg
- Height: ${metrics.height_cm || 'N/R'} cm
- BMI: ${bmi}
- Smoking Status: ${metrics.smoking_status || 'N/R'}
- Alcohol: ${metrics.alcohol_units_per_week ?? 'N/R'} units/week

Call Transcript:
${transcript || 'No transcript available'}

Provide a JSON response with:
1. "clinical_summary": A 2-3 sentence clinical summary suitable for medical records
2. "key_findings": Array of 3-5 key clinical findings
3. "action_items": Array of recommended follow-up actions
4. "qof_relevance": Object with boolean flags for QOF indicators: hypertension_monitoring, smoking_cessation, bmi_recorded, alcohol_screening`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You are a clinical summarization assistant. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error('AI gateway error:', response.status);
      throw new Error('AI gateway error');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error('Invalid JSON response');
  } catch (error) {
    console.error('Error generating summary:', error);
    return {
      clinical_summary: `Health check completed for ${patientName}. BP: ${metrics.blood_pressure_systolic || 'N/R'}/${metrics.blood_pressure_diastolic || 'N/R'}, Weight: ${metrics.weight_kg || 'N/R'}kg, Smoking: ${metrics.smoking_status || 'N/R'}.`,
      key_findings: [
        metrics.blood_pressure_systolic ? `BP recorded: ${metrics.blood_pressure_systolic}/${metrics.blood_pressure_diastolic}` : 'BP not recorded',
        metrics.weight_kg ? `Weight: ${metrics.weight_kg}kg` : 'Weight not recorded',
        metrics.smoking_status ? `Smoking: ${metrics.smoking_status}` : 'Smoking status not recorded'
      ].filter(f => !f.includes('not recorded')),
      action_items: [],
      qof_relevance: {
        hypertension_monitoring: !!metrics.blood_pressure_systolic,
        smoking_cessation: !!metrics.smoking_status,
        bmi_recorded: !!(metrics.weight_kg && metrics.height_cm),
        alcohol_screening: metrics.alcohol_units_per_week !== null
      }
    };
  }
}

async function generateDashboardInsights(supabaseClient: any): Promise<{
  due_for_annual: number;
  critical_alerts: number;
  warning_alerts: number;
  bp_coverage: { recorded: number; total: number };
  smoking_coverage: { recorded: number; total: number };
  bmi_coverage: { recorded: number; total: number };
  call_completion_rate: number;
  trend_insights: string[];
}> {
  // Get total patients
  const { count: totalPatients } = await supabaseClient
    .from('patients')
    .select('*', { count: 'exact', head: true });

  // Get patients with recent (last year) call responses
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const { data: recentResponses } = await supabaseClient
    .from('call_responses')
    .select('patient_id, blood_pressure_systolic, smoking_status, weight_kg, height_cm')
    .gte('collected_at', oneYearAgo.toISOString());

  const responseList = (recentResponses || []) as Array<{
    patient_id: string;
    blood_pressure_systolic: number | null;
    smoking_status: string | null;
    weight_kg: number | null;
    height_cm: number | null;
  }>;

  const uniquePatients = new Set(responseList.map(r => r.patient_id));
  const dueForAnnual = (totalPatients || 0) - uniquePatients.size;

  // Get alert counts
  const { count: criticalAlerts } = await supabaseClient
    .from('health_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('severity', 'critical')
    .is('acknowledged_at', null);

  const { count: warningAlerts } = await supabaseClient
    .from('health_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('severity', 'warning')
    .is('acknowledged_at', null);

  // Calculate coverage metrics
  const bpRecorded = new Set(responseList.filter(r => r.blood_pressure_systolic).map(r => r.patient_id));
  const smokingRecorded = new Set(responseList.filter(r => r.smoking_status).map(r => r.patient_id));
  const bmiRecorded = new Set(responseList.filter(r => r.weight_kg && r.height_cm).map(r => r.patient_id));

  // Calculate call completion rate (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { count: totalCalls } = await supabaseClient
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', weekAgo.toISOString());

  const { count: completedCalls } = await supabaseClient
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('created_at', weekAgo.toISOString());

  const completionRate = totalCalls ? Math.round((completedCalls || 0) / totalCalls * 100) : 0;

  // Generate trend insights
  const trendInsights: string[] = [];
  
  if (dueForAnnual > 0) {
    trendInsights.push(`${dueForAnnual} patients due for annual health check`);
  }
  if (criticalAlerts && criticalAlerts > 0) {
    trendInsights.push(`${criticalAlerts} patients need urgent review`);
  }
  if (completionRate >= 80) {
    trendInsights.push(`Excellent ${completionRate}% call completion rate this week`);
  } else if (completionRate < 50 && totalCalls && totalCalls > 0) {
    trendInsights.push(`Call completion rate is ${completionRate}% - consider follow-up strategy`);
  }

  return {
    due_for_annual: dueForAnnual,
    critical_alerts: criticalAlerts || 0,
    warning_alerts: warningAlerts || 0,
    bp_coverage: { recorded: bpRecorded.size, total: totalPatients || 0 },
    smoking_coverage: { recorded: smokingRecorded.size, total: totalPatients || 0 },
    bmi_coverage: { recorded: bmiRecorded.size, total: totalPatients || 0 },
    call_completion_rate: completionRate,
    trend_insights: trendInsights
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { mode, patient_id, call_id } = await req.json();
    console.log(`AI Health Analysis - Mode: ${mode}, Patient: ${patient_id}, Call: ${call_id}`);

    if (mode === 'analyze-patient' && patient_id) {
      // Get patient info
      const { data: patient } = await supabase
        .from('patients')
        .select('first_name, last_name')
        .eq('id', patient_id)
        .single();

      const patientName = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient';

      // Get recent call responses
      const { data: responses } = await supabase
        .from('call_responses')
        .select('*')
        .eq('patient_id', patient_id)
        .order('collected_at', { ascending: false })
        .limit(10);

      if (!responses || responses.length === 0) {
        return new Response(JSON.stringify({ alerts: [], message: 'No data to analyze' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const alerts = analyzePatientMetrics(responses as CallResponse[], patientName);

      // Clear old unacknowledged alerts for this patient and insert new ones
      if (alerts.length > 0) {
        await supabase
          .from('health_alerts')
          .delete()
          .eq('patient_id', patient_id)
          .is('acknowledged_at', null);

        await supabase.from('health_alerts').insert(alerts);
      }

      return new Response(JSON.stringify({ alerts, count: alerts.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (mode === 'analyze-all') {
      // Batch analysis for all patients
      const { data: patients } = await supabase
        .from('patients')
        .select('id, first_name, last_name');

      let totalAlerts = 0;
      const allAlerts: HealthAlert[] = [];

      for (const patient of patients || []) {
        const { data: responses } = await supabase
          .from('call_responses')
          .select('*')
          .eq('patient_id', patient.id)
          .order('collected_at', { ascending: false })
          .limit(10);

        if (responses && responses.length > 0) {
          const patientName = `${patient.first_name} ${patient.last_name}`;
          const alerts = analyzePatientMetrics(responses as CallResponse[], patientName);
          allAlerts.push(...alerts);
          totalAlerts += alerts.length;
        }
      }

      // Clear old alerts and insert new ones
      if (allAlerts.length > 0) {
        await supabase
          .from('health_alerts')
          .delete()
          .is('acknowledged_at', null);

        await supabase.from('health_alerts').insert(allAlerts);
      }

      return new Response(JSON.stringify({ total_alerts: totalAlerts, message: 'Batch analysis complete' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (mode === 'summarize-call' && call_id) {
      // Get call and response data
      const { data: call } = await supabase
        .from('calls')
        .select('*, patients(first_name, last_name)')
        .eq('id', call_id)
        .single();

      const { data: response } = await supabase
        .from('call_responses')
        .select('*')
        .eq('call_id', call_id)
        .single();

      if (!call || !response) {
        return new Response(JSON.stringify({ error: 'Call or response not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const patientName = call.patients ? `${call.patients.first_name} ${call.patients.last_name}` : 'Unknown';
      const summary = await generateClinicalSummary(response.transcript, response as CallResponse, patientName);

      // Store the summary
      await supabase.from('ai_summaries').upsert({
        call_id,
        patient_id: call.patient_id,
        clinical_summary: summary.clinical_summary,
        key_findings: summary.key_findings,
        action_items: summary.action_items,
        qof_relevance: summary.qof_relevance
      }, { onConflict: 'call_id' });

      return new Response(JSON.stringify(summary), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (mode === 'dashboard-insights') {
      const insights = await generateDashboardInsights(supabase);

      return new Response(JSON.stringify(insights), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      return new Response(JSON.stringify({ error: 'Invalid mode or missing parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Error in ai-health-analysis:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
