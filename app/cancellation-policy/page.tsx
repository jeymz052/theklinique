import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cancellation Policy | The Klinique",
  description: "Cancellation and rescheduling policy for The Klinique medical aesthetic clinic.",
};

export default function CancellationPolicyPage() {
  return (
    <div className="policy-root">
      <div className="policy-container">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/the_klinique_logo-removebg-preview.png"
          alt="The Klinique"
          className="policy-logo"
        />

        <h1 className="policy-title">Cancellation Policy</h1>
        <p className="policy-updated">Last updated: September 2026</p>

        <div className="policy-body">
          <section className="policy-section">
            <h2>1. Appointment Confirmation</h2>
            <p>
              All appointments at The Klinique are confirmed upon booking. We operate by appointment
              only to ensure each patient receives the time and attention they deserve. Please arrive
              on time for your scheduled appointment.
            </p>
          </section>

          <section className="policy-section">
            <h2>2. Cancellation Notice</h2>
            <p>
              We kindly require at least <strong>24 hours&apos; notice</strong> for any cancellation or
              rescheduling of appointments. This allows us to offer your slot to another patient in
              need of care.
            </p>
            <ul>
              <li>
                <strong>24+ hours notice:</strong> Full cancellation with no penalty. Deposits may
                be carried forward to a rescheduled appointment.
              </li>
              <li>
                <strong>Less than 24 hours notice:</strong> Cancellation fee may apply. Deposits
                may be forfeited.
              </li>
              <li>
                <strong>No-show (no notice):</strong> The appointment deposit is non-refundable.
                A new deposit will be required for future bookings.
              </li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>3. Rescheduling</h2>
            <p>
              Appointments may be rescheduled with at least 24 hours&apos; notice at no additional cost.
              Rescheduling requests made less than 24 hours before the appointment are subject to
              availability and may incur a rescheduling fee.
            </p>
            <p>
              Each confirmed booking may be rescheduled a maximum of <strong>two (2) times</strong>.
              Further rescheduling may require a new booking and deposit.
            </p>
          </section>

          <section className="policy-section">
            <h2>4. Deposits</h2>
            <p>
              Certain treatments or packages require a non-refundable reservation deposit to confirm
              your appointment. Deposit amounts vary by treatment type and will be communicated at
              the time of booking.
            </p>
            <p>
              Deposits are applied toward the cost of your treatment on the day of your appointment.
            </p>
          </section>

          <section className="policy-section">
            <h2>5. Late Arrivals</h2>
            <p>
              Patients who arrive more than <strong>15 minutes late</strong> may have their
              appointment shortened or rescheduled to respect other patients&apos; time. Full service
              fees still apply. Please contact us as soon as possible if you are running late.
            </p>
          </section>

          <section className="policy-section">
            <h2>6. Clinic-Initiated Cancellations</h2>
            <p>
              In the rare event that The Klinique must cancel an appointment, we will notify you as
              early as possible and offer to reschedule at no additional cost or issue a full refund
              of any deposit paid.
            </p>
          </section>

          <section className="policy-section">
            <h2>7. Package & Promo Bookings</h2>
            <p>
              Appointments booked using packages or promotional vouchers are subject to the same
              cancellation policy. Missed sessions from packages due to no-shows are considered
              forfeited and cannot be recovered.
            </p>
          </section>

          <section className="policy-section">
            <h2>8. Refund Policy</h2>
            <p>
              Treatments that have been started or completed are non-refundable. If you are
              dissatisfied with your experience, please contact us within 7 days so we can address
              your concerns appropriately.
            </p>
          </section>

          <section className="policy-section">
            <h2>9. How to Cancel or Reschedule</h2>
            <p>
              To cancel or reschedule your appointment, please contact us through:
            </p>
            <ul>
              <li>
                <strong>Instagram DM:</strong> @thekliniqueph
              </li>
              <li>
                <strong>Facebook:</strong> The Klinique by Dr. Kharyl
              </li>
              <li>
                <strong>Patient Portal:</strong> Log in and manage your booking from your dashboard
              </li>
            </ul>
          </section>

          <section className="policy-section">
            <h2>10. Amendments</h2>
            <p>
              The Klinique reserves the right to modify this Cancellation Policy at any time.
              Changes will be effective immediately upon posting. Please review this policy before
              each booking.
            </p>
          </section>
        </div>

        <div className="policy-footer">
          <Link href="/auth" className="policy-back-btn">Back to Sign In</Link>
          <Link href="/" className="policy-home-btn">Home</Link>
        </div>
      </div>
    </div>
  );
}
