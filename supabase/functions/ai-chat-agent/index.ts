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
    const { messages } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create Supabase client to fetch context
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch relevant context data
    console.log("Fetching context data for AI chat...");

    const [
      patientsResult,
      alertsResult,
      tasksResult,
      callResponsesResult
    ] = await Promise.all([
      supabase.from('patients').select('*').limit(50),
      supabase.from('health_alerts').select('*, patients(first_name, last_name, nhs_number)').eq('acknowledged', false).limit(20),
      supabase.from('meditask_tasks').select('*').in('status', ['pending', 'in_progress']).limit(30),
      supabase.from('call_responses').select('*, patients(first_name, last_name)').order('created_at', { ascending: false }).limit(30)
    ]);

    // Build context summary
    const patients = patientsResult.data || [];
    const alerts = alertsResult.data || [];
    const tasks = tasksResult.data || [];
    const callResponses = callResponsesResult.data || [];

    // Calculate statistics
    const stats = {
      totalPatients: patients.length,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      warningAlerts: alerts.filter(a => a.severity === 'warning').length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      overdueTasks: tasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length,
      highPriorityTasks: tasks.filter(t => t.priority === 'high').length
    };

    // Build patient summaries for context
    const patientSummaries = patients.map(p => ({
      name: `${p.first_name} ${p.last_name}`,
      nhsNumber: p.nhs_number,
      dob: p.date_of_birth,
      conditions: p.conditions,
      medications: p.medications,
      smoking: p.smoking_status,
      alcohol: p.alcohol_units
    }));

    // Build alert summaries
    const alertSummaries = alerts.map(a => ({
      patient: a.patients ? `${a.patients.first_name} ${a.patients.last_name}` : 'Unknown',
      type: a.alert_type,
      severity: a.severity,
      title: a.title,
      description: a.description
    }));

    // Build task summaries
    const taskSummaries = tasks.map(t => ({
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      dueDate: t.due_date,
      category: t.category
    }));

    // Build recent call response summaries
    const responseSummaries = callResponses.slice(0, 10).map(r => ({
      patient: r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : 'Unknown',
      bp: r.blood_pressure_systolic && r.blood_pressure_diastolic 
        ? `${r.blood_pressure_systolic}/${r.blood_pressure_diastolic}` : null,
      pulse: r.pulse,
      symptoms: r.symptoms,
      painLevel: r.pain_level,
      date: r.created_at
    }));

    const systemPrompt = `You are ISSA Care AI Assistant, an intelligent healthcare companion for GP practice staff. You help analyze patient data, track health metrics, manage tasks, and provide smart clinical suggestions.

## Your Capabilities:
1. **Patient Data Analysis** - Query and analyze patient demographics, conditions, medications
2. **Health Metrics Review** - Examine blood pressure, pulse, symptoms, and other vitals
3. **Alert Management** - Identify critical and warning health alerts requiring attention
4. **Task Tracking** - Monitor pending tasks, overdue items, and priorities
5. **Smart Suggestions** - Provide actionable recommendations for patient care

## Current Practice Overview:
- Total Patients: ${stats.totalPatients}
- Critical Alerts: ${stats.criticalAlerts}
- Warning Alerts: ${stats.warningAlerts}
- Pending Tasks: ${stats.pendingTasks}
- Overdue Tasks: ${stats.overdueTasks}
- High Priority Tasks: ${stats.highPriorityTasks}

## Current Patient Data:
${JSON.stringify(patientSummaries, null, 2)}

## Active Health Alerts (Unacknowledged):
${JSON.stringify(alertSummaries, null, 2)}

## Pending/In-Progress Tasks:
${JSON.stringify(taskSummaries, null, 2)}

## Recent Call Responses:
${JSON.stringify(responseSummaries, null, 2)}

## Guidelines:
- Be concise but thorough in your responses
- Prioritize patient safety - always flag critical issues first
- Suggest specific actionable next steps when appropriate
- Use medical terminology appropriately but explain when needed
- Format responses with markdown for readability (bold, lists, etc.)
- If asked about something not in the data, say so clearly
- Always maintain patient confidentiality awareness
- Provide evidence-based suggestions for clinical improvements`;

    console.log("Calling Lovable AI Gateway...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI service error. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Streaming response to client...");

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("AI chat agent error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
