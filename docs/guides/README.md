# SparxTalent / The Talent App — User Guides

Role-based process playbooks for staff, applicants, and self-host deployers.

## How guides relate to `/features`

| Resource | Purpose |
|----------|---------|
| **[Features Overview](/features)** (`src/lib/features.ts`) | **What** the product can do — feature catalogue organised by role |
| **`docs/guides/`** (this folder) | **How** to run hiring — workflows, handoffs, failure paths, and role boundaries |

Use `/features` when you need to discover capabilities. Use these guides when you need to know *who does what*, *in what order*, and *which screen to use*.

## Guide index

| Guide | Audience | In-app (`/help`) |
|-------|----------|------------------|
| [Hiring sequence](./hiring-sequence.md) | All staff | Yes — always shown |
| [Admin playbook](./admin.md) | Admin | Yes |
| [HR playbook](./hr.md) | HR (+ admin) | Yes |
| [Recruiter playbook](./recruiter.md) | Recruiter (+ admin, HR) | Yes |
| [Interviewer playbook](./interviewer.md) | Interviewer (+ admin, HR) | Yes |
| [Applicant playbook](./applicant.md) | Candidates / applicants | Docs only (v1) |
| [OSS self-host quickstart](./oss-self-host.md) | Deployers / maintainers | Yes (admin) |

## Cross-references

- **QA roles matrix:** `docs/MANUAL_TEST_CASES.md` §18.16
- **Local setup:** `docs/LOCAL_SETUP_GUIDE.md`
- **Email notifications:** `docs/EMAIL_NOTIFICATIONS.md`
- **Chitragupta KRA:** `CHITRA_KRA.md` (private repo)

## OSS export

These files ship with the public `the-talent-app` export. Applicant-facing compliance details will link to the Compliance section in `ROADMAP.md` when shipped.
