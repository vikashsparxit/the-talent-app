# Privacy & Compliance

The Talent App processes personal data about applicants and staff. This page describes what the application does today, what is planned, and what remains the responsibility of whoever deploys it.

**The Talent App is not certified against GDPR, India's DPDP Act, SOC 2, or ISO 27001.** It provides building blocks; compliance depends on how you configure, host, and operate your deployment.

## What the application provides today

| Area | What is in place |
|------|------------------|
| **Access control** | Row Level Security on every table; role-scoped access for admin, HR, recruiter, and interviewer; private storage buckets with signed URLs for resumes |
| **Audit log** | Append-only `audit_log` of staff actions on candidates, roles, and interviews, viewable in Settings → Security |
| **Staff MFA** | TOTP enrolment and login challenge. Requires TOTP to be enabled in your Supabase Auth (GoTrue) configuration |
| **SSO** | SAML 2.0 sign-in entry point and Settings UI. Identity-provider registration is done in your Supabase Auth configuration |
| **Policy links** | Privacy policy and terms URLs configured in Settings → Compliance, shown in the applicant footer and consent flows |
| **Grievance officer** | Name and email configured in Settings → Compliance, shown in the applicant footer |
| **Sub-processor disclosure** | Settings → Compliance lists the third-party services the application calls |
| **Sensitive-field consent** | Explicit consent, with timestamp and source, when an applicant saves date of birth, gender, marital status, or blood group |
| **Assessment consent** | Consent is required and recorded before an applicant starts an exam; enforced server-side |
| **Email preferences** | Applicants can opt out of application and assessment emails; opt-outs are enforced before sending and logged |
| **Staff offboarding** | Deactivation flow transfers candidates, disables login, and preserves history |

## Not yet available

These are not yet available and should not be assumed:

- Consent capture on careers apply, applicant sign-up, bulk import, and manual candidate creation
- A data subject request workflow (access, export, erasure) with an HR review queue
- Automated retention (archive or anonymise inactive candidates)
- Cookie and local-storage notice on public pages
- Enforcement of the applicant "marketing" email preference (the application sends no marketing email)

## Sub-processors

The application calls these services when the corresponding feature is configured:

| Service | Used for | Data sent |
|---------|----------|-----------|
| **Supabase** | Database, authentication, file storage, edge functions | All application data |
| **Google Gemini** | Resume parsing, scoring, assessment generation and grading, Chitragupta messages | Candidate profile and resume content, job descriptions, pipeline metrics |
| **AWS SES** | Transactional and authentication email | Recipient address and message content |
| **Tavily** | Salary market check and company website lookup | Job title, location, and company names — no candidate contact details |
| **Piston** | Running code submitted in coding assessments | Submitted code. Self-hosting Piston is recommended |

## Deployer responsibilities

If you host The Talent App, you are responsible for:

- Publishing a privacy policy and terms, and setting their URLs in Settings → Compliance
- Establishing a lawful basis for processing and obtaining consent where the application does not yet capture it
- Signing data processing agreements with the sub-processors you enable
- Choosing hosting regions that meet your data-residency obligations and disclosing cross-border transfers
- Handling access, export, and erasure requests (currently a manual process using staff export and delete)
- Defining and applying a retention schedule
- Enabling MFA and SSO in Supabase Auth, and keeping every migration in `supabase/migrations/` applied
- Maintaining your own incident response and breach notification process
