# Prescription PDFs and appointment reminders

Doctors can use **Medical Documents → select prescription → Email to patient**. The server uses the registered patient's email and attaches a real PDF generated from the immutable issued document. The browser cannot substitute a recipient, patient identity, signature, or medication. Clinic-only copies cannot be emailed until released. Resend acceptance is shown as “email queued”; it does not assert inbox delivery.

**Confirm & issue prescription** first saves the current prescription with patient release enabled, then issues the immutable document. It immediately appears in the doctor's Medical Documents and the patient's document library; finalizing the visit is a separate action. Email and PDF download controls are also available beside the issued prescription in the consultation. Opening a prescription notification refreshes an already-open document library. Existing historical clinic-only copies retain their original access restrictions.

Patients use **Medical Documents → select prescription → Download PDF**. The same download button is available in the standalone document viewer and doctor workspace. Downloads use a normal, private PDF response with an attachment filename, rather than a print dialog or public storage link. A short-lived HttpOnly cookie permits the native browser request; ownership and release are checked again when serving the PDF. On iPhone/iPad, Safari may offer a PDF viewer: use Share → Save to Files. Android browsers can save through their download manager. An Open PDF fallback is shown after preparing a download. A real-device Safari/Android check remains part of deployment acceptance.

The portal, downloaded PDF, and emailed PDF use the same escaped HTML template (`lib/prescriptionDocument.ts`) and stylesheet (`app/prescription-document.css`). The PDF retains the logo, pink letterhead, centered prescriber, patient/date columns, medicines, notes, and right-aligned signature. Short prescriptions scale uniformly onto A4; longer prescriptions paginate. The issued content remains an immutable snapshot.

Arimo (Arial-compatible) regular/italic fonts, the Noto Sans symbol fallback, and their OFL licenses are bundled under `public/fonts/prescription`. Server-side Chrome embeds those fonts and the logo without fetching remote resources. The PDF renderer disables JavaScript and external network requests. Both email and download call this same renderer; no public document storage is used.

| Event | Patient | Dr. Kharyl / doctor accounts |
| --- | --- | --- |
| Prescription released | In-app and email | Issued document remains in Medical Documents |
| 24 hours before confirmed appointment | In-app, email, SMS | — |
| 1 hour before confirmed appointment | In-app and email | In-app and email |
| 15 minutes before online consultation | In-app and email; portal joining instructions | In-app and email; open the consultation workspace |

Semaphore SMS is restricted to booking confirmation and the 24-hour reminder. See [booking notifications](booking-notifications.md) for the exact SMS templates. Prescription recovery checks only in-app/email completion.

Booking/payment confirmations, cancellation, reschedule decisions, and requested follow-ups continue using the existing notifications. Notices identify online consultation, clinic consultation, procedures, and packages. Medical diagnosis and medication details are not included in SMS or reminder emails. A prescription attachment is sent only by the doctor's explicit Email to patient action.

## Production setup on Vercel Hobby

1. Deploy this code using Node.js 24 (pinned in `package.json`) with existing `RESEND_API_KEY`, `RESEND_FROM`, `SEMAPHORE_API_KEY`, optional sender name, `APP_URL`, and Supabase server variables. Production Semaphore settings are independent of `.env.local`. Vercel's Linux function uses the bundled Chromium executable; tracing includes its files, shared stylesheet, fonts, and logo. Local Windows/macOS development uses installed Chrome (or `PUPPETEER_EXECUTABLE_PATH`). No new PDF service credentials are required.
2. Set `CRON_SECRET` to a random server-only value of at least 32 characters in Vercel **Production**, then redeploy. Keep it out of public environment variables.
3. Open [setup-appointment-reminders.sql](sql/setup-appointment-reminders.sql), replace its app-origin and CRON_SECRET placeholders, and run the entire script in the production project's Supabase SQL Editor. Supabase Vault is available on hosted Supabase; enable Cron/pg_net if your dashboard requests it. The SQL is intentionally not an automatic migration because it needs deployment-specific secrets.
4. Confirm the named cron job is active. After a minute, inspect `net._http_response` using the commented query in the script. It should return HTTP 200. Check `notification_deliveries` for email/SMS results. No patient needs to have the app open for a reminder to run.

[Vercel Hobby cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) is limited to daily execution, so this setup uses [Supabase Cron with pg_net and Vault](https://supabase.com/docs/guides/functions/schedule-functions) every minute. It does not depend on a paid Vercel minute-by-minute cron.

Reminder times use Asia/Manila. A five-minute catch-up window handles short scheduler delays without sending stale “one hour” alerts. Pending, cancelled, no-show, and completed visits are excluded. Event keys include the appointment's current date/time, allowing an approved reschedule to receive fresh reminders. Unique delivery rows prevent duplicate sends on repeated runs; failed deliveries can retry during the window, and email retries use Resend idempotency keys. Ambiguous SMS requests are kept processing for manual review to avoid charging/sending twice. Recently released prescription alerts are retried by the cron job for 24 hours if issuance was interrupted. An outage longer than the catch-up window can miss a reminder; monitor cron HTTP responses and provider failures.

The setup script has been prepared locally. It must be run against the production Supabase project after deployment; editing the repository alone does not activate a hosted schedule.
