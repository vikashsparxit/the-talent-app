# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.0.x (latest release) | Yes |
| 0.x snapshots (untagged, before 1.0.0) | No — back up and do a fresh install of 1.0.0 ([docs/UPGRADING.md](docs/UPGRADING.md)) |

Security fixes ship in patch releases of the latest release line and are announced with a GitHub Security Advisory. Deployments should run the latest release tag and must apply every migration in `supabase/migrations/`.

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Instead, report them privately through **GitHub Security Advisories**: open the repository → **Security** → **Report a vulnerability**.

If you cannot use GitHub Security Advisories, email **security@thetalentapp.io**. For general project questions, contact the maintainers at **opensource@sparxit.com**.

Include:

- Description of the issue and potential impact
- Steps to reproduce
- Affected component (frontend, edge function name, migration, etc.)
- Any suggested fix, if you have one

We aim to acknowledge reports within **5 business days** and will coordinate disclosure and a fix before public details are shared. We ask for up to **90 days** before public disclosure.

## Scope

In scope: authentication bypass, RLS policy gaps, injection, privilege escalation, secret exposure in client bundles or logs, and unsafe edge-function behavior.

Out of scope: social engineering, denial-of-service against your own deployment, and issues in third-party services (Supabase, Google Gemini, AWS SES) unless caused by misconfiguration in this repo's documented setup.

## Safe Harbor

Good-faith security research that follows this policy will not result in legal action from the maintainers.
