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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Fetching data for AI task suggestions...");

    // Fetch relevant data for task suggestions
    const [
      patientsResult,
      alertsResult,
      tasksResult,
      callResponsesResult,
      batchesResult
    ] = await Promise.all([
      supabase.from('patients').select('id, conditions, medications, frailty_status, last_review_date, hba1c_mmol_mol, hba1c_date').limit(100),
      supabase.from('health_alerts').select('id, alert_type, severity, title, description, patient_id').is('acknowledged_at', null).limit(30),
      supabase.from('meditask_tasks').select('id, title, status, priority, due_date').neq('status', 'completed').limit(50),
      supabase.from('call_responses').select('id, patient_id, blood_pressure_systolic, blood_pressure_diastolic, verification_status, collected_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('call_batches').select('id, name, status, scheduled_date').eq('status', 'pending').limit(10)
    ]);

    const patients = patientsResult.data || [];
    const alerts = alertsResult.data || [];
    const existingTasks = tasksResult.data || [];
    const callResponses = callResponsesResult.data || [];
    const pendingBatches = batchesResult.data || [];

    // Calculate insights for AI
    const insights = {
      totalPatients: patients.length,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      warningAlerts: alerts.filter(a => a.severity === 'warning').length,
      unverifiedResponses: callResponses.filter(r => r.verification_status === 'unverified').length,
      pendingBatches: pendingBatches.length,
      patientsNeedingReview: patients.filter(p => {
        if (!p.last_review_date) return true;
        const lastReview = new Date(p.last_review_date);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        return lastReview < oneYearAgo;
      }).length,
      diabeticPatientsHighHba1c: patients.filter(p => 
        p.conditions?.some((c: string) => c.toLowerCase().includes('diabetes')) &&
        p.hba1c_mmol_mol && p.hba1c_mmol_mol > 58
      ).length,
      frailPatients: patients.filter(p => p.frailty_status === 'moderate' || p.frailty_status === 'severe').length,
      existingTaskTitles: existingTasks.map(t => t.title),
      highPriorityTasks: existingTasks.filter(t => t.priority === 'urgent' || t.priority === 'high').length,
    };

    // Alert summaries for context
    const alertSummaries = alerts.slice(0, 10).map(a => ({
      type: a.alert_type,
      severity: a.severity,
      title: a.title
    }));

    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `You are an AI assistant for a GP practice/care home management system. Your job is to analyze patient data, health alerts, and clinical priorities to suggest actionable tasks for the healthcare team.

## Today's Date: ${today}

## Current Practice Data:
- Total Patients: ${insights.totalPatients}
- Critical Health Alerts: ${insights.criticalAlerts}
- Warning Alerts: ${insights.warningAlerts}
- Unverified Call Responses: ${insights.unverifiedResponses}
- Pending Call Batches: ${insights.pendingBatches}
- Patients Needing Annual Review: ${insights.patientsNeedingReview}
- Diabetic Patients with High HbA1c (>58): ${insights.diabeticPatientsHighHba1c}
- Moderate/Severe Frailty Patients: ${insights.frailPatients}
- Current High Priority Tasks: ${insights.highPriorityTasks}

## Active Alerts:
${JSON.stringify(alertSummaries, null, 2)}

## Existing Task Titles (avoid duplicates):
${insights.existingTaskTitles.slice(0, 20).join(', ')}

## Guidelines:
- Suggest 3-5 actionable, specific tasks
- Prioritize patient safety and clinical urgency
- Consider QOF targets and annual reviews
- Avoid suggesting tasks that already exist
- Categories: follow-up, review, call, documentation, verification, clinical-review
- Focus on high-impact actions`;

    const userPrompt = `Based on the current practice data, suggest 3-5 priority tasks that the healthcare team should focus on. Consider:
1. Critical alerts that need immediate attention
2. Unverified clinical data requiring review
3. Patients overdue for annual reviews
4. Diabetic patients with poor HbA1c control
5. Pending call batches that need processing
6. Frail patients requiring care plan reviews

Return structured task suggestions.`;

    console.log("Calling Lovable AI for task suggestions...");

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
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_tasks",
              description: "Return 3-5 actionable task suggestions based on clinical priorities.",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { 
                          type: "string",
                          description: "Short, actionable task title (max 60 chars)"
                        },
                        description: { 
                          type: "string",
                          description: "Detailed description of what needs to be done"
                        },
                        priority: { 
                          type: "string", 
                          enum: ["low", "normal", "high", "urgent"],
                          description: "Task priority based on clinical urgency"
                        },
                        category: { 
                          type: "string",
                          description: "Task category: follow-up, review, call, documentation, verification, clinical-review"
                        },
                        reasoning: {
                          type: "string",
                          description: "Brief explanation of why this task is suggested"
                        }
                      },
                      required: ["title", "description", "priority", "category", "reasoning"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["suggestions"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "suggest_tasks" } },
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
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log("AI Response:", JSON.stringify(aiResponse, null, 2));

    // Extract suggestions from tool call
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    let suggestions: any[] = [];
    
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        suggestions = parsed.suggestions || [];
      } catch (e) {
        console.error("Failed to parse tool call arguments:", e);
      }
    }

    console.log(`Generated ${suggestions.length} task suggestions`);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("AI task suggestions error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
