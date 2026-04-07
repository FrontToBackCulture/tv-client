// Edge Function: bot-token
// Deploy to the GATEWAY Supabase project (tccyronrnsimacqfhxzd)
//
// Authenticates bots via API key (not OAuth) and mints a workspace JWT.
// Each bot has a unique API key that maps to its identity and permissions.
//
// POST /bot-token
// Body: { api_key: string, workspace_id?: string }
// Returns: { token: string, expires_at: number, bot: { id, name, permissions } }
//
// No JWT verification on this endpoint — bots authenticate via API key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { SignJWT } from "https://esm.sh/jose@5.9.6";

const gatewayUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** SHA-256 hash a string and return hex */
async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { api_key, workspace_id } = await req.json();

    if (!api_key) {
      return new Response(JSON.stringify({ error: "api_key is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Hash the API key and look it up
    const keyHash = await sha256hex(api_key);
    const admin = createClient(gatewayUrl, serviceRoleKey);

    const { data: botKey, error: keyError } = await admin
      .from("bot_api_keys")
      .select("gateway_user_id, bot_name, is_active")
      .eq("key_hash", keyHash)
      .single();

    if (keyError || !botKey) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!botKey.is_active) {
      return new Response(JSON.stringify({ error: "API key is disabled" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Update last_used_at (fire and forget)
    admin
      .from("bot_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("key_hash", keyHash)
      .then(() => {});

    // 3. Get the bot's gateway user
    const { data: gwUser, error: gwError } = await admin
      .from("gateway_users")
      .select("id, name")
      .eq("id", botKey.gateway_user_id)
      .single();

    if (gwError || !gwUser) {
      return new Response(JSON.stringify({ error: "Bot user not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Determine workspace — use provided or find default
    let targetWorkspaceId = workspace_id;
    if (!targetWorkspaceId) {
      // Find the bot's first workspace membership
      const { data: membership } = await admin
        .from("workspace_memberships")
        .select("workspace_id")
        .eq("user_id", gwUser.id)
        .limit(1)
        .single();

      if (!membership) {
        return new Response(
          JSON.stringify({ error: "Bot has no workspace access" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      targetWorkspaceId = membership.workspace_id;
    }

    // 5. Check workspace membership and get permissions
    const { data: membership, error: memberError } = await admin
      .from("workspace_memberships")
      .select("role, permission_groups")
      .eq("user_id", gwUser.id)
      .eq("workspace_id", targetWorkspaceId)
      .single();

    if (memberError || !membership) {
      return new Response(
        JSON.stringify({ error: "Bot not a member of this workspace" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 6. Get the workspace's JWT secret
    const { data: secretRow, error: secretError } = await admin
      .from("workspace_settings")
      .select("value")
      .eq("workspace_id", targetWorkspaceId)
      .eq("key", "jwt_secret")
      .single();

    if (secretError || !secretRow) {
      return new Response(
        JSON.stringify({ error: "Workspace JWT secret not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 7. Sign the workspace JWT
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600; // 1 hour

    const workspaceJwt = await new SignJWT({
      aud: "authenticated",
      iss: "supabase",
      sub: gwUser.id,
      role: "authenticated",
      iat: now,
      exp: expiresAt,
      app_metadata: {
        workspace_role: membership.role,
        permissions: membership.permission_groups ?? ["general"],
        bot_name: botKey.bot_name,
        is_bot: true,
      },
      user_metadata: {
        name: gwUser.name,
      },
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(new TextEncoder().encode(secretRow.value));

    // 8. Return the token
    return new Response(
      JSON.stringify({
        token: workspaceJwt,
        expires_at: expiresAt,
        bot: {
          id: gwUser.id,
          name: botKey.bot_name,
          role: membership.role,
          permissions: membership.permission_groups ?? ["general"],
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("bot-token error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
