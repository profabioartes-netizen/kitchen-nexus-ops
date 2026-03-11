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
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const name = productName.trim();
    const suggestions: { url: string; alt: string }[] = [];

    // Generate images one at a time to avoid rate limiting
    const variations = [
      `Generate a professional food/drink product photo of "${name}" for a restaurant menu. Appetizing presentation, high quality, well-lit.`,
      `Generate a professional top-down flat lay photo of "${name}" for a restaurant menu card. Clean background.`,
      `Generate a close-up appetizing photo of "${name}" as served in a Brazilian restaurant. Warm lighting.`,
      `Generate a stylish side-angle product photo of "${name}" with soft bokeh background, restaurant menu style.`,
    ];

    for (let i = 0; i < variations.length; i++) {
      try {
        console.log(`Generating image ${i + 1} for "${name}"...`);
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

        console.log(`Image ${i + 1} response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Image ${i + 1} error: ${errorText}`);
          continue;
        }

        const data = await response.json();
        const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        
        if (imageUrl) {
          console.log(`Image ${i + 1} generated successfully (${imageUrl.substring(0, 50)}...)`);
          suggestions.push({ url: imageUrl, alt: name });
        } else {
          console.log(`Image ${i + 1}: no image in response`, JSON.stringify(data).substring(0, 200));
        }
      } catch (err) {
        console.error(`Image ${i + 1} exception:`, err);
      }
    }

    console.log(`Total suggestions generated: ${suggestions.length}`);

    return new Response(
      JSON.stringify({ suggestions }),
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
