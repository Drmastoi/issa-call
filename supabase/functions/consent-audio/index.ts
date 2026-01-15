import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pre-defined consent messages - natural, conversational tone
const CONSENT_MESSAGES: Record<string, string> = {
  greeting: "Hello, this is a call from your GP surgery. We're reaching out to collect some health information as part of your ongoing care.",
  recording: "This call will be recorded for quality and training purposes, and to accurately capture your health information.",
  consent_verbal: "Do you consent to continue with this call? Please say yes to continue, or no if you'd prefer not to.",
  thank_you: "Thank you for your consent. Please hold while I connect you to our health assistant.",
  declined: "No problem. We understand. If you'd like to speak with us, please call the surgery directly. Goodbye.",
  goodbye: "Thank you for your time. Your responses have been recorded and will be reviewed by your healthcare team. Take care and goodbye.",
  no_response: "I didn't hear a response. If you'd like to speak with us, please call the surgery directly. Goodbye.",
  error: "We're sorry, but we're experiencing technical difficulties. Please call the surgery directly. Goodbye.",
  unclear_response: "I'm sorry, I didn't quite catch that. Let me ask again.",
  // Legacy DTMF messages (kept for backwards compatibility)
  consent_prompt: "Do you consent to continue with this call? Please say yes to continue, or no if you'd prefer not to.",
  invalid_input: "I didn't understand your response. Let me ask again."
};

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
      ua: req.headers.get("user-agent"),
    });

    const text = CONSENT_MESSAGES[messageType as keyof typeof CONSENT_MESSAGES];

    if (!text) {
      return new Response("Invalid message type", { status: 400, headers: corsHeaders });
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

    if (!ELEVENLABS_API_KEY) {
      throw new Error("ElevenLabs API key not configured");
    }

    // Use Alice voice (Xb7hH8MSUJpSbSDYk0k2) - warm, professional female voice
    const voiceId = "Xb7hH8MSUJpSbSDYk0k2";

    // Twilio <Play> is most reliable with mp3/wav assets.
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
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.8,
            style: 0.4,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs TTS error:", errorText);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400", // Cache for 24 hours
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
