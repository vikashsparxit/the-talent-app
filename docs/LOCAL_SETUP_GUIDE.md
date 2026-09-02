# Local Development & Self-Hosting Guide

This guide walks you through setting up The Talent App on your local machine.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Get the Source Code](#2-get-the-source-code)
3. [Install Dependencies](#3-install-dependencies)
4. [Environment Configuration](#4-environment-configuration)
5. [Run the Frontend](#5-run-the-frontend)
6. [Edge Functions (Local Development)](#6-edge-functions-local-development)
7. [Fully Self-Hosted Supabase](#7-fully-self-hosted-supabase)
8. [Database Migrations](#8-database-migrations)
9. [Secrets & API Keys](#9-secrets--api-keys)
10. [Storage Buckets](#10-storage-buckets)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

Make sure you have the following installed:

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | v18+ | JavaScript runtime |
| **npm** or **bun** | Latest | Package manager |
| **Git** | Latest | Version control |
| **Supabase CLI** | Latest | Local Supabase stack & edge functions |
| **Docker** | Latest | Required for local Supabase (optional) |

### Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# npm (cross-platform)
npm install -g supabase

# Windows (scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

---

## 2. Get the Source Code

```bash
git clone https://github.com/<your-org>/the-talent-app.git
cd the-talent-app
```

---

## 3. Install Dependencies

```bash
# Using npm
npm install

# Or using bun (faster)
bun install
```

---

## 4. Environment Configuration

Copy the example file and edit for your environment (`npm run dev` loads `.env.dev` via Vite mode `dev`):

```bash
cp .env.example .env.dev
```

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

For a fully local Supabase instance (see [Section 7](#7-fully-self-hosted-supabase)):

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<your-local-anon-key>
```

Optional — local dev only, when edge function `GOOGLE_AI_API_KEY` is not set remotely:

```env
VITE_GEMINI_API_KEY=your-google-ai-api-key
```

> The local anon key is printed when you run `supabase start`.

---

## 5. Run the Frontend

```bash
# Development server with hot reload
npm run dev
```

The app will be available at `http://localhost:5173` (or the next available port).

### Build for Production

```bash
npm run build
```

The output will be in the `dist/` folder. You can serve it with any static file server:

```bash
npx serve dist
```

Or deploy to **Vercel**, **Netlify**, **Cloudflare Pages**, etc.

---

## 6. Edge Functions (Local Development)

The project has the following edge functions in `supabase/functions/`:

| Function | Purpose |
|----------|---------|
| `candidate-portal` | Candidate assessment portal API |
| `execute-code` | Code execution for coding questions |
| `parse-resume` | Resume parsing with AI |
| `send-applicant-email` | Applicant status emails (received, shortlist, reject, hold, backout) |
| `send-completion-email` | Assessment completion emails |
| `send-invitation-email` | Assessment invitation emails |
| `send-staff-email` | Staff fan-out (interview scheduled, verdict submitted) |
| `send-auth-email` | Auth Send Email Hook — signup confirmation, password reset, etc. via AWS SES SMTP |

### Auth Send Email Hook (local)

Auth emails (signup, recovery, magic link, invite, email change, reauthentication) are sent through the **Send Email Hook** → `send-auth-email` edge function → AWS SES (SMTP). When the hook is enabled, GoTrue's built-in SMTP is **not** used.

1. Generate a hook secret (32–88 char base64) or copy from Supabase Dashboard → Auth → Hooks → Send Email.
2. Add to `.env.local` at project root:

```env
SES_SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SES_SMTP_PORT=587
SES_SMTP_USER=your_ses_smtp_user
SES_SMTP_PASSWORD=your_ses_smtp_password
EMAIL_FROM=system@thetalentapp.io
SEND_AUTH_EMAIL_HOOK_SECRET=v1,whsec_your_base64_secret_here
```

3. `supabase/config.toml` already wires `[auth.hook.send_email]` to `http://host.docker.internal:54321/functions/v1/send-auth-email`.
4. Restart the stack after secret changes: `supabase stop && supabase start`
5. Serve the hook function (JWT verification disabled — hook uses webhook signature):

```bash
supabase functions serve send-auth-email --no-verify-jwt --env-file .env.local
```

6. Configure **From address** in Settings → Email (defaults to `system@thetalentapp.io` when empty).

### Run Edge Functions Locally

```bash
# Start the local Supabase stack (requires Docker)
supabase start

# Serve edge functions locally
supabase functions serve
```

Edge functions will be available at `http://localhost:54321/functions/v1/<function-name>`.

### Set Edge Function Secrets Locally

Create a `.env.local` file in the project root for edge function secrets:

```env
SES_SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SES_SMTP_PORT=587
SES_SMTP_USER=your_ses_smtp_user
SES_SMTP_PASSWORD=your_ses_smtp_password
EMAIL_FROM=system@thetalentapp.io
SEND_AUTH_EMAIL_HOOK_SECRET=v1,whsec_your_base64_secret_here
GOOGLE_AI_API_KEY=your_google_ai_api_key
```

> Configure AWS SES SMTP credentials in the AWS console (SES → SMTP settings). Verify `thetalentapp.io` (or your sender) before production sends.

> Get your Google AI API key from [Google AI Studio](https://aistudio.google.com/apikey).

Then serve with:

```bash
supabase functions serve --env-file .env.local
```

---

## 7. Fully Self-Hosted Supabase

To run your own Supabase instance:

### Step 1: Start Local Supabase

```bash
# Initialize (if not already done — config.toml already exists in this project)
supabase start
```

This spins up the full Supabase stack via Docker:
- **PostgreSQL** database on port `54322`
- **REST API** (PostgREST) on port `54321`
- **Auth** (GoTrue) on port `54321`
- **Storage** on port `54321`
- **Edge Functions** runtime

### Step 2: Note Your Local Credentials

After `supabase start`, you'll see output like:

```
API URL: http://localhost:54321
anon key: eyJ...
service_role key: eyJ...
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
```

Use the **API URL** as `VITE_SUPABASE_URL` and the **anon key** as `VITE_SUPABASE_PUBLISHABLE_KEY` in your `.env`.

### Step 3: Apply Migrations

```bash
supabase db reset
```

This applies all migrations from `supabase/migrations/` to your local database.

### Step 4: Self-Hosted Production Supabase (Optional)

For a production self-hosted setup, follow the official guide:
- [Supabase Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
- [Supabase Self-Hosting Overview](https://supabase.com/docs/guides/self-hosting)

Alternatively, create a **free Supabase cloud project** at [supabase.com](https://supabase.com) and point your `.env` to it.

---

## 8. Database Migrations

All database migrations are in `supabase/migrations/`. These include:

- Table creation (jobs, candidates, assessments, questions, etc.)
- Row Level Security (RLS) policies
- Database functions and triggers
- Views (assessment_details, public_job_listings)
- Storage bucket configuration

### Apply Migrations to a Remote Supabase Project

```bash
# Link to your remote project
supabase link --project-ref <your-project-ref>

# Push migrations
supabase db push
```

### Apply Migrations Locally

```bash
supabase db reset
```

---

## 9. Secrets & API Keys

The following secrets are used by edge functions and need to be configured in your environment:

| Secret | Purpose | Where to Get |
|--------|---------|--------------|
| `SES_SMTP_HOST` | SES SMTP endpoint | AWS SES console → SMTP settings |
| `SES_SMTP_USER` | SES SMTP username | AWS SES console → SMTP settings |
| `SES_SMTP_PASSWORD` | SES SMTP password | AWS SES console → SMTP settings |
| `SES_SMTP_PORT` | SMTP port (default `587`) | Optional |
| `EMAIL_FROM` | Default from address when Settings empty | `system@thetalentapp.io` |
| `SEND_AUTH_EMAIL_HOOK_SECRET` | Verifies Auth Send Email Hook requests (`v1,whsec_…`) | Supabase Dashboard → Auth → Hooks → Send Email |
| `GOOGLE_AI_API_KEY` | AI features (resume parsing, profile enrichment) | [Google AI Studio](https://aistudio.google.com/apikey) |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin-level DB access in edge functions | Auto-generated by Supabase |

### For Local Development

Add secrets to `.env.local` and pass to edge functions via `--env-file`.

### For Remote Supabase

```bash
supabase secrets set SES_SMTP_HOST=email-smtp.us-east-1.amazonaws.com
supabase secrets set SES_SMTP_USER=your_ses_smtp_user
supabase secrets set SES_SMTP_PASSWORD=your_ses_smtp_password
supabase secrets set GOOGLE_AI_API_KEY=your_google_ai_key
```

---

## 10. Storage Buckets

The project uses a `resumes` storage bucket (public) for storing uploaded resumes.

### Create Bucket Locally

After running `supabase start`, the migrations should create the bucket automatically. If not, create it manually:

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', true);
```

### Storage Policies

The existing migrations handle storage policies. Ensure they're applied via `supabase db reset`.

---

## 11. Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `VITE_SUPABASE_URL` not found | Ensure `.env.dev` exists in the project root and run `npm run dev` (not `vite` without `--mode dev`) |
| Edge functions not working locally | Make sure Docker is running and `supabase start` completed successfully |
| Database connection refused | Check that PostgreSQL is running on port `54322` |
| RLS blocking all queries | Ensure you're authenticated — the app requires login for most operations |
| Resume parsing fails locally | Ensure `GOOGLE_AI_API_KEY` is set in `.env.local` |

### Useful Commands

```bash
# Check Supabase status
supabase status

# View edge function logs
supabase functions logs <function-name>

# Reset database (re-apply all migrations)
supabase db reset

# Stop local Supabase
supabase stop

# Run frontend tests
npm run test
```

### AI Provider

Both `parse-resume` and `enrich-profile` edge functions use **Google Gemini 2.0 Flash** directly via the OpenAI-compatible endpoint:

```
https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
```

Get your API key from [Google AI Studio](https://aistudio.google.com/apikey) and set it as `GOOGLE_AI_API_KEY` in your `.env.local`.

---

## Quick Start Summary

```bash
# 1. Clone the repo
git clone https://github.com/<your-org>/the-talent-app.git && cd the-talent-app

# 2. Install dependencies
npm install

# 3. Create .env.dev (use cloud backend or local — see Section 4)
cp .env.example .env.dev  # then edit with your values

# 4. Start development server
npm run dev

# 5. (Optional) Start local Supabase
supabase start
supabase functions serve --env-file .env.local
```

---

*Last updated: February 2026*
