import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fallback messages if database lookup fails
const FALLBACK_MESSAGES: Record<string, string> = {
  greeting: "Hello, this is a call from your GP surgery. We're reaching out to collect some health information as part of your ongoing care.",
  recording: "This call will be recorded for quality and training purposes, and to accurately capture your health information.",
  consent_verbal: "Do you consent to continue with this call? Please say yes to continue, or no if you'd prefer not to.",
  thank_you: "Thank you for your consent. Please hold while I connect you to our health assistant.",
  declined: "No problem. We understand. If you'd like to speak with us, please call the surgery directly. Goodbye.",
  goodbye: "Thank you for your time. Your responses have been recorded and will be reviewed by your healthcare team. Take care and goodbye.",
  no_response: "I didn't hear a response. If you'd like to speak with us, please call the surgery directly. Goodbye.",
  error: "We're sorry, but we're experiencing technical difficulties. Please call the surgery directly. Goodbye.",
  unclear_response: "I'm sorry, I didn't quite catch that. Let me ask again.",
  consent_prompt: "Do you consent to continue with this call? Please say yes to continue, or no if you'd prefer not to.",
  invalid_input: "I didn't understand your response. Let me ask again."
};

// Default voice settings
const DEFAULT_VOICE_ID = "Xb7hH8MSUJpSbSDYk0k2"; // Alice
const DEFAULT_SETTINGS = {
  stability: 0.6,
  similarity_boost: 0.8,
  style: 0.4,
  use_speaker_boost: true,
};

interface ConsentSetting {
  message_text: string;
  voice_id: string;
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const messageType = url.searchParams.get("type") || "greeting";

    console.log("Consent audio request:", {
      method: req.method,
      type: messageType,
    });

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!ELEVENLABS_API_KEY) {
      throw new Error("ElevenLabs API key not configured");
    }

    // Try to get settings from database
    let text = FALLBACK_MESSAGES[messageType];
    let voiceId = DEFAULT_VOICE_ID;
    let voiceSettings = DEFAULT_SETTINGS;

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        const { data: setting, error } = await supabase
          .from("consent_settings")
          .select("message_text, voice_id, stability, similarity_boost, style, use_speaker_boost")
          .eq("message_type", messageType)
          .single();

        if (!error && setting) {
          const s = setting as ConsentSetting;
          text = s.message_text;
          voiceId = s.voice_id;
          voiceSettings = {
            stability: s.stability,
            similarity_boost: s.similarity_boost,
            style: s.style,
            use_speaker_boost: s.use_speaker_boost,
          };
          console.log("Using database settings for:", messageType);
        } else {
          console.log("Using fallback settings for:", messageType, error?.message);
        }
      } catch (dbError) {
        console.error("Database lookup failed, using fallback:", dbError);
      }
    }

    if (!text) {
      return new Response("Invalid message type", { status: 400, headers: corsHeaders });
    }

    // Generate audio with ElevenLabs
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: voiceSettings,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs TTS error:", errorText);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();

    // Short cache to allow settings changes to take effect quickly
    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error("Error generating consent audio:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});