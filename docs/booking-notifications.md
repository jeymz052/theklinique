# Booking-specific notifications

In-app titles/bodies, email subjects/headings/service details, and SMS confirmations/reminders identify the booking as Online consultation, Clinic consultation, Procedure, Package booking, or Procedure & package booking. Follow-up consultations are labeled separately. The primary service, extra procedures, and selected package names are included. Package-only names come from the matching booking order, while a package selected after consultation comes from the appointment's product relation.

This applies to newly created bookings, payment confirmations, reminders, status changes, follow-up recommendations, and reschedule messages. Existing generic in-app notices are labeled when fetched, using their related appointment. External email/SMS already sent are not rewritten.

Semaphore sends only two SMS types to patients: **booking confirmation** and the **24-hour appointment reminder**. Payment, staff booking, and manual confirmation share one delivery key so they cannot send separate confirmation texts for the same appointment and phone number. Existing payment-confirmation history is respected. Pending bookings do not send SMS. One-hour reminders, 15-minute online joining alerts, prescription-ready alerts, cancellations, reschedule notices, and follow-up recommendations use in-app/email only.

Exact confirmation template:

> The Klinique: {booking summary}. {reference} is confirmed on {date} at {time} PHT. {instructions}

Exact 24-hour reminder template:

> The Klinique reminder: {booking summary}. {reference} is tomorrow, {date} at {time} PHT. {instructions}

The booking summary contains the booking type and selected service/package names. Dates use `January 4, 2027` and times use `10:00 AM`. Online instructions are `Join Zoom in your patient portal 15 minutes before your appointment.` Clinic instructions are `Please arrive 10 minutes early.` Confirmations do not claim a payment was collected, so the same wording covers clinic-waived bookings.

Email requires `RESEND_API_KEY` and `RESEND_FROM`. SMS requires `SEMAPHORE_API_KEY`; `SEMAPHORE_SENDER_NAME` is optional. Configure these in the environment running the app. Local environment changes require restarting the local server, and do not alter hosted deployment environment variables.

The Jordan Taduran replacement booking is a one-off confirmed test with a waived fee and an explicit `TEST-ONLINE-JORDAN-2027` marker. No PayMongo payment was created or collected. The old-booking cleanup and after-test cleanup are separate scripts under `docs/sql/`; neither is run automatically. Each script checks the exact appointment IDs, patient identity, online mode, and payment history before deletion. Issued-document or linked-visit history stops cleanup for review.

PayMongo's official [QR Ph testing guide](https://docs.paymongo.com/docs/payment-acceptance-testing) describes simulation through `test_url`. A test API key does not make scanning a QR code a simulated action. Use the documented simulator when testing actual payments.
