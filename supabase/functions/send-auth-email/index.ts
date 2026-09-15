import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhook } from "npm:standardwebhooks@1.0.0";
import {
  authTemplateTypeForAction,
  buildAuthConfirmationUrl,
  buildAuthEmailContent,
  getAuthBranding,
  resolveApplicantSignupRedirect,
  type AuthEmailActionType,
} from "../_shared/authEmailTemplates.ts";
import { sendAuthEmail, type EmailTemplateType } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, webhook-id, webhook-signature, webhook-timestamp",
};

interface HookUser {
  id: string;
  email: string;
  new_email?: string;
  user_metadata?: Record<string, unknown>;
}

interface HookEmailData {
  token: string;
  token_hash: string;
  token_new: string;
  token_hash_new: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
}

interface HookPayload {
  user: HookUser;
  email_data: HookEmailData;
}

function hookSecret(): string | null {
  const raw = Deno.env.get("SEND_AUTH_EMAIL_HOOK_SECRET");
  if (!raw) return null;
  return raw.replace(/^v1,whsec_/, "");
}

function verifyHookPayload(req: Request, payload: string): HookPayload {
  const secret = hookSecret();
  if (!secret) {
    throw new Error("SEND_AUTH_EMAIL_HOOK_SECRET not configured");
  }
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(secret);
  return wh.verify(payload, headers) as HookPayload;
}

async function dispatchAuthEmail(
  supabase: ReturnType<typeof createClient>,
  branding: Awaited<ReturnType<typeof getAuthBranding>>,
  recipient: string,
  actionType: AuthEmailActionType,
  confirmationUrl: string,
  token: string,
  newEmail?: string,
  metadata: Record<string, unknown> = {},
): Promise<{ success: boolean; status: string; error?: string }> {
  const templateType = authTemplateTypeForAction(actionType) as EmailTemplateType;
  const { subject, html, text } = buildAuthEmailContent(branding, {
    actionType,
    confirmationUrl,
    token,
    recipientEmail: recipient,
    newEmail,
  });

  const result = await sendAuthEmail({
    supabase,
    to: recipient,
    subject,
    html,
    text,
    templateType,
    metadata: {
      ...metadata,
      email_action_type: actionType,
    },
  });

  return { success: result.success, status: result.status, error: result.error };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const rawPayload = await req.text();

  let payload: HookPayload;
  try {
    payload = verifyHookPayload(req, rawPayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid hook signature";
    console.error("send-auth-email verification failed:", message);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { user, email_data: emailData } = payload;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? emailData.site_url;
  const branding = await getAuthBranding(supabase, emailData.site_url, emailData.redirect_to);
  const baseMetadata = { user_id: user.id, email_action_type: emailData.email_action_type };

  try {
    if (emailData.email_action_type === "email_change") {
      const hasSecureChange = Boolean(emailData.token_hash_new && emailData.token_new);
      const results: Array<{ recipient: string; status: string }> = [];

      if (hasSecureChange && user.email) {
        const currentUrl = buildAuthConfirmationUrl(
          supabaseUrl,
          emailData.token_hash_new,
          emailData.email_action_type,
          emailData.redirect_to,
        );
        const currentResult = await dispatchAuthEmail(
          supabase,
          branding,
          user.email,
          "email_change",
          currentUrl,
          emailData.token,
          user.new_email,
          { ...baseMetadata, email_change_target: "current" },
        );
        results.push({ recipient: user.email, status: currentResult.status });
        if (!currentResult.success) {
          return new Response(JSON.stringify({ error: currentResult.error ?? "Send failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const newRecipient = user.new_email ?? user.email;
      const newTokenHash = hasSecureChange ? emailData.token_hash : (emailData.token_hash || emailData.token_hash_new);
      const newToken = hasSecureChange ? emailData.token_new : emailData.token;
      const newUrl = buildAuthConfirmationUrl(
        supabaseUrl,
        newTokenHash,
        emailData.email_action_type,
        emailData.redirect_to,
      );
      const newResult = await dispatchAuthEmail(
        supabase,
        branding,
        newRecipient,
        "email_change",
        newUrl,
        newToken,
        user.new_email,
        { ...baseMetadata, email_change_target: hasSecureChange ? "new" : "single" },
      );
      results.push({ recipient: newRecipient, status: newResult.status });
      if (!newResult.success) {
        return new Response(JSON.stringify({ error: newResult.error ?? "Send failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, results }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionType = emailData.email_action_type as AuthEmailActionType;
    const redirectTo = actionType === "signup"
      ? resolveApplicantSignupRedirect(
        emailData.redirect_to,
        emailData.site_url,
        user.user_metadata,
      )
      : emailData.redirect_to;
    const confirmationUrl = buildAuthConfirmationUrl(
      supabaseUrl,
      emailData.token_hash,
      emailData.email_action_type,
      redirectTo,
    );

    const result = await dispatchAuthEmail(
      supabase,
      branding,
      user.email,
      actionType,
      confirmationUrl,
      emailData.token,
      user.new_email,
      baseMetadata,
    );

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error ?? "Send failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("send-auth-email error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
