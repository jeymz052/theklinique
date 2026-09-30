"use client";

import Link from "next/link";

export default function AccountHelpHub({ profileHref = "/dashboard/profile", settingsHref = "/dashboard/settings" }: { profileHref?: string; settingsHref?: string }) {
  return <div className="ps-workspace">
    <section className="ps-hero"><div><p className="dk-welcome-label">Account &amp; support</p><h1>How can we help?</h1><p>Manage your account or get help from The Klinique team.</p></div><i className="fa-solid fa-life-ring" /></section>
    <div className="account-hub-grid">
      <Link href={profileHref}><span><i className="fa-regular fa-user" /></span><div><small>PERSONAL INFORMATION</small><h2>Profile</h2><p>Update your contact, booking, and medical details.</p></div><i className="fa-solid fa-arrow-right" /></Link>
      <Link href={settingsHref}><span><i className="fa-solid fa-lock" /></span><div><small>LOGIN &amp; SECURITY</small><h2>Settings</h2><p>Change your password and review account security.</p></div><i className="fa-solid fa-arrow-right" /></Link>
    </div>
    <div className="account-help-layout"><section className="account-help-contact"><header><span><i className="fa-solid fa-headset" /></span><div><small>CLINIC SUPPORT</small><h2>Talk to our team</h2></div></header><p>For booking, payment, or account concerns, contact us during clinic hours.</p><a href="tel:+639560031916"><i className="fa-solid fa-phone" /><span><small>Call or text</small><strong>+63 956 003 1916</strong></span></a><a href="mailto:thekliniqueinfo@gmail.com"><i className="fa-solid fa-envelope" /><span><small>Email</small><strong>thekliniqueinfo@gmail.com</strong></span></a></section><section className="ps-faq"><h2>Common questions</h2><details><summary>How do I reschedule?</summary><p>Open My Appointments, choose an upcoming confirmed visit, and submit a new available date and time.</p></details><details><summary>My payment is not showing.</summary><p>Open Online Payments and select Verify. Contact the clinic with your reference number if it remains pending.</p></details><details><summary>Can I cancel online?</summary><p>Eligible upcoming appointments can be cancelled from My Appointments. Cancellation policy conditions still apply.</p></details><div><Link href="/terms">Terms &amp; Conditions</Link><Link href="/cancellation-policy">Cancellation Policy</Link></div></section></div>
  </div>;
}
