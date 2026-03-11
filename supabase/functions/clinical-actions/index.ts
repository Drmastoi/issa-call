import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS } from "../_shared/pii-extraction.ts";

/**
 * Auto-trigger clinical actions after data extraction.
 * Analyses patient data against QOF/NICE guidelines and creates MediTask tasks.
 * Also maps conditions to Read/SNOMED codes for EHR interoperability.
 */

interface ClinicalRule {
  id: string;
  check: (patient: any, responses: any[]) => { triggered: boolean; title: string; description: string; priority: string } | null;
}

const CLINICAL_RULES: ClinicalRule[] = [
  {
    id: 'hyp-uncontrolled',
    check: (p, responses) => {
      if (!p.conditions?.some((c: string) => /hypertension/i.test(c))) return null;
      const latest = responses[0];
      if (!latest?.blood_pressure_systolic) return null;
      const age = p.date_of_birth ? Math.floor((Date.now() - new Date(p.date_of_birth).getTime()) / 31557600000) : null;
      const target = age && age >= 80 ? 150 : 140;
      if (latest.blood_pressure_systolic > target || latest.blood_pressure_diastolic > 90) {
        const urgent = latest.blood_pressure_systolic >= 180;
        return {
          triggered: true,
          title: `BP Review: ${latest.blood_pressure_systolic}/${latest.blood_pressure_diastolic}`,
          description: `Hypertensive patient BP exceeds target ≤${target}/90. ${urgent ? 'URGENT: Consider same-day assessment.' : 'Medication review needed.'}`,
          priority: urgent ? 'urgent' : 'high',
        };
      }
      return null;
    }
  },
  {
    id: 'dm-hba1c-high',
    check: (p) => {
      if (!p.conditions?.some((c: string) => /diabetes|T[12]DM/i.test(c))) return null;
      if (!p.hba1c_mmol_mol) return null;
      const isFrail = p.frailty_status === 'moderate' || p.frailty_status === 'severe';
      const target = isFrail ? 75 : 58;
      if (p.hba1c_mmol_mol > target) {
        return {
          triggered: true,
          title: `HbA1c ${p.hba1c_mmol_mol} mmol/mol - Above Target`,
          description: `Diabetic patient HbA1c exceeds target ≤${target}. ${p.hba1c_mmol_mol > 86 ? 'URGENT: Medication intensification required.' : 'Medication review and lifestyle counselling.'}`,
          priority: p.hba1c_mmol_mol > 86 ? 'urgent' : 'high',
        };
      }
      return null;
    }
  },
  {
    id: 'dm-statin-missing',
    check: (p) => {
      if (!p.conditions?.some((c: string) => /diabetes|T[12]DM/i.test(c))) return null;
      const age = p.date_of_birth ? Math.floor((Date.now() - new Date(p.date_of_birth).getTime()) / 31557600000) : null;
      if (age && age < 40) return null;
      const statins = ['statin', 'atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin'];
      if (p.medications?.some((m: string) => statins.some(s => m.toLowerCase().includes(s)))) return null;
      return {
        triggered: true,
        title: 'Statin Initiation Review (Diabetes)',
        description: 'Diabetic patient aged 40+ not on statin therapy. Review for Atorvastatin 20mg.',
        priority: 'normal',
      };
    }
  },
  {
    id: 'af-anticoag-missing',
    check: (p) => {
      if (!p.conditions?.some((c: string) => /atrial fibrillation|AF\b/i.test(c))) return null;
      const score = p.cha2ds2_vasc_score ?? 2;
      if (score < 2) return null;
      const anticoags = ['warfarin', 'apixaban', 'rivaroxaban', 'edoxaban', 'dabigatran'];
      if (p.medications?.some((m: string) => anticoags.some(a => m.toLowerCase().includes(a)))) return null;
      return {
        triggered: true,
        title: 'Anticoagulation Required for AF',
        description: `CHA₂DS₂-VASc ≥2 with no anticoagulation. High stroke risk. Initiate DOAC.`,
        priority: 'urgent',
      };
    }
  },
  {
    id: 'annual-review-overdue',
    check: (p) => {
      if (!p.conditions || p.conditions.length < 2) return null;
      if (p.last_review_date) {
        const months = (Date.now() - new Date(p.last_review_date).getTime()) / (30.44 * 24 * 60 * 60 * 1000);
        if (months <= 12) return null;
      }
      return {
        triggered: true,
        title: 'Annual Care Review Overdue',
        description: `Patient with ${p.conditions.length} conditions needs comprehensive annual review.`,
        priority: 'normal',
      };
    }
  },
  {
    id: 'polypharmacy',
    check: (p) => {
      const count = p.medications?.length || 0;
      if (count < 10) return null;
      return {
        triggered: true,
        title: `Polypharmacy Review (${count} Medications)`,
        description: 'High medication burden. Structured medication review with deprescribing assessment needed.',
        priority: 'normal',
      };
    }
  },
  {
    id: 'falls-risk',
    check: (p) => {
      if (p.frailty_status !== 'moderate' && p.frailty_status !== 'severe') return null;
      const medCount = p.medications?.length || 0;
      if (medCount < 5) return null;
      return {
        triggered: true,
        title: 'Falls Risk Assessment Due',
        description: `Frail patient (${p.frailty_status}) on ${medCount} medications. Multifactorial falls assessment needed.`,
        priority: p.frailty_status === 'severe' ? 'high' : 'normal',
      };
    }
  },
  {
    id: 'high-risk-meds',
    check: (p) => {
      const highRisk = ['methotrexate', 'azathioprine', 'lithium', 'warfarin', 'ciclosporin'];
      const found = p.medications?.filter((m: string) => highRisk.some(hr => m.toLowerCase().includes(hr))) || [];
      if (found.length === 0) return null;
      return {
        triggered: true,
        title: 'High-Risk Medication Monitoring',
        description: `Patient on ${found.join(', ')}. Verify shared-care monitoring and recent bloods.`,
        priority: 'high',
      };
    }
  },
];

