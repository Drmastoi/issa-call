import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pre-defined consent messages for natural voice
const CONSENT_MESSAGES = {
  greeting: "Hello. This is an automated health check call from your GP practice.",
  recording: "This call will be recorded for quality assurance and to update your medical records.",
  consent_prompt: "To consent and continue with this call, please press 1. To decline and end this call, please press 2.",
  no_response: "We did not receive a response. The call will now end. Goodbye.",
  thank_you: "Thank you for your consent. Please hold while we connect you to our health assistant.",
  declined: "You have declined to continue. Your GP practice may contact you by other means. Goodbye.",
  invalid_input: "Sorry, I didn't understand. Please press 1 to consent and continue, or press 2 to decline.",
  goodbye: "Thank you for your time. Your responses have been recorded. Goodbye.",
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
            stability: 0.7,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs TTS error:", errorText);
      throw new Error(`ElevenLabs TTS failed: ${errorText}`);
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
    console.error("Consent audio error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
