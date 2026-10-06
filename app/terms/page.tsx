import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions | The Klinique",
  description: "Terms and Conditions for The Klinique medical aesthetic clinic in Cagayan de Oro City.",
};

export default function TermsPage() {
  return (
    <div className="policy-root">
      <div className="policy-container">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/the_klinique_logo-removebg-preview.png"
          alt="The Klinique"
          className="policy-logo"
        />

        <h1 className="policy-title">Terms &amp; Conditions</h1>
        <p className="policy-updated">Last updated: September 2026</p>

        <div className="policy-body">
          <section className="policy-section">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing and using The Klinique&apos;s services, booking platform, and patient portal,
              you agree to be bound by these Terms and Conditions. If you do not agree to all the terms,
              please do not use our services.
            </p>
          </section>

          <section className="policy-section">
            <h2>2. Services</h2>
            <p>
              The Klinique is a medical aesthetic clinic offering treatments including but not limited
              to Botox, dermal fillers, skin boosters, laser treatments, facial treatments, IV therapy,
              and other aesthetic services. All services are performed or supervised by licensed
              medical professionals.
            </p>
          </section>

          <section className="policy-section">
            <h2>3. Medical Disclaimer</h2>
            <p>
              All treatments at The Klinique are medical procedures performed by Dr. Kharyl,
              Medical and Aesthetic Doctor. Results may vary between individuals. A thorough
              consultation is required before any treatment. We reserve the right to decline any
              service if deemed medically inappropriate.
            </p>
          </section>

          <section className="policy-section">
            <h2>4. Booking & Appointments</h2>
            <p>
              Appointments are by appointment only. Bookings are confirmed upon receipt of any required
              deposit or confirmation. The Klinique reserves the right to reschedule or cancel
              appointments with reasonable notice. Walk-in consultations are subject to availability.
            </p>
          </section>

          <section className="policy-section">
            <h2>5. Payment Terms</h2>
            <p>
              Payment is due at the time of service unless a deposit arrangement has been made. We
              accept cash, bank transfers, and GCash. Prices are in Philippine Peso (PHP) and subject
              to change without prior notice. Packages and promos are non-transferable and
              non-refundable unless stated otherwise.
            </p>
          </section>

          <section className="policy-section">
            <h2>6. Privacy & Confidentiality</h2>
            <p>
              Patient information, medical records, and treatment history are strictly confidential.
              We comply with applicable Philippine data privacy laws. Your information will not be
              shared with third parties without your consent, except as required by law.
            </p>
          </section>

          <section className="policy-section">
            <h2>7. Patient Responsibilities</h2>
            <p>
              Patients are responsible for providing accurate and complete medical history and
              information. Failure to disclose relevant medical information may affect treatment
              outcomes. Patients must follow pre- and post-treatment care instructions provided by
              our team.
            </p>
          </section>

          <section className="policy-section">
            <h2>8. Intellectual Property</h2>
            <p>
              All content on The Klinique&apos;s website and platforms — including images, text, logos,
              and design — is the property of The Klinique and is protected by Philippine copyright
              law. Reproduction without written permission is prohibited.
            </p>
          </section>

          <section className="policy-section">
            <h2>9. Limitation of Liability</h2>
            <p>
              The Klinique is not liable for any indirect, incidental, or consequential damages
              arising from the use of our services. Our liability is limited to the value of the
              treatment rendered.
            </p>
          </section>

          <section className="policy-section">
            <h2>10. Amendments</h2>
            <p>
              The Klinique reserves the right to update these Terms and Conditions at any time.
              Continued use of our services after any changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section className="policy-section">
            <h2>11. Governing Law</h2>
            <p>
              These Terms and Conditions are governed by the laws of the Republic of the Philippines.
              Any disputes shall be resolved through the appropriate legal channels in Cagayan de Oro
              City, Misamis Oriental.
            </p>
          </section>

          <section className="policy-section">
            <h2>12. Contact</h2>
            <p>
              For questions regarding these Terms and Conditions, please contact us:
            </p>
            <ul>
              <li>Instagram: <strong>@thekliniqueph</strong></li>
              <li>Facebook: <strong>The Klinique by Dr. Kharyl</strong></li>
              <li>Location: Cagayan de Oro City, PH 9000</li>
            </ul>
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
