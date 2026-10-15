# Workspace access administration

User authorized implementation of the missing Users, Roles and Permissions administration surfaces.

- [x] Trace existing authentication, permission catalog, provisioning and last-admin contracts.
- [x] Add audited, idempotent access commands with workspace scoping and optimistic versions.
- [x] Add Users, Roles and read-only Permissions pages to the Admin navigation group and navigation search.
- [x] Use shared light-theme forms and centered modals; protect system role definitions.
- [x] Verify authorization denial, account creation/replay, existing credential protection, scope isolation, last-admin protection, stale rollback and live grant changes in isolated integration fixtures.
- [x] Run existing regression suites: 52 files / 213 tests passed before the final two scoped-membership cases were added.
- [x] Complete final focused checks: 9 access tests passed; typecheck passed; OpenAPI parsed; local Users page returned a 307 login redirect; local reconciliation balanced (0 movements / 0 buckets).

- [x] Add Edit user name/email with shared-account authorization, stale identity checks, session revocation on email changes, verified Better Auth login and a legacy credential-identifier data migration. Follow-up checks: 27 tests and typecheck passed.

API contract: `contracts/openapi.yaml`. Usage and verification: `docs/access-administration.md`.
