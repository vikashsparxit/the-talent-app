# Assessment recording and spoken answers

Online assessments can record the candidate's camera and microphone for the
whole attempt, and can include spoken-answer questions that the candidate
answers out loud. Reviewers play the recording back next to the attempt's
integrity events. Media files are stored in a private Cloudflare R2 bucket
(S3-compatible); the database only holds metadata. Recordings can be deleted
automatically 90 days after the assessment, but that is an admin setting and is
**off by default**.

## How it works

1. Before the exam starts, the candidate reads the recording consent text and
   agrees to it, then allows camera and microphone access. The exam does not
   start without both.
2. While the exam runs, the browser records self-contained segments of about
   10 seconds each. Each segment is uploaded straight to R2 with a short-lived
   presigned URL from the `assessment-media` edge function. Credentials never
   reach the browser.
3. Spoken answers are recorded the same way. `grade-assessment` downloads them
   from R2, transcribes them and may suggest a score. The suggestion only helps
   reviewers; people make every hiring decision.
4. On submit, the exam waits for pending segments to finish uploading. If some
   could not be uploaded, or were dropped because the browser ran out of
   buffer, the candidate is told the recording is incomplete and the attempt's
   integrity log records `media_incomplete_at_submit`.
5. Reviewers (admin/HR, recruiters on the job, and interviewers who may view
   the attempt) open the evaluation and get presigned playback URLs from
   `assessment-media`. Candidates never read recording metadata.

Pasting into answer boxes is turned off during the exam, and paste attempts are
logged as integrity events (the length only, never the pasted text).

Re-assigning an assessment after a completed or expired attempt now creates a
new attempt. Finished attempts stay as history, with their answers, recordings,
scores and integrity log.

## Setup

### 1. Create the R2 bucket and an API token

In Cloudflare, create a private R2 bucket for recordings (no public access, no
custom domain needed) and an R2 API token with **Object Read & Write** on that
bucket only. Note the account ID, the access key ID and the secret access key.

The functions talk to the account's S3-compatible endpoint:

```
https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

Browsers upload segments directly to that endpoint, so the bucket needs a CORS
policy that allows your app's origin:

```json
[
  {
    "AllowedOrigins": ["https://talent.example.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

### 2. Set the edge function environment

In the environment of the edge functions runtime (see
`supabase/functions/.env.example`). `assessment-media`, `grade-assessment` and
`cleanup-recordings` read these:

```
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
R2_BUCKET_RECORDINGS=<bucket name>
# Optional: lifetime of presigned URLs in seconds (default 600, capped at 3600)
R2_PRESIGN_TTL_SECONDS=600
```

Restart the functions runtime. Never commit real keys. If any of the four
required variables is missing, `assessment-media` and `cleanup-recordings`
answer 503 "recording storage not configured", and **candidates cannot start an
assessment**: the exam says recording is not available and asks them to
contact the hiring team. Spoken answers are not graded until storage is
configured.

### 3. Apply the migrations

Run them by hand, in filename order:

- `20261114000001_question_type_spoken.sql`: adds the `spoken` question type.
  Run it on its own, before the next file (`ALTER TYPE ... ADD VALUE` cannot
  share a transaction with statements that use the new value).
- `20261114000002_assessment_media.sql`: recording, segment and consent
  tables, with read access for reviewers only. Writes go through the
  `assessment-media` function.
- `20261114000003_assessment_recording_chunk_timing.sql`: capture time and
  duration of each segment, used to line recordings up with integrity events.
- `20261114000004_cleanup_recordings_cron.sql`: the daily cleanup schedule,
  **disabled**. The file is a no-op (`SELECT 1`); see
  [Retention](#retention-and-the-cleanup-job).
- `20261114000005_assessment_media_consent_config.sql`: the default consent
  text in `system_config`, admin only.
- `20261117000001_candidate_assessments_reassign.sql`: allows a new attempt
  next to finished ones. Only one open attempt per candidate and assessment is
  still allowed.
- `20261117000002_assessment_recording_retention.sql`: the 90-day deletion
  setting, off by default, with an audit log entry on every change.

### 4. Deploy the functions, then the frontend

Deploy these edge functions **before** the frontend:

- `assessment-media` (new)
- `cleanup-recordings` (new)
- `candidate-portal`
- `grade-assessment`
- `generate-assessment`

A new frontend against old functions cannot record, and every exam would stop
at the recording step.

### 5. Allow camera and microphone in the web server

The page must be allowed to use the camera and microphone. The bundled
`nginx.conf` sends:

```
Permissions-Policy: camera=(self), microphone=(self), geolocation=()
```

If you serve the app another way, send the same header. A policy of
`camera=()` blocks recording, and every candidate fails the permission step.
The app must be served over HTTPS.

### 6. Review the consent text

Open **Settings → Assessments → Recording consent** as an admin. The defaults
are placeholders, **"Your Company"** and **privacy@example.com**; replace them
with your organisation's name and a real contact address before candidates
take recorded assessments. The text may use `{company}` and `{privacyEmail}`,
which are filled in when shown, and must include `{privacyEmail}`.

The text says recordings are deleted after 90 days. If you do not turn on the
deletion setting below, change that sentence so candidates are not told
something that will not happen; the settings page warns about this mismatch.

Any change to the company name, email or text creates a new consent version,
and candidates are asked to agree again on their next exam start.

## Retention and the cleanup job

**Settings → Assessments → Recording consent** has the switch
**Delete assessment recordings after 90 days**. It is off by default.

- While it is off, nothing is deleted. A dry run of `cleanup-recordings` still
  reports what would be deleted.
- When it is on, a cleanup run deletes the R2 files of recordings whose
  attempt was completed (or started, if never completed) more than 90 days
  ago, and marks the rows deleted (metadata is kept). This includes the
  backlog that expired before the switch was turned on. **Recordings of hired
  candidates are kept.** When you turn it on, the settings page shows how
  many recordings are already past 90 days and would be deleted.
- Attempts, scores and stages are never changed.

Turning the switch on does not by itself run anything. The daily schedule in
`20261114000004_cleanup_recordings_cron.sql` is commented out. To enable it:

1. Deploy the `cleanup-recordings` function from this release, with the R2
   variables set. Its report includes `retention_enabled`; an older build
   without that field has no setting check and must not be scheduled.
2. Call it by hand with the service role key. The body defaults to a dry run:

   ```bash
   curl -X POST "https://<your-supabase-host>/functions/v1/cleanup-recordings" \
     -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
     -H "Content-Type: application/json" -d '{}'
   ```

   Check the report.
3. Turn on the setting in Settings, if you want deletion.
4. Make sure the `edge_functions` row in `internal_webhook_config` is enabled
   (the job calls the function through `public.invoke_edge_function`), then
   run the commented block in the migration by hand. It schedules the job at
   02:30 UTC daily with `{"dry_run": false, "limit": 200}`; pick another time
   if that suits you better.

To stop the job: `SELECT cron.unschedule('cleanup-recordings');`

## Operations

- **Rotating R2 keys.** Create a new token, set the new variables and restart
  the functions runtime, then revoke the old token. Presigned URLs already
  handed out stop working when the old token is revoked.
- **Incomplete recordings.** Look for `media_incomplete_at_submit` in the
  attempt's integrity log; it records how many segments were still pending
  and which spoken answers were not saved.
- **Presigned URL lifetime.** Upload and playback URLs expire after
  `R2_PRESIGN_TTL_SECONDS` (default 10 minutes, at most 1 hour).
