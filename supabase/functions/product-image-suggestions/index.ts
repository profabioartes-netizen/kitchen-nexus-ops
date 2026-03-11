import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function generateImage(prompt: string, apiKey: string): Promise<{ url: string | null; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI response error:", response.status, t);
      if (response.status === 402) {
        return { url: null, error: "credits" };
      }
      return { url: null };
    }

    const data = await response.json();
    return { url: data.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null };
  } catch (err) {
    console.error("generateImage error:", err);
    return { url: null };
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productName } = await req.json();
    if (!productName || productName.trim().length < 2) {
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const name = productName.trim();

    const prompts = [
      `Generate a professional appetizing photo of "${name}" for a restaurant menu. Well-lit, clean presentation.`,
      `Generate a top-down photo of "${name}" as served in a restaurant. Warm lighting, appetizing.`,
    ];

    console.log(`Starting image generation for "${name}"...`);

    const results = await Promise.allSettled(
      prompts.map((p) => generateImage(p, LOVABLE_API_KEY))
    );

    const suggestions: { url: string; alt: string }[] = [];
    let creditsError = false;

    for (const r of results) {
      if (r.status === "fulfilled") {
        if (r.value.url) {
          suggestions.push({ url: r.value.url, alt: name });
        }
        if (r.value.error === "credits") {
          creditsError = true;
        }
      }
    }

    console.log(`Generated ${suggestions.length} suggestions for "${name}"`);

    const response: Record<string, unknown> = { suggestions };
    if (creditsError && suggestions.length === 0) {
      response.error = "Créditos de IA esgotados. Tente novamente mais tarde ou faça upload manual.";
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
