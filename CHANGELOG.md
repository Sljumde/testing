# Changelog

## 2026-07-20 — Timeless deterministic scheduling

- Removed the All-day / Time not set event dump.
- Added stable Company/Inquiry-sorted display-only times, sixteen half-hour rows from 10:00–18:00, round-robin overflow lanes, and complete slot popovers.
- Rebuilt Timeless event cards and details to match the premium BrownWall scheduling visual system.

## 2026-07-18 — Global shell and Timeless calendar

- Added a reusable authenticated AppShell with responsive global navigation, route-aware active states, sticky behavior, and preserved Logout.
- Replaced the Timeless vertical timeline with a bounded weekly/day calendar and explicit seven-day server queries.
- Added safe date parsing, all-day follow-ups, event deduplication, compact detail dialogs, abortable requests, and response limits.

## 2026-07-18 — Executive sales command centre

- Replaced the homepage navigation-card grid with authorized team and individual performance analytics.
- Added compact responsive navigation, Coming Up follow-ups, compact team contacts, and the Timeless timeline.
- Added server-side KPI/timeline aggregation, exact revenue and date mappings, stage grouping, and unclassified-stage diagnostics.

## 2026-07-16

### Client Intelligence Database

- Replaced full customer-row delivery with authenticated, server-side, 15-record pagination and typed field projection.
- Added server-side search, filters, sorting, role/team ownership scope, request cancellation, skeletons, range totals, and responsive layouts.
- Added full protected contact display, normalized `tel:` Send to device actions, `mailto:` email actions, and action audit events.
- Added session-aware repeating confidentiality watermark.
- Added centralized customer permissions and BOSS-only Security Activity API/page with LOW/MEDIUM/HIGH event classification.
- Redirected `/customers/new` to `/customers`; retained reusable legacy form code but removed it from user navigation.
- Added configurable legacy customer column mapping and Client Database governance documentation in `CONCEPT.md`.
