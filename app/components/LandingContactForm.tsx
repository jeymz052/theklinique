"use client";

import { FormEvent, useState } from "react";
import emailjs from "@emailjs/browser";

export default function LandingContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
    const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
    if (!serviceId || !templateId || !publicKey) {
      setStatus("error");
      setMessage("Online messaging is being configured. Please email thekliniqueinfo@gmail.com or call +63 956 003 1916.");
      return;
    }

    setStatus("sending");
    setMessage("");
    try {
      await emailjs.sendForm(serviceId, templateId, form, { publicKey });
      form.reset();
      setStatus("sent");
      setMessage("Thank you. Your message was sent to The Klinique.");
    } catch {
      setStatus("error");
      setMessage("We couldn’t send your message. Please try again or contact the clinic directly.");
    }
  }

  return (
    <form className="landing-contact-form" onSubmit={submitContact}>
      <div className="landing-contact-form-head"><p>Send an inquiry</p><span>We usually respond during clinic hours.</span></div>
      <div className="landing-contact-form-grid">
        <label><span>Full name</span><input name="from_name" type="text" placeholder="Your name" autoComplete="name" required /></label>
        <label><span>Email address</span><input name="reply_to" type="email" placeholder="you@example.com" autoComplete="email" required /></label>
        <label><span>Contact number</span><input name="phone" type="tel" placeholder="+63 9XX XXX XXXX" autoComplete="tel" required /></label>
        <label><span>Inquiry type</span><select name="inquiry_type" defaultValue=""><option value="" disabled>Select a topic</option><option>Consultation</option><option>Treatment</option><option>Package</option><option>Existing appointment</option><option>General inquiry</option></select></label>
        <label className="landing-contact-form-full"><span>How can we help?</span><textarea name="message" rows={5} placeholder="Tell us about your concern or the service you’re interested in." required /></label>
      </div>
      <input type="hidden" name="to_email" value="thekliniqueinfo@gmail.com" />
      {message && <p className={`landing-contact-feedback ${status}`} role={status === "error" ? "alert" : "status"}><i className={`fa-solid ${status === "sent" ? "fa-circle-check" : "fa-circle-exclamation"}`} /> {message}</p>}
      <button type="submit" disabled={status === "sending"}><i className={`fa-solid ${status === "sending" ? "fa-spinner fa-spin" : "fa-paper-plane"}`} />{status === "sending" ? "Sending…" : "Send message"}</button>
    </form>
  );
}
