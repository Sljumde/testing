# Korosuno Create Inquiry Apps Script

This Apps Script is the only normal destination for new inquiry creation when `INQUIRY_CREATE_MODE=korosuno`.

## Deployment

1. Create or open the Apps Script project attached to the CRM Google Sheet.
2. Copy `Code.gs` and `appsscript.json` into that Apps Script project.
3. Enable the Advanced Google Sheets API service for the script project.
4. Set Script Property `CRM_APPS_SCRIPT_SECRET` to the same secret used by the Next.js server as `CRM_APPS_SCRIPT_SECRET`.
5. Run `setupKorosuno()` manually once.
6. Run `repairInquirySequence()` manually once and review the returned report before creating test inquiries.
7. Deploy as a web app with the `/exec` URL.
8. Set the Next.js server env vars:
   - `INQUIRY_CREATE_MODE=korosuno`
   - `CRM_APPS_SCRIPT_URL=<web app /exec URL>`
   - `CRM_APPS_SCRIPT_SECRET=<shared secret>`

Do not expose the secret with a `NEXT_PUBLIC_` variable.

## Operational Rules

- Normal create writes one complete `Korosuno!A:X` row only.
- Normal create does not write to `Inquiries`, `BACKUP`, `DELETED`, `Crucial`, dashboard sheets, formulas, totals, or status columns.
- `InquiryRequestLog` stores idempotency state and the immutable 24-cell row JSON.
- `InquirySequence!B1` and Script Property `INQUIRY_SEQUENCE_FLOOR` are advanced under `ScriptLock`.
- A repeated `requestId` returns the same inquiry number or `PENDING`; it never allocates another number.
- Stale `WRITING` requests recover from the stored row JSON and allocated inquiry number.

## Manual Functions

- `setupKorosuno()`: creates or validates `Korosuno`, `InquiryRequestLog`, and `InquirySequence`.
- `repairInquirySequence()`: scans `InquirySequence`, `Inquiries`, `Korosuno`, optional `BACKUP`, optional `DELETED`, and `InquiryRequestLog`, then raises both sequence stores to the highest consumed inquiry number.
