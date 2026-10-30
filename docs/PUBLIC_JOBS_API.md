# Public Jobs API (v1)

Read-only access to a company's **open job postings**, for job boards, company websites, aggregators and partner systems.

- **Read-only.** Lists open jobs and returns one job's details. It cannot create, change or apply to jobs.
- **Public data only.** You get what the careers page shows. Salary, number of openings, internal notes, assessment settings and anything about candidates are never returned.
- **Machine-readable spec:** `GET <base URL>/openapi.json` returns an OpenAPI 3.1 document you can load into Postman, Swagger UI or a client generator.

---

## Base URL

```
https://<your-supabase-host>/functions/v1/public-jobs
```

Your hiring team gives you `<your-supabase-host>`. It is the same host their careers site talks to, not the careers site itself.

## Authentication

None is required by the API. Some deployments put a gateway in front of all functions that expects the public (anon) key. If your first request returns `401`, ask the hiring team for their **public** key and send it on every request:

```
apikey: <public-key>
Authorization: Bearer <public-key>
```

That key is designed to be public. Never ask for, or accept, a service-role key.

## Endpoints

### List open jobs

```
GET /public-jobs
```

Newest first. All query parameters are optional.

| Parameter | Type | Description |
|---|---|---|
| `limit` | integer, 1–100 | Page size. Default `50`. |
| `offset` | integer, 0–10000 | Number of jobs to skip. Default `0`. |
| `department` | string | Exact match, e.g. `Frontend`. |
| `domain` | string | Exact match, e.g. `Engineering`. |
| `location` | string | Case-insensitive "contains" match, e.g. `noida`. |
| `employment_type` | enum | `full_time`, `part_time`, `contract`, `internship`, `freelance`. |
| `experience_level` | enum | `entry`, `mid`, `senior`, `lead`, `executive`. |
| `updated_since` | ISO 8601 date or date-time | Only jobs updated at or after this time. Use it for incremental sync. |

Response `200`:

```json
{
  "api_version": "v1",
  "data": [
    {
      "id": "3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b",
      "title": "Senior React Developer",
      "description": "You will build the hiring UI...",
      "domain": "Engineering",
      "department": "Frontend",
      "location": "Noida, India",
      "employment_type": "full_time",
      "experience_level": "senior",
      "experience_years": "5-8",
      "skills": ["React", "TypeScript"],
      "application_deadline": "2026-12-31",
      "posted_at": "2026-10-01T10:00:00Z",
      "updated_at": "2026-10-20T10:00:00Z",
      "url": "https://careers.example.com/careers/3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b",
      "apply_url": "https://careers.example.com/careers/3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 1, "has_more": false }
}
```

### Get one job

```
GET /public-jobs/{id}
```

`id` is the job's UUID from the list. Returns `{ "api_version": "v1", "data": { ...job } }`.

A job that is closed, paused, filled or deleted returns `404`. Treat that as "remove this listing".

## Job fields

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Stable for the life of the job. Use it as your external reference. |
| `title` | string | |
| `description` | string or null | Plain text; may contain line breaks. Escape it before inserting into HTML. |
| `domain` | string or null | Broad area, e.g. Engineering. |
| `department` | string or null | Team within the domain. |
| `location` | string or null | Free text, e.g. "Noida, India" or "Remote". |
| `employment_type` | enum or null | See the list above. |
| `experience_level` | enum or null | See the list above. |
| `experience_years` | string or null | Free text range, e.g. `"3-5"`. |
| `skills` | string[] | May be empty. |
| `application_deadline` | date or null | `YYYY-MM-DD`. |
| `posted_at` | date-time | When the job was created. |
| `updated_at` | date-time | Last change to the posting. |
| `url` | URL or null | Public job page on the careers site. `null` only if the deployment has no public app URL configured. |
| `apply_url` | URL or null | Send candidates here to apply. Today the same as `url`. |

New fields may be added within `v1`, so ignore fields you don't recognise. Removing or renaming a field means a new version.

## Errors

Errors are JSON with an `error` message:

```json
{ "error": "limit must be between 1 and 100" }
```

| Status | Meaning |
|---|---|
| `400` | A parameter or job id is invalid. The message says which. |
| `401` | The deployment's gateway wants the public key (see Authentication). |
| `404` | Job not found or no longer open, or unknown path. |
| `405` | Only `GET` is supported. |
| `500` | Server error. The response includes a `request_id` to quote when reporting it. |

## Caching, sync and fair use

- Responses can be cached for **5 minutes** (`Cache-Control: public, max-age=300`). Polling more often than that gains nothing.
- **Recommended sync:** one full read (page through with `offset` until `has_more` is `false`), then poll every 15–60 minutes with `updated_since` set to the time of your previous sync. Separately re-check jobs you hold, since a job that closes disappears from the list instead of appearing in it.
- Keep requests modest: a full sync of a few pages per poll is fine; please avoid tight loops.

## Browser use (CORS)

The API sends `Access-Control-Allow-Origin: *`, so a website can call it directly from the browser.

## Examples

**curl**

```bash
curl "https://<your-supabase-host>/functions/v1/public-jobs?employment_type=full_time&limit=20"
```

**JavaScript (browser or Node 18+)**

```js
const BASE = "https://<your-supabase-host>/functions/v1/public-jobs";

async function fetchAllOpenJobs() {
  const jobs = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${BASE}?limit=100&offset=${offset}`);
    if (!res.ok) throw new Error((await res.json()).error);
    const page = await res.json();
    jobs.push(...page.data);
    if (!page.pagination.has_more) return jobs;
  }
}
```

**Python**

```python
import requests

BASE = "https://<your-supabase-host>/functions/v1/public-jobs"
job = requests.get(f"{BASE}/3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b", timeout=10)
if job.status_code == 404:
    print("Job closed: remove the listing")
else:
    job.raise_for_status()
    print(job.json()["data"]["title"])
```

## Google for Jobs

Each job page on the careers site (`url`) already includes `JobPosting` structured data, so Google can list the jobs without using this API.

---

## For deployment owners

1. **Deploy the function.** Hosted Supabase: `supabase functions deploy public-jobs --no-verify-jwt`. Self-hosted: copy `supabase/functions/public-jobs` and `supabase/functions/_shared` into the functions volume and restart the functions service.
2. **Set the public app URL** so `url` and `apply_url` are filled in: `PUBLIC_APP_URL` on the functions service, or `public_url` in the business branding settings.
3. **Gateway JWT checks.** `supabase/config.toml` disables JWT verification for this function. On self-hosted stacks where the functions gateway verifies JWTs for every function, partners must send the public key (see Authentication).
4. **Check it:** `curl https://<your-supabase-host>/functions/v1/public-jobs?limit=1` should return `"api_version": "v1"`.
