import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    console.log("manage-users: start");
    
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await callerClient.auth.getUser(token);
    
    if (claimsError || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();

    // Check if caller is super_admin or admin (legacy) or admin_cliente
    const { data: callerRoles } = await adminClient
      .from("user_tenants")
      .select("role,tenant_id,active")
      .eq("user_id", callerId)
      .eq("active", true);

    const isSuperAdmin = (callerRoles ?? []).some((r) => r.role === "super_admin");
    const isAdminCliente = (callerRoles ?? []).some((r) => r.role === "admin_cliente");
    const isLegacyAdmin = callerProfile?.role === "admin";

    if (!isSuperAdmin && !isAdminCliente && !isLegacyAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem gerenciar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
      console.log("manage-users: parsed body keys=", Object.keys(body));
    } catch (parseErr) {
      console.error("manage-users: failed to parse body", parseErr);
      return new Response(JSON.stringify({ error: "Corpo da requisição inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...payload } = body;
    console.log("manage-users: action=", action, "payload keys=", Object.keys(payload));

    // ─── CREATE ───
    if (action === "create") {
      const { email, password, full_name, role, tenant_id, tenant_role } = payload;

      if (!email || !password || !full_name || !role) {
        return new Response(JSON.stringify({ error: "Todos os campos são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!["admin", "waiter", "contabilidade"].includes(role as string)) {
        return new Response(JSON.stringify({ error: "Função inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Determine target tenant: super_admin can specify any; admin_cliente only own tenants
      let targetTenantId: string | null = (tenant_id as string) || null;
      if (!isSuperAdmin) {
        const ownTenants = (callerRoles ?? [])
          .filter((r) => r.role === "admin_cliente")
          .map((r) => r.tenant_id);
        if (targetTenantId && !ownTenants.includes(targetTenantId)) {
          return new Response(JSON.stringify({ error: "Sem permissão para esse tenant" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!targetTenantId) targetTenantId = ownTenants[0] ?? null;
      }

      const validTenantRoles = ["admin_cliente", "atendente", "caixa", "cozinha"];
      const finalTenantRole = validTenantRoles.includes(tenant_role as string)
        ? (tenant_role as string)
        : (role === "admin" ? "admin_cliente" : "atendente");

      const { data, error } = await adminClient.auth.admin.createUser({
        email: email as string,
        password: password as string,
        email_confirm: true,
        user_metadata: { full_name, ...(targetTenantId ? { tenant_id: targetTenantId } : {}) },
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient
        .from("profiles")
        .update({ full_name, role, ...(targetTenantId ? { tenant_id: targetTenantId } : {}) })
        .eq("id", data.user.id);

      if (targetTenantId) {
        await adminClient
          .from("user_tenants")
          .insert({ user_id: data.user.id, tenant_id: targetTenantId, role: finalTenantRole });
      }

      return new Response(JSON.stringify({ user: data.user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE ROLE ───
    if (action === "update_role") {
      const { user_id, role } = payload;
      if (!["admin", "waiter", "contabilidade"].includes(role as string)) {
        return new Response(JSON.stringify({ error: "Função inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient
        .from("profiles")
        .update({ role })
        .eq("id", user_id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── UPDATE PROFILE (full edit) ───
    if (action === "update_profile") {
      const { user_id, full_name, email, role, phone } = payload;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (role && !["admin", "waiter", "contabilidade"].includes(role as string)) {
        return new Response(JSON.stringify({ error: "Função inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update auth user (email, phone, metadata)
      const authUpdate: Record<string, unknown> = {};
      if (email) authUpdate.email = email;
      if (phone !== undefined) authUpdate.phone = phone || "";
      if (full_name) authUpdate.user_metadata = { full_name };

      if (Object.keys(authUpdate).length > 0) {
        const { error: authErr } = await adminClient.auth.admin.updateUserById(
          user_id as string,
          authUpdate
        );
        if (authErr) {
          return new Response(JSON.stringify({ error: authErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Update profile table
      const profileUpdate: Record<string, unknown> = {};
      if (full_name) profileUpdate.full_name = full_name;
      if (role) profileUpdate.role = role;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profErr } = await adminClient
          .from("profiles")
          .update(profileUpdate)
          .eq("id", user_id);

        if (profErr) {
          return new Response(JSON.stringify({ error: profErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RESET PASSWORD ───
    if (action === "reset_password") {
      const { user_id, new_password } = payload;

      if (!user_id || !new_password) {
        return new Response(JSON.stringify({ error: "user_id e new_password são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if ((new_password as string).length < 6) {
        return new Response(JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient.auth.admin.updateUserById(
        user_id as string,
        { password: new_password as string }
      );

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── TOGGLE ACTIVE ───
    if (action === "toggle_active") {
      const { user_id, active } = payload;

      if (!user_id || typeof active !== "boolean") {
        return new Response(JSON.stringify({ error: "user_id e active são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (user_id === callerId && !active) {
        return new Response(JSON.stringify({ error: "Você não pode desativar seu próprio usuário" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient
        .from("profiles")
        .update({ active })
        .eq("id", user_id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── DELETE ───
    if (action === "delete") {
      const { user_id } = payload;

      if (user_id === callerId) {
        return new Response(JSON.stringify({ error: "Você não pode excluir seu próprio usuário" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient.auth.admin.deleteUser(user_id as string);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── LIST (get auth details like email/phone) ───
    if (action === "list") {
      const { data: { users: authUsers }, error } = await adminClient.auth.admin.listUsers();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Hide super_admin users from non-super-admin callers (tenant panel)
      let hiddenIds = new Set<string>();
      if (!isSuperAdmin) {
        const { data: superRows } = await adminClient
          .from("user_tenants")
          .select("user_id")
          .eq("role", "super_admin");
        hiddenIds = new Set((superRows ?? []).map((r: any) => r.user_id));
      }

      const mapped = authUsers
        .filter((u) => !hiddenIds.has(u.id))
        .map((u) => ({
          id: u.id,
          email: u.email || "",
          phone: u.phone || "",
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        }));

      return new Response(JSON.stringify({ users: mapped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
