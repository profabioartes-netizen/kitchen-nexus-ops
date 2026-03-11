import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Generate 4 product images using AI image generation
    const prompt = `Professional food/drink product photo of "${productName.trim()}" for a restaurant menu. Clean white or neutral background, appetizing presentation, high quality product photography, well-lit, centered composition.`;

    const imagePromises = Array.from({ length: 4 }, (_, i) => {
      const variations = [
        prompt,
        `${prompt} Shot from above, flat lay style.`,
        `${prompt} Close-up macro shot showing texture and detail.`,
        `${prompt} Side angle with soft shadows and bokeh background.`,
      ];
      return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{ role: "user", content: variations[i] }],
          modalities: ["image", "text"],
        }),
      });
    });

    const responses = await Promise.allSettled(imagePromises);
    const suggestions: { url: string; alt: string }[] = [];

    for (const result of responses) {
      if (result.status === "fulfilled" && result.value.ok) {
        try {
          const data = await result.value.json();
          const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (imageUrl) {
            suggestions.push({
              url: imageUrl,
              alt: productName.trim(),
            });
          }
        } catch {
          // skip failed parse
        }
      }
    }

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error:", e);

    if (e instanceof Error && e.message.includes("429")) {
      return new Response(
        JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns segundos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
