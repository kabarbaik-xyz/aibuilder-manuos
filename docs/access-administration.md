# Access administration

The Admin sidebar group exposes `/settings/users`, `/settings/roles` and `/settings/permissions` to memberships with `access.manage`. Other users see an access-denied state on direct page access; APIs enforce the same capability. Anonymous page access redirects to login.

## Users

Create a new account with a name, email, initial password of at least 12 characters and one or more active workspace roles. Existing email addresses are rejected; this flow never resets another account's credentials. Edit user supports name and login email as well as membership access. Shared account identity is editable only when the actor has active access administration in every linked workspace; otherwise identity fields are read-only. Identity updates require the read-model identityUpdatedAt timestamp to reject stale profile edits. Email uniqueness is validated; changing email resets verification and revokes the target account sessions. Passwords remain unchanged, and editing your own email returns you to login. Membership and identity changes roll back together on any permission/version/last-admin failure.

Manage access replaces the membership's complete role assignment, optional scope and active/disabled status. Disabled membership is retained and can be reactivated. Changes affect subsequent authenticated requests because the principal is reconstructed from active membership and role grants. This does not delete a global account or sessions used in other workspaces.

Customer memberships require a workspace customer link and may only hold the CUSTOMER role. TECHNICIAN requires a technician link. Customer and technician scope are mutually exclusive. Technician links are checked for uniqueness and synchronized on the membership and technician records. At least one active system ACCESS_ADMIN must remain after any membership change.

## Roles and permissions

System roles can be inspected but their definitions cannot be changed through these APIs. Create a custom role with a permanent uppercase code, display name and selected catalog permissions. Custom role names, grants and active status can be updated. An inactive role confers no capabilities, including on already assigned memberships. Role deactivation preserves assignment history rather than deleting referenced roles.

The permission catalog is read-only: capability names correspond to server behavior. The Permissions table shows descriptions, resources, actions and the active roles that grant each permission.

## Contracts and transaction behavior

`contracts/openapi.yaml` documents users, membership detail/update, role create/update, permission catalog and customer/technician scope queries. IDs in `/api/users/{id}` are membership IDs. All reads return `{ data: ... }`; mutations return the ordinary committed `{ data, meta }` envelope.

Mutations use `executeCommand`, scoped authorization checked again inside the transaction, audit events, workspace revision updates and idempotency receipts. Audit details exclude passwords. Updates require `expectedVersion`; stale writes roll back all changes. The UI retains an idempotency key for retries of an unchanged payload and refreshes identity/navigation after access updates.

## Verification

`tests/integration/access-management.test.ts` uses `createFactoryFixture()` and closes its isolated database. It covers actual Better Auth sign-in after email edits, old-email rejection, shared-account identity authorization, transactional session rollback, legacy credential repair, HTTP denial/validation, safe scoped read models, creation/replay, password protection, invalid grants, cross-workspace targets, scope restrictions, stale transaction rollback, final-admin protection, role grant refresh, disable/reactivate and synchronized technician links.

The initial full regression run passed 52 files / 213 tests, including the first seven access administration tests. The final focused run passed all nine access tests and checkout-wide typecheck passed. OpenAPI YAML parsed successfully. The local Next.js server compiled the Users page and returned a 307 login redirect for an anonymous request. Local database reconciliation reported balanced with 0 movements / 0 buckets; populated ledger invariants are covered by the integration suites. No browser-render or production deployment proof is implied by these integration tests.

## User identity editing verification

The edit-user follow-up passed 27 tests across access administration, authentication and access-shell suites; final typecheck passed. New accounts pin credential accountId to user.id as required by Better Auth. Migration `20261015110000_credential_account_identifiers` repairs legacy email-based identifiers without changing passwords, and is idempotent. Before applying it locally, the count of accounts requiring repair was zero. Browser form interaction remains unverified.