// Read/SNOMED code mapping for common conditions
const CONDITION_CODE_MAP: Record<string, { read_code: string; snomed: string }> = {
  'hypertension': { read_code: 'G20..', snomed: '38341003' },
  'essential hypertension': { read_code: 'G20..', snomed: '59621000' },
  'type 2 diabetes': { read_code: 'C10E.', snomed: '44054006' },
  'type 1 diabetes': { read_code: 'C10D.', snomed: '46635009' },
  'diabetes': { read_code: 'C10..', snomed: '73211009' },
  'copd': { read_code: 'H3...', snomed: '13645005' },
  'asthma': { read_code: 'H33..', snomed: '195967001' },
  'atrial fibrillation': { read_code: 'G573.', snomed: '49436004' },
  'heart failure': { read_code: 'G58..', snomed: '84114007' },
  'ckd': { read_code: '1Z1..', snomed: '709044004' },
  'chronic kidney disease': { read_code: '1Z1..', snomed: '709044004' },
  'dementia': { read_code: 'E00..', snomed: '52448006' },
  'stroke': { read_code: 'G66..', snomed: '230690007' },
  'epilepsy': { read_code: 'F25..', snomed: '84757009' },
  'depression': { read_code: 'E112.', snomed: '35489007' },
  'osteoporosis': { read_code: 'N330.', snomed: '64859006' },
  'hypothyroidism': { read_code: 'C04..', snomed: '40930008' },
  'rheumatoid arthritis': { read_code: 'N04..', snomed: '69896004' },
  'coronary heart disease': { read_code: 'G3...', snomed: '53741008' },
  'chd': { read_code: 'G3...', snomed: '53741008' },
  'peripheral arterial disease': { read_code: 'G73..', snomed: '399957001' },
  'pad': { read_code: 'G73..', snomed: '399957001' },
};

function mapConditionsToCodes(conditions: string[]): Array<{ condition: string; read_code: string; snomed: string }> {
  const mapped: Array<{ condition: string; read_code: string; snomed: string }> = [];
  for (const condition of conditions) {
    const lower = condition.toLowerCase().trim();
    // Direct match
    if (CONDITION_CODE_MAP[lower]) {
      mapped.push({ condition, ...CONDITION_CODE_MAP[lower] });
      continue;
    }
    // Partial match
    for (const [key, codes] of Object.entries(CONDITION_CODE_MAP)) {
      if (lower.includes(key) || key.includes(lower)) {
        mapped.push({ condition, ...codes });
        break;
      }
    }
  }
  return mapped;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { patientId, mode } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (mode === 'map-codes') {
      // Read/SNOMED code mapping for a patient's conditions
      if (!patientId) {
        return new Response(JSON.stringify({ error: 'patientId required' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      const { data: patient } = await supabase
        .from('patients')
        .select('conditions')
        .eq('id', patientId)
        .single();

      if (!patient?.conditions) {
        return new Response(JSON.stringify({ mappings: [] }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
      }

      // Try DB lookup first, fallback to static map
      const { data: dbCodes } = await supabase
        .from('emis_read_codes')
        .select('*');

      const mappings = mapConditionsToCodes(patient.conditions);

      return new Response(JSON.stringify({ mappings, dbCodesAvailable: (dbCodes?.length || 0) }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // Default mode: auto-trigger clinical actions for a patient
    if (!patientId) {
      return new Response(JSON.stringify({ error: 'patientId required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

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
      .select('*')
      .eq('patient_id', patientId)
      .order('collected_at', { ascending: false })
      .limit(5);

    // Fetch existing pending tasks to avoid duplicates
    const { data: existingTasks } = await supabase
      .from('meditask_tasks')
      .select('title')
      .eq('patient_id', patientId)
      .neq('status', 'completed');

    const existingTitles = new Set((existingTasks || []).map(t => t.title.toLowerCase()));

    // Run clinical rules
    const triggeredActions: any[] = [];
    for (const rule of CLINICAL_RULES) {
      const result = rule.check(patient, responses || []);
      if (result?.triggered) {
        // Skip if similar task already exists
        if (existingTitles.has(result.title.toLowerCase())) continue;
        triggeredActions.push({ ...result, ruleId: rule.id });
      }
    }

    // Create MediTask tasks for triggered actions
    if (triggeredActions.length > 0) {
      const tasks = triggeredActions.map(action => ({
        title: action.title,
        description: action.description,
        priority: action.priority,
        status: 'pending',
        patient_id: patientId,
      }));

      const { error: insertErr } = await supabase
        .from('meditask_tasks')
        .insert(tasks);

      if (insertErr) {
        console.error('Failed to create tasks:', insertErr);
      }
    }

    // Map conditions to codes
    const codeMappings = patient.conditions ? mapConditionsToCodes(patient.conditions) : [];

    // Audit log
    await supabase.from('audit_logs').insert({
      action: 'clinical_actions_triggered',
      entity_type: 'patient',
      entity_id: patientId,
      details: {
        rules_checked: CLINICAL_RULES.length,
        actions_triggered: triggeredActions.length,
        codes_mapped: codeMappings.length,
      },
    });

    return new Response(JSON.stringify({
      actions: triggeredActions,
      tasksCreated: triggeredActions.length,
      codeMappings,
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Clinical actions error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
