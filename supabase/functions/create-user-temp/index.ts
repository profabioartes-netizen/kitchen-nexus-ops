import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await adminClient.auth.admin.createUser({
    email: "joycesantoskaltrine@gmail.com",
    password: "123456",
    email_confirm: true,
    user_metadata: { full_name: "Joyce Karine" },
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Set role to waiter
  await adminClient
    .from("profiles")
    .update({ full_name: "Joyce Karine", role: "waiter" })
    .eq("id", data.user.id);

  return new Response(JSON.stringify({ success: true, user_id: data.user.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
