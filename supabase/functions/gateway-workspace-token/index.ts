// Edge Function: workspace-token
// Deploy to the GATEWAY Supabase project (tccyronrnsimacqfhxzd)
//
// Mints a JWT for a specific workspace, scoped to the authenticated user.
// The JWT is signed with the workspace's JWT secret so the workspace
// Supabase project accepts it as an authenticated session.
//
// POST /workspace-token
// Authorization: Bearer <gateway_jwt>
// Body: { workspace_id: string }
// Returns: { token: string, expires_at: number, user: { id, role, permissions } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { SignJWT } from "https://esm.sh/jose@5.9.6";

const gatewayUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
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
    // 1. Verify the gateway JWT and get the authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service_role client for admin queries
    const adminClient = createClient(gatewayUrl, serviceRoleKey);

    // Verify the user's JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse request body
    const { workspace_id } = await req.json();
    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Look up gateway_users record linked to this auth user
    const { data: gwUser, error: gwError } = await adminClient
      .from("gateway_users")
      .select("id, name, email")
      .eq("auth_uid", user.id)
      .single();

    if (gwError || !gwUser) {
      return new Response(JSON.stringify({
        error: "No gateway user linked to this auth account. Contact admin.",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Check workspace membership
    const { data: membership, error: memberError } = await adminClient
      .from("workspace_memberships")
      .select("role, permission_groups")
      .eq("user_id", gwUser.id)
      .eq("workspace_id", workspace_id)
      .single();

    if (memberError || !membership) {
      return new Response(JSON.stringify({ error: "Not a member of this workspace" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Get the workspace's JWT secret
    const { data: secretRow, error: secretError } = await adminClient
      .from("workspace_settings")
      .select("value")
      .eq("workspace_id", workspace_id)
      .eq("key", "jwt_secret")
      .single();

    if (secretError || !secretRow) {
      return new Response(JSON.stringify({
        error: "Workspace JWT secret not configured. Add jwt_secret to workspace_settings.",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Sign a JWT for the workspace
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600; // 1 hour

    // Use the gateway_user.id as sub — this becomes auth.uid() in the workspace
    const workspaceJwt = await new SignJWT({
      aud: "authenticated",
      iss: "supabase",
      sub: gwUser.id,
      role: "authenticated",
      iat: now,
      exp: expiresAt,
      // Custom claims accessible via auth.jwt() in RLS policies
      app_metadata: {
        workspace_role: membership.role,
        permissions: membership.permission_groups ?? ["general"],
        gateway_user_id: gwUser.id,
      },
      user_metadata: {
        name: gwUser.name,
        email: gwUser.email,
      },
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(new TextEncoder().encode(secretRow.value));

    // 7. Return the workspace token
    return new Response(
      JSON.stringify({
        token: workspaceJwt,
        expires_at: expiresAt,
        user: {
          id: gwUser.id,
          name: gwUser.name,
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
    console.error("workspace-token error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
