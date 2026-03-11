import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { patientId } = await req.json();
    if (!patientId) {
      return new Response(JSON.stringify({ error: 'patientId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch patient data
    const { data: patient, error: pErr } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();
    if (pErr || !patient) throw new Error('Patient not found');

    // Fetch latest call responses
    const { data: responses } = await supabase
      .from('call_responses')
      .select('blood_pressure_systolic, blood_pressure_diastolic, smoking_status, collected_at, weight_kg, height_cm, pulse_rate, alcohol_units_per_week, clinical_notes')
      .eq('patient_id', patientId)
      .order('collected_at', { ascending: false })
      .limit(5);

    // Fetch recent calls for transcript context
    const { data: calls } = await supabase
      .from('calls')
      .select('transcript, status, started_at')
      .eq('patient_id', patientId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(3);

    // Fetch pending tasks
    const { data: tasks } = await supabase
      .from('meditask_tasks')
      .select('title, priority, status')
      .eq('patient_id', patientId)
      .neq('status', 'completed')
      .limit(10);

    // Build context for AI - sanitize PII
    const patientRef = `Patient-${patientId.substring(0, 4).toUpperCase()}`;
    
    const clinicalContext = {
      conditions: patient.conditions || [],
      medications: patient.medications || [],
      allergies: patient.allergies || [],
      frailty_status: patient.frailty_status,
      dnacpr_status: patient.dnacpr_status,
      dnacpr_date: patient.dnacpr_date,
      mobility_status: patient.mobility_status,
      dietary_requirements: patient.dietary_requirements,
      communication_needs: patient.communication_needs,
      hba1c_mmol_mol: patient.hba1c_mmol_mol,
      hba1c_date: patient.hba1c_date,
      cholesterol_ldl: patient.cholesterol_ldl,
      cholesterol_hdl: patient.cholesterol_hdl,
      cholesterol_date: patient.cholesterol_date,
      last_review_date: patient.last_review_date,
      cha2ds2_vasc_score: patient.cha2ds2_vasc_score,
      date_of_birth: patient.date_of_birth,
      notes: patient.notes,
      recent_responses: (responses || []).map(r => ({
        bp: r.blood_pressure_systolic && r.blood_pressure_diastolic ? `${r.blood_pressure_systolic}/${r.blood_pressure_diastolic}` : null,
        smoking: r.smoking_status,
        weight: r.weight_kg,
        height: r.height_cm,
        pulse: r.pulse_rate,
        alcohol: r.alcohol_units_per_week,
        date: r.collected_at,
        notes: r.clinical_notes,
      })),
      recent_transcripts: (calls || []).map(c => c.transcript?.substring(0, 500)).filter(Boolean),
      pending_tasks: (tasks || []).map(t => ({ title: t.title, priority: t.priority })),
    };

    const systemPrompt = `You are a UK NHS clinical summarisation assistant for care home patients. Generate a structured clinical summary using EXACTLY this template format. Be concise and clinically relevant. Use "Not documented" if information is unavailable. Never invent data.

TEMPLATE:
ACUTE ISSUE: [Current acute clinical concern or "None currently"]
ACTION TAKEN: [Recent clinical actions taken based on call transcripts/notes, or "Awaiting review"]
PAST MEDICAL HX: [Comma-separated list of conditions from patient record]
MEDICATION HX: [Comma-separated list of current medications]
PENDING TASKS: [Only clinically required tasks from task list - exclude routine admin]
Pending Referral: [Any pending referrals mentioned in notes/transcripts, or "None"]
SAFETY NET ADVICE: [Relevant safety netting based on conditions e.g. when to seek urgent help]
Last Blood Tests Date: [Date and brief interpretation of HbA1c/cholesterol if available]
Medication Review Date: [From last_review_date or notes, or "Not documented"]
Covert Medication Date: [If documented in notes, otherwise "N/A"]
DNACPR Date: [DNACPR date if in place]
EPaCCS: [Yes/No based on available info, default "Not documented"]

IMPORTANT: Output ONLY the filled template above, nothing else.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate clinical summary for ${patientRef} with this data:\n${JSON.stringify(clinicalContext, null, 2)}` }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI error:', errText);
      throw new Error(`AI request failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const summary = aiResult.choices?.[0]?.message?.content?.trim();

    if (!summary) throw new Error('No summary generated');

    // Save summary to patient record
    const { error: updateErr } = await supabase
      .from('patients')
      .update({
        ai_extracted_summary: summary,
        ai_extracted_at: new Date().toISOString(),
      })
      .eq('id', patientId);

    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error generating patient summary:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
