# Permission Model and Initial Matrix

## Rules

- Deny by default. Role labels are bundles, never authorization logic embedded in routes.
- `own` means persisted primary owner; `team` means current effective membership in a managed team; `all` is organization-wide.
- Server services determine scope from the database. Ownership and sender identity are never accepted as authority from request JSON.
- Reassignment, deletion/restoration, merge, export, audit access, and settings changes are distinct permissions and always audited.
- `BOSS`, `HEAD`, and `EMPLOYEE` names are retained for migration only. Grants below are proposed defaults and require BrownWall approval.

Legend: ✓ default grant, — no default grant, C conditional (team/assigned/resource policy).

| Permission | EMPLOYEE | HEAD | BOSS | Enforcement notes |
|---|:---:|:---:|:---:|---|
| `inquiry.create` | ✓ | ✓ | ✓ | owner=session user unless reassignment grant |
| `inquiry.read.own` | ✓ | ✓ | ✓ | persisted owner/approved collaborator |
| `inquiry.read.team` | — | ✓ | ✓ | effective managed team only |
| `inquiry.read.all` | — | — | ✓ | organization scope |
| `inquiry.update.own` | ✓ | ✓ | ✓ | field and transition policy still applies |
| `inquiry.update.team` | — | ✓ | ✓ | persisted team scope |
| `inquiry.reassign` | — | C | ✓ | HEAD within managed team; reason mandatory |
| `inquiry.delete` | — | — | ✓ | soft-delete; confirmation/reason |
| `inquiry.restore` | — | — | ✓ | audited, conflict checks |
| `customer.create` | ✓ | ✓ | ✓ | owner=session user by default |
| `customer.read.own` | ✓ | ✓ | ✓ | include assigned/shared relationship |
| `customer.read.team` | — | ✓ | ✓ | team scope |
| `customer.read.all` | — | — | ✓ | organization scope |
| `customer.update.own` | ✓ | ✓ | ✓ | version check required |
| `customer.update.team` | — | ✓ | ✓ | team scope |
| `customer.reassign` | — | C | ✓ | same constraints as inquiry reassignment |
| `customer.merge` | — | — | ✓ | preview, reason, atomic merge |
| `task.create.own` | ✓ | ✓ | ✓ | linked entity must be visible |
| `task.create.team` | — | ✓ | ✓ | managed team |
| `task.update.own` | ✓ | ✓ | ✓ | assignee/creator policy |
| `task.update.team` | — | ✓ | ✓ | managed team |
| `communication.log` | ✓ | ✓ | ✓ | sender=session user |
| `communication.send.email` | C | C | C | only configured provider/consent |
| `communication.open.whatsapp` | C | C | C | visible contact and consent policy |
| `communication.send.whatsapp` | C | C | C | approved API/template only |
| `dashboard.personal` | ✓ | ✓ | ✓ | scoped metrics |
| `dashboard.team` | — | ✓ | ✓ | managed team |
| `dashboard.executive` | — | — | ✓ | organization metrics |
| `export.data` | — | C | ✓ | scoped, rate-limited, audited |
| `audit.read` | — | C | ✓ | HEAD limited to managed team events |
| `data_quality.read` | — | ✓ | ✓ | scope-sensitive |
| `settings.manage` | — | — | ✓ | versioned and audited |
| `permissions.manage` | — | — | ✓ | separation-of-duties review recommended |

## Pipeline transition policy

Stage transitions additionally require an allowed edge, required fields, SLA/closure rules, and a transition permission. Suggested permissions are `inquiry.stage.advance.own`, `.team`, `.all`, plus `inquiry.stage.reopen`. Won requires final value, expected/actual close information, company/contact, and next lifecycle reference as configured. Lost requires a controlled lost reason and notes. Reopen and backward movement require a reason and audit event.

## Authorization algorithm

1. `requireSession()` verifies provider session, application user active state, expiry/revocation, and authorization version.
2. `requirePermission(code)` resolves effective role grants and time-bound user allow/deny overrides; explicit deny wins.
3. Resource policy loads the persisted record and evaluates own/team/all scope.
4. Field policy rejects protected changes (owner, stage, business ID, audit metadata) unless the dedicated action is invoked.
5. Service executes under RLS and writes an audit event. Failure returns 401 for no session, 403 for denied permission, 404 where disclosure must be avoided, and 409 for version conflicts.

## API coverage requirement

Maintain a machine-tested route registry declaring every endpoint as public or listing session, permission, scope, validation, CSRF, audit, and idempotency requirements. CI fails if an API route is unregistered. Initially public: login/auth callbacks and shallow liveness only. Dropdown/contact data requires authentication and appropriate record scope.

## Governance

Permission changes require actor, reason, approval where required, effective period, and immutable audit. Review BOSS accounts and overrides quarterly; review leavers immediately; alert on privilege escalation and unusual exports. Emergency access must be time-bound and retrospectively reviewed.
