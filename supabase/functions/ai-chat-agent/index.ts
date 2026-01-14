import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tool definitions for function calling
const tools = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task in the MediTask system. Use this when the user explicitly asks to create, add, or schedule a task.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the task (required, max 100 chars)"
          },
          description: {
            type: "string",
            description: "Detailed description of the task"
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
            description: "Priority level of the task"
          },
          category: {
            type: "string",
            description: "Category like 'follow-up', 'review', 'call', 'appointment', etc."
          },
          due_date: {
            type: "string",
            description: "Due date in ISO format (YYYY-MM-DD). If user says 'tomorrow', calculate the date."
          },
          patient_name: {
            type: "string",
            description: "Name of the patient this task relates to (optional)"
          }
        },
        required: ["title"],
        additionalProperties: false
      }
    }
  }
];

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
      supabase.from('health_alerts').select('*, patients(name, nhs_number)').eq('acknowledged', false).limit(20),
      supabase.from('meditask_tasks').select('*').in('status', ['pending', 'in_progress']).limit(30),
      supabase.from('call_responses').select('*, patients(name)').order('created_at', { ascending: false }).limit(30)
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
      highPriorityTasks: tasks.filter(t => t.priority === 'high' || t.priority === 'urgent').length
    };

    // Build patient summaries for context
    const patientSummaries = patients.map(p => ({
      id: p.id,
      name: p.name,
      nhsNumber: p.nhs_number,
      dob: p.date_of_birth,
      conditions: p.conditions,
      medications: p.medications
    }));

    // Build alert summaries
    const alertSummaries = alerts.map(a => ({
      patient: a.patients?.name || 'Unknown',
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
      patient: r.patients?.name || 'Unknown',
      bp: r.blood_pressure_systolic && r.blood_pressure_diastolic 
        ? `${r.blood_pressure_systolic}/${r.blood_pressure_diastolic}` : null,
      pulse: r.pulse_rate,
      date: r.created_at
    }));

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const systemPrompt = `You are ISSA Care AI Assistant, an intelligent healthcare companion for GP practice staff. You help analyze patient data, track health metrics, manage tasks, and provide smart clinical suggestions.

## Today's Date: ${today}
## Tomorrow's Date: ${tomorrow}

## Your Capabilities:
1. **Patient Data Analysis** - Query and analyze patient demographics, conditions, medications
2. **Health Metrics Review** - Examine blood pressure, pulse, symptoms, and other vitals
3. **Alert Management** - Identify critical and warning health alerts requiring attention
4. **Task Management** - Monitor pending tasks, create new tasks using the create_task function
5. **Smart Suggestions** - Provide actionable recommendations for patient care

## IMPORTANT - Task Creation:
When the user asks you to create, add, or schedule a task, you MUST use the create_task function.
- Always confirm what task you're creating
- Use appropriate priority based on context (urgent for critical patients, high for time-sensitive)
- If a patient is mentioned, include their name in the task
- Calculate due dates: "tomorrow" = ${tomorrow}, "next week" = add 7 days, etc.

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
- When asked to create a task, use the create_task function
- Format responses with markdown for readability (bold, lists, etc.)
- If asked about something not in the data, say so clearly`;

    console.log("Calling Lovable AI Gateway with tools...");

    // First call - may include tool calls
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
        tools: tools,
        tool_choice: "auto",
        stream: false, // Non-streaming for tool handling
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

    const aiResponse = await response.json();
    const assistantMessage = aiResponse.choices[0]?.message;

    // Check if there are tool calls
    if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log("Processing tool calls:", assistantMessage.tool_calls);
      
      const toolResults = [];
      
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === "create_task") {
          const args = JSON.parse(toolCall.function.arguments);
          console.log("Creating task with args:", args);
          
          // Find patient ID if patient_name is provided
          let patientId = null;
          if (args.patient_name) {
            const patient = patients.find(p => 
              p.name.toLowerCase().includes(args.patient_name.toLowerCase())
            );
            if (patient) {
              patientId = patient.id;
            }
          }
          
          // Create the task
          const { data: taskData, error: taskError } = await supabase
            .from('meditask_tasks')
            .insert({
              title: args.title,
              description: args.description || null,
              priority: args.priority || 'normal',
              category: args.category || 'general',
              due_date: args.due_date ? new Date(args.due_date).toISOString() : null,
              patient_id: patientId,
              status: 'pending'
            })
            .select()
            .single();
          
          if (taskError) {
            console.error("Error creating task:", taskError);
            toolResults.push({
              tool_call_id: toolCall.id,
              role: "tool",
              content: JSON.stringify({ success: false, error: taskError.message })
            });
          } else {
            console.log("Task created successfully:", taskData);
            toolResults.push({
              tool_call_id: toolCall.id,
              role: "tool",
              content: JSON.stringify({ 
                success: true, 
                task: {
                  id: taskData.id,
                  title: taskData.title,
                  priority: taskData.priority,
                  due_date: taskData.due_date,
                  patient_name: args.patient_name || null
                }
              })
            });
          }
        }
      }
      
      // Make a second call with the tool results to get the final response
      const finalResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            assistantMessage,
            ...toolResults
          ],
          stream: true,
        }),
      });
      
      if (!finalResponse.ok) {
        throw new Error("Failed to get final response after tool execution");
      }
      
      return new Response(finalResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // No tool calls - stream the response directly
    // Need to make another streaming call since we did non-streaming for tool detection
    const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    console.log("Streaming response to client...");

    return new Response(streamResponse.body, {
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
