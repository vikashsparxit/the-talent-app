## Summary

<!-- What does this change do, and why? Link the issue it addresses, e.g. "Closes #123". -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Security fix (please coordinate privately first, see SECURITY.md)
- [ ] Documentation
- [ ] Refactor / maintenance
- [ ] Dependency update

## Checks run locally

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`

## Database, functions and configuration

- [ ] No migration changes
- [ ] Adds a **new** migration in `supabase/migrations/` (shipped migrations are never edited)
- [ ] New tables have row-level security enabled with explicit policies
- [ ] Changes an edge function's request or response shape
- [ ] Adds or changes an environment variable (documented in `.env.example` / `supabase/functions/.env.example`)

<!-- Describe any upgrade steps an operator must take. -->

## Screenshots

<!-- For UI changes, before and after. Remove any personal data. -->

## How this PR is merged

This repository is published from SparxIT's internal repository on each release.
Accepted pull requests are applied internally with you kept as the commit author,
and this PR is closed with a link to the release that includes it.

- [ ] My commits are signed off (`git commit -s`) under the Developer Certificate of Origin.
- [ ] I have read the [Code of Conduct](https://github.com/vikashsparxit/the-talent-app/blob/main/CODE_OF_CONDUCT.md).
