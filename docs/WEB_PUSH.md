# Web Push notifications

Staff users can get in-app notifications as push notifications on their phone,
tablet or desktop, even when the app is closed. Push uses the standard Push API
with VAPID keys, so no Firebase project, Apple developer account or paid service
is needed. Each instance has its own key pair.

## How it works

1. A row is inserted into `public.notifications` (interview scheduled, reminder,
   feedback submitted, new application, and so on).
2. The `on_notification_push` trigger calls the `send-push` edge function
   through `pg_net` with only the notification id. The call is queued in the
   inserting transaction and sent after commit, so inserts are not slowed down.
3. `send-push` checks the recipient's preferences and quiet hours, then sends
   to each of their subscribed devices.
4. The service worker (`public/push-sw.js`) shows the notification, sets the
   app icon badge to the unread count, and opens the linked page on tap.

A `pg_cron` job (`push-retry`, every 5 minutes) resends notifications that are
still undelivered after 2 minutes, up to 3 attempts within an hour.

**Privacy.** Push payloads pass through the browser vendors' push services
(Google, Mozilla, Apple, Microsoft; encrypted end to end) and show on lock
screens, so they carry generic text keyed by notification type, for example
"Interview scheduled. You have a new interview. Tap to view." Candidate names,
emails and scores are never sent. The app loads the details after sign-in.

## Setup

### 1. Generate a VAPID key pair

Run once per instance:

```bash
npx web-push generate-vapid-keys
```

Or with OpenSSL only:

```bash
openssl ecparam -genkey -name prime256v1 -noout -out vapid_private.pem
# Public key (base64url, 65 bytes)
openssl ec -in vapid_private.pem -pubout -outform DER | tail -c 65 | base64 | tr '/+' '_-' | tr -d '=\n'; echo
# Private key (base64url, 32 bytes)
openssl ec -in vapid_private.pem -outform DER | tail -c +8 | head -c 32 | base64 | tr '/+' '_-' | tr -d '=\n'; echo
```

**Back the keys up.** If they change or are lost, every existing device
subscription stops working and users have to turn push on again.

### 2. Set the edge function environment

In the environment of the edge functions runtime (see
`supabase/functions/.env.example`):

```
VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:admin@your-company.com
```

Restart the functions runtime. Never commit real keys. The browser gets the
public key from the `push-config` function, so the frontend build needs no
extra variable and one build works for every instance.

### 3. Apply the migrations

- `20261018000001_web_push.sql`: `push_subscriptions`, `notification_prefs`,
  delivery columns on `notifications`, the insert trigger and the retry job.
- `20261018000002_push_notification_events.sql`: new notification events
  (see below) and the `interview-reminders` job (every minute).

Both need the `pg_cron` and `pg_net` extensions.

### 4. Enable delivery

Push stays off until this row exists (same pattern as the email webhooks):

```sql
INSERT INTO public.internal_webhook_config (key, value) VALUES (
  'push',
  '{"enabled": true, "url": "https://<your-supabase-host>/functions/v1/send-push", "bearer_token": "<SERVICE_ROLE_KEY>"}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

Set `"enabled": false` to pause all push delivery without touching the keys.

### 5. Deploy

Deploy the `push-config` and `send-push` edge functions and the frontend. The
web server must serve `/push-sw.js` with `Cache-Control: no-cache` (the bundled
`nginx.conf` does), and the app must be served over HTTPS.

## Turning push on (users)

- Open the bell and tap **Turn on** on the push card, or go to
  **My Profile → Notifications** and switch on **Push on this device**.
  The browser permission prompt only appears after that tap, never on load.
- **My Profile → Notifications** also has a per-type switch for each kind of
  notification, an account-wide switch, and quiet hours (in the profile
  timezone). These apply to all of the user's devices.
- Signing out unsubscribes the device.

### iPhone and iPad

Push works on iOS and iPadOS 16.4 or later, **only from the installed app**:

1. Open the app in Safari.
2. Tap **Share**, then **Add to Home Screen**.
3. Open the app from the Home Screen icon and turn push on there.

In a Safari tab the push card shows these steps instead of a Turn on button.
iOS shows no action buttons on web notifications, and may revoke push for an
app that receives pushes without showing them (the service worker always shows
one).

## Notification types

| Type | Sent to | Default |
|------|---------|---------|
| `interview_scheduled` | Interviewer and panelists | On |
| `interview_reminder` | Interviewer and panelists, 60 and 15 minutes before | On |
| `interview_cancelled` | Interviewers on the cancelled interview | On |
| `verdict_submitted` | Recruiters on the job | On |
| `new_application` | Recruiters on the job; further applications within an hour update the unread notification instead of sending another | On |
| `candidate_assigned` | Interviewer assigned to a candidate | On |
| `assessment_completed` | Recruiters on the job (job setting "notify recruiter on complete") | On |
| `assessment_graded` | Recruiters on the job (same job setting) | On |
| `chitra_warning` | Escalation recipients | On |
| `chitra_nudge`, `chitra_praise` | Recipients | Off |

Other notification types are not pushed unless a user turns them on. The
catalog, lock-screen text and defaults live in
`supabase/functions/_shared/pushPayload.ts`.

## Operations

- **Dead subscriptions.** A 404 or 410 from the push service deletes the
  subscription. Other errors increase `failure_count`; the subscription is
  deleted after 5 consecutive failures.
- **Stale-build recovery.** `public/boot-guard.js` unregisters the service
  worker when it recovers from a stale build, which destroys the push
  subscription. The app re-subscribes silently on every start when permission
  is already granted, so users do not have to do anything.
- **Service worker updates.** `push-sw.js` is imported into the generated
  service worker with a content hash, so a change to it always ships a new
  worker.
- **Checking delivery.** `notifications.pushed_at` is set once a notification
  is settled (delivered, skipped by preferences or quiet hours, or no device to
  send to); `push_attempts` counts tries. `send-push` logs failures with the
  subscription id only.
- **Rotating keys.** Set the new keys and restart the functions runtime. Open
  apps re-subscribe with the new key on their next start; devices that are not
  opened stop receiving push until they are.
