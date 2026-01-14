import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { patientId, documentText } = await req.json();

    if (!patientId || !documentText) {
      return new Response(
        JSON.stringify({ error: "patientId and documentText are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a medical data extraction assistant for a UK care home management system. 
Extract structured patient information from the provided clinical document or summary.

Extract the following fields if present:
- DNACPR status (Do Not Attempt CPR): "In Place", "Not in Place", or "Unknown"
- DNACPR date if mentioned
- Allergies (list of known allergies)
- Next of kin name, phone number, and relationship
- GP name and practice
- Care home name
- Mobility status (e.g., "Independent", "Requires assistance", "Wheelchair user", "Bedbound")
- Dietary requirements
- Communication needs (e.g., "Hearing impaired", "Requires interpreter", etc.)
- Any other important clinical information

Be thorough but only extract information that is explicitly stated in the document.`;

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
          { role: "user", content: `Please extract patient information from this document:\n\n${documentText}` }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_patient_data",
              description: "Extract structured patient data from clinical documents",
              parameters: {
                type: "object",
                properties: {
                  dnacpr_status: { 
                    type: "string", 
                    enum: ["In Place", "Not in Place", "Unknown"],
                    description: "DNACPR status" 
                  },
                  dnacpr_date: { 
                    type: "string", 
                    description: "Date of DNACPR decision in ISO format (YYYY-MM-DD)" 
                  },
                  allergies: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "List of known allergies" 
                  },
                  next_of_kin_name: { type: "string", description: "Next of kin full name" },
                  next_of_kin_phone: { type: "string", description: "Next of kin phone number" },
                  next_of_kin_relationship: { type: "string", description: "Relationship to patient" },
                  gp_name: { type: "string", description: "GP doctor name" },
                  gp_practice: { type: "string", description: "GP practice name" },
                  care_home_name: { type: "string", description: "Care home or facility name" },
                  mobility_status: { type: "string", description: "Patient mobility status" },
                  dietary_requirements: { type: "string", description: "Dietary requirements or restrictions" },
                  communication_needs: { type: "string", description: "Communication needs or preferences" },
                  conditions: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Medical conditions" 
                  },
                  medications: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Current medications" 
                  },
                  summary: { type: "string", description: "Brief clinical summary of key information" }
                },
                required: [],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_patient_data" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall || toolCall.function.name !== "extract_patient_data") {
      throw new Error("Failed to extract patient data from AI response");
    }

    const extractedData = JSON.parse(toolCall.function.arguments);

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build update object with only non-null values
    const updateData: Record<string, any> = {
      ai_extracted_at: new Date().toISOString(),
    };

    if (extractedData.dnacpr_status) updateData.dnacpr_status = extractedData.dnacpr_status;
    if (extractedData.dnacpr_date) updateData.dnacpr_date = extractedData.dnacpr_date;
    if (extractedData.allergies?.length > 0) updateData.allergies = extractedData.allergies;
    if (extractedData.next_of_kin_name) updateData.next_of_kin_name = extractedData.next_of_kin_name;
    if (extractedData.next_of_kin_phone) updateData.next_of_kin_phone = extractedData.next_of_kin_phone;
    if (extractedData.next_of_kin_relationship) updateData.next_of_kin_relationship = extractedData.next_of_kin_relationship;
    if (extractedData.gp_name) updateData.gp_name = extractedData.gp_name;
    if (extractedData.gp_practice) updateData.gp_practice = extractedData.gp_practice;
    if (extractedData.care_home_name) updateData.care_home_name = extractedData.care_home_name;
    if (extractedData.mobility_status) updateData.mobility_status = extractedData.mobility_status;
    if (extractedData.dietary_requirements) updateData.dietary_requirements = extractedData.dietary_requirements;
    if (extractedData.communication_needs) updateData.communication_needs = extractedData.communication_needs;
    if (extractedData.conditions?.length > 0) updateData.conditions = extractedData.conditions;
    if (extractedData.medications?.length > 0) updateData.medications = extractedData.medications;
    if (extractedData.summary) updateData.ai_extracted_summary = extractedData.summary;

    // Update patient record
    const { error: updateError } = await supabase
      .from("patients")
      .update(updateData)
      .eq("id", patientId);

    if (updateError) {
      console.error("Failed to update patient:", updateError);
      throw new Error(`Failed to update patient: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        extractedData,
        message: "Patient data extracted and updated successfully" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Extract patient data error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
