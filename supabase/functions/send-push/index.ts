// Delivers in-app notifications as Web Push messages.
//
// Called by the notifications AFTER INSERT trigger with { notification_id }
// and by the retry sweep with { notification_ids: [...] }, both through pg_net
// with the service-role key. For each notification it checks the recipient's
// preferences and quiet hours, then sends a generic payload (see
// _shared/pushPayload.ts) to every subscription of that user.
//
// A notification is marked pushed_at once it is settled: delivered to at least
// one device, skipped by preferences or quiet hours, or left with no device to
// send to. Otherwise push_attempts goes up and the sweep tries again.
import { corsHeaders, serveWithCors } from "../_shared/cors.ts";
import { errorResponse } from "../_shared/errors.ts";
import { createServiceClient, requireServiceRole } from "../_shared/auth.ts";
import { getDefaultTimeZone, resolveTimeZone } from "../_shared/timezone.ts";
import {
  buildPushPayload,
  isPushAllowed,
  isWithinQuietHours,
  pushDeliveryOptions,
  type NotificationPrefs,
} from "../_shared/pushPayload.ts";
import { buildPushRequest, subscriptionOutcome, type VapidConfig } from "../_shared/webPush.ts";

const MAX_BATCH = 100;
/** Subscriptions that keep failing (not 404/410) are dropped after this many attempts. */
const MAX_SUBSCRIPTION_FAILURES = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ServiceClient = ReturnType<typeof createServiceClient>;

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  link: string | null;
  push_attempts: number;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readVapidConfig(): VapidConfig | null {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
  const subject = Deno.env.get("VAPID_SUBJECT")?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

function requestedIds(body: unknown): string[] {
  const b = (body ?? {}) as { notification_id?: unknown; notification_ids?: unknown };
  const raw = Array.isArray(b.notification_ids) ? b.notification_ids : [b.notification_id];
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && UUID_RE.test(id)))].slice(0, MAX_BATCH);
}

async function sendToUser(
  supabase: ServiceClient,
  vapid: VapidConfig,
  n: NotificationRow,
  defaultTimeZone: string,
): Promise<"delivered" | "skipped" | "no_devices" | "failed"> {
  const [{ data: prefs }, { data: profile }, { data: subs }] = await Promise.all([
    supabase
      .from("notification_prefs")
      .select("push_enabled, types, quiet_hours_start, quiet_hours_end")
      .eq("user_id", n.user_id)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").eq("user_id", n.user_id).maybeSingle(),
    supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth, failure_count").eq("user_id", n.user_id),
  ]);

  const p = prefs as NotificationPrefs | null;
  if (!isPushAllowed(n.type, p)) return "skipped";
  const timeZone = resolveTimeZone((profile as { timezone?: string } | null)?.timezone, defaultTimeZone);
  if (p && isWithinQuietHours(new Date(), p.quiet_hours_start, p.quiet_hours_end, timeZone)) return "skipped";

  const targets = (subs ?? []) as SubscriptionRow[];
  if (targets.length === 0) return "no_devices";

  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", n.user_id)
    .eq("is_read", false);

  const payload = JSON.stringify(buildPushPayload(n, unread ?? 0));
  const options = pushDeliveryOptions(n.type);

  let delivered = 0;
  let remaining = 0;
  for (const sub of targets) {
    let status = 0;
    try {
      const { url, init } = await buildPushRequest(sub, payload, vapid, options);
      const res = await fetch(url, init);
      status = res.status;
      await res.body?.cancel();
    } catch (err) {
      console.error(`[send-push] subscription=${sub.id} request failed`, err);
    }

    const outcome = subscriptionOutcome(status);
    if (outcome === "delivered") {
      delivered++;
      remaining++;
      if (sub.failure_count > 0) {
        await supabase.from("push_subscriptions").update({ failure_count: 0 }).eq("id", sub.id);
      }
    } else if (outcome === "gone" || sub.failure_count + 1 >= MAX_SUBSCRIPTION_FAILURES) {
      await supabase.from("push_subscriptions").delete().eq("id", sub.id);
    } else {
      remaining++;
      console.error(`[send-push] subscription=${sub.id} status=${status}`);
      await supabase.from("push_subscriptions").update({ failure_count: sub.failure_count + 1 }).eq("id", sub.id);
    }
  }

  if (delivered > 0) return "delivered";
  return remaining === 0 ? "no_devices" : "failed";
}

serveWithCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireServiceRole(req, corsHeaders);
  if (!auth.ok) return auth.response;

  try {
    const vapid = readVapidConfig();
    if (!vapid) return json({ skipped: "push_not_configured" });

    const ids = requestedIds(await req.json().catch(() => null));
    if (ids.length === 0) return json({ error: "Provide notification_id or notification_ids" }, 400);

    const supabase = createServiceClient();
    const { data: rows, error } = await supabase
      .from("notifications")
      .select("id, user_id, type, link, push_attempts")
      .in("id", ids)
      .is("pushed_at", null);
    if (error) throw error;

    const defaultTimeZone = await getDefaultTimeZone(supabase);
    const results: Record<string, number> = { delivered: 0, skipped: 0, no_devices: 0, failed: 0 };
    for (const n of (rows ?? []) as NotificationRow[]) {
      const result = await sendToUser(supabase, vapid, n, defaultTimeZone);
      results[result]++;
      await supabase
        .from("notifications")
        .update(
          result === "failed"
            ? { push_attempts: n.push_attempts + 1 }
            : { pushed_at: new Date().toISOString(), push_attempts: n.push_attempts + 1 },
        )
        .eq("id", n.id);
    }

    return json({ processed: rows?.length ?? 0, ...results });
  } catch (e) {
    return errorResponse("send-push", e, corsHeaders);
  }
});
