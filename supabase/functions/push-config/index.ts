// Returns this instance's VAPID public key so one frontend build can subscribe
// to push on any deployment. The key is public by design; null means push is
// not configured here.
import { corsHeaders, serveWithCors } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";

serveWithCors((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim() || null;
    const configured = Boolean(publicKey && Deno.env.get("VAPID_PRIVATE_KEY")?.trim());
    return new Response(JSON.stringify({ publicKey: configured ? publicKey : null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    return errorResponse("push-config", e, corsHeaders);
  }
});
