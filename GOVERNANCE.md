# Governance

The Talent App is an open-source project led by [SparxIT](https://www.sparxitsolutions.com) and released under the MIT License. This document describes how the project is run.

## Roles

**Users** run The Talent App and help others by asking good questions, reporting bugs and sharing how they use it.

**Contributors** submit pull requests, documentation, reviews, triage help or design feedback. Anyone can be a contributor; no sign-up is needed beyond following the [Code of Conduct](CODE_OF_CONDUCT.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

**Maintainers** are listed in [MAINTAINERS.md](MAINTAINERS.md). They triage issues, review and accept contributions, publish releases and enforce the Code of Conduct.

**Lead maintainer.** Vikash Sharma (SparxIT) is the lead maintainer. The lead maintainer sets the roadmap, approves releases, security fixes and database migrations, and has the final say when maintainers cannot reach agreement.

## How decisions are made

- **Day-to-day changes** (bug fixes, documentation, small features) are decided by lazy consensus: a maintainer approves the change and nobody with commit responsibility objects.
- **Significant changes** (new modules, changes to the role and permission model, breaking schema changes, new required configuration, new third-party services) start as a GitHub Discussion or issue with a short proposal. Maintainers aim to respond within ten business days. The lead maintainer makes the final decision and records it in the thread.
- **Security fixes** are handled privately as described in [SECURITY.md](SECURITY.md) and may ship without public discussion.
- **Releases** follow [Semantic Versioning](https://semver.org). Every release is tagged `vX.Y.Z` and described in [CHANGELOG.md](CHANGELOG.md); operator steps are in [docs/UPGRADING.md](docs/UPGRADING.md).

## How contributions land

The project is published from SparxIT's internal repository on each release. Accepted pull requests are applied internally with the contributor kept as the commit author, credited in the CHANGELOG and release notes, and the public pull request is closed with a link to the release that includes it.

## Becoming a maintainer

Contributors who have made sustained, high-quality contributions (code, reviews or triage) over several months can be nominated by any maintainer. The lead maintainer decides after consulting the existing maintainers. New maintainers are added to MAINTAINERS.md and CODEOWNERS. Maintainers who are inactive for six months may be moved to emeritus status; they can return at any time by asking.

## Code of Conduct

Everyone participating in the project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Reports go to [opensource@sparxit.com](mailto:opensource@sparxit.com) and are handled confidentially by the maintainers.

## Trademarks and commercial offerings

"The Talent App" and "SparxIT" names and logos are used by SparxIT. The MIT License covers the code, not the names or logos. SparxIT offers commercial services around the project; these do not affect how community contributions are reviewed.

## Changes to this document

Changes to governance are proposed by pull request and approved by the lead maintainer.
