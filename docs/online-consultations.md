# Online consultations and prescriptions

## Deployment

1. Apply `supabase/migrations/20261024_add_online_consultations_and_prescriptions.sql` after the existing migrations in the Supabase SQL editor or your migration pipeline. It adds the online service, private settings, prescription templates, medical documents, and transactional chart/issuance functions. It uses the existing consultation category and clinic schedule.
2. Configure the server-only `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` for the deployment. Enable QR Ph on the PayMongo account and send `checkout_session.payment.paid` events to `/api/webhooks/paymongo`. Use matching test or live credentials and webhook secrets.
3. In Doctor portal → Clinic Settings → Online consultation, save the reusable Zoom meeting ID, the doctor's signature image, and PRC license number. General settings supply the doctor and clinic identity. The heading, accent, specialty, and footer can be customized.

The migrations have been exercised in an isolated PostgreSQL-compatible database. Apply pending migrations to the target project through your migration pipeline. Payment verification requires PayMongo credentials matching the deployment's test or live mode.

## Workflow

- Booking → Consultation offers Clinic and Online. Online costs **PHP 600 in full**, paid through PayMongo QR Ph. It does not add the PHP 500 clinic reservation fee. Both modes share doctor hours, blocked dates, and occupied slots.
- The doctor's consultation queue filters All / Clinic / Online. Every visit has Patient record and Charting tabs. Clinic charting has Assessment and Finalize steps; the final step retains the procedure/package selector and treatment handoff. Online charting has Assessment, Prescription, and Finalize steps.
- The patient portal's Online Consultation page shows scheduled visits. A confirmed visit enables embedded Zoom joining from 15 minutes before its start until the end of its one-hour slot, using Philippine time. Embedded Zoom opens inside both portals; a desktop call can stay beside charting and mobile uses full-screen client view. Consultations use embedded Zoom only and reuse a room configured once by the doctor. See [embedded Zoom](embedded-zoom.md) for credentials, the additional migration, and activation.
- The prescription builder supports medication details, notes, optional follow-up date, reusable templates, signed preview, and explicit issuance. Issued documents preserve the patient, prescriber, signature, and medication snapshot. Finalization requires an issued prescription or an explicit “No prescription required” choice.
- Released prescriptions appear in the patient's Medical Documents and the doctor's clinic-wide document browser. “Open / save PDF” opens the original document; “Print / Save PDF” uses the browser's print dialog. Choosing a clinic copy keeps it out of the patient's portal.
- The new document library creates prescriptions. Other document type filters are available for future document creation workflows; this change does not add certificate, referral, or lab-request builders or prescription email delivery.

## Verification

`npm test` runs fee, meeting, authorization, checkout, and database tests. `npm run test:e2e -- tests/e2e/consultation.spec.cjs` runs mocked doctor/patient browser workflows against a running local server. Set `PLAYWRIGHT_BASE_URL` when the server is on a port other than 3000. Browser tests use synthetic data and do not submit real bookings or payments.
