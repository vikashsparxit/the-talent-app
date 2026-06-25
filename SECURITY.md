# Security Policy

## Supported Versions

Security fixes are applied to the `main` branch. Deployments should track `main` or a recent release tag.

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Instead, report them privately using one of these methods:

1. **GitHub Security Advisories** (preferred): open your fork or upstream repo → **Security** → **Report a vulnerability**.
2. **Email:** `security@your-domain.com` — replace with your organization's security contact before publishing.

Include:

- Description of the issue and potential impact
- Steps to reproduce
- Affected component (frontend, edge function name, migration, etc.)
- Any suggested fix, if you have one

We aim to acknowledge reports within **5 business days** and will coordinate disclosure and a fix before public details are shared.

## Scope

In scope: authentication bypass, RLS policy gaps, injection, privilege escalation, secret exposure in client bundles or logs, and unsafe edge-function behavior.

Out of scope: social engineering, denial-of-service against your own deployment, and issues in third-party services (Supabase, Google Gemini, Resend) unless caused by misconfiguration in this repo's documented setup.

## Safe Harbor

Good-faith security research that follows this policy will not result in legal action from the maintainers.
