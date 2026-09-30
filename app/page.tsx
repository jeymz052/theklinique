"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import BookingForm from "@/app/components/BookingForm";
import LandingContactForm from "@/app/components/LandingContactForm";

type LandingPackage = { id: string; name: string; description: string | null; price: number; category: string };

const FAQS = [
  { question: "Do I need a consultation before treatment?", answer: "Some medical aesthetic procedures require an in-clinic assessment first. Dr. Kharyl will review your goals, medical history, suitability, expected results, and alternatives before proceeding." },
  { question: "How do I reserve an appointment?", answer: "Choose a consultation or one or more treatments, select an available one-hour slot, then pay the PHP 500 reservation fee through PayMongo QR Ph. The fee is credited toward your clinic bill." },
  { question: "Can I book several treatments in one visit?", answer: "Yes. For medical-treatment bookings, you can add multiple eligible procedures to your appointment cart. Final eligibility and sequencing are confirmed by the doctor at the clinic." },
  { question: "What happens to the consent form?", answer: "The online checkbox only acknowledges your intent to proceed. Your formal informed-consent form will still be reviewed and signed in person before treatment." },
  { question: "Can I reschedule or cancel?", answer: "Please notify the clinic at least 24 hours before your appointment. Late cancellations, no-shows, and reservation-fee handling follow The Klinique cancellation policy." },
  { question: "Will I receive aftercare instructions?", answer: "Yes. Treatment-specific aftercare is discussed and provided at the clinic. Your booking review also shows a general preview so you know what to expect." },
];

export default function Home() {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);
  const [landingPackages, setLandingPackages] = useState<LandingPackage[]>([]);

  useEffect(() => {
    const updateViewport = () => {
      const width = window.visualViewport?.width ?? window.innerWidth;
      // Some mobile preview shells expose a tablet-sized layout viewport while
      // scaling it into a phone frame. screen.width reflects the actual device.
      setCompactViewport(width <= 640 || window.screen.width <= 640);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    fetch("/api/booking-catalog")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((catalog) => {
        setLandingPackages(catalog.products || []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".landing-page");
    if (!root) return;
    root.classList.add("reveal-enabled");

    const selectors = [
      ".services-bar .service-icon-item",
      ".about-image", ".about-content > *",
      ".services-section .section-header", ".services-section .service-card", ".landing-packages-block",
      ".quote-banner > *", ".contact-strip > *",
      ".landing-faq-intro", ".landing-faq-list details",
      ".landing-contact-details > *", ".landing-contact-form",
      ".landing-location-head > *", ".landing-map-frame",
      ".footer-inner > *", ".footer-contact-row", ".footer-bottom",
    ];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observed = new WeakSet<Element>();
    const observer = reducedMotion || !("IntersectionObserver" in window) ? null : new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer?.unobserve(entry.target);
      });
    }, { threshold: window.innerWidth <= 640 ? 0.08 : 0.14, rootMargin: window.innerWidth <= 640 ? "0px 0px -24px" : "0px 0px -55px" });

    const register = () => {
      selectors.forEach((selector) => {
        root.querySelectorAll<HTMLElement>(selector).forEach((element, index) => {
          if (observed.has(element)) return;
          observed.add(element);
          element.classList.add("scroll-reveal");
          element.style.setProperty("--reveal-delay", `${Math.min(index * 55, 275)}ms`);
          if (reducedMotion || !observer) element.classList.add("is-revealed");
          else observer.observe(element);
        });
      });
    };
    register();
    const mutationObserver = new MutationObserver(register);
    mutationObserver.observe(root, { childList: true, subtree: true });
    return () => {
      observer?.disconnect();
      mutationObserver.disconnect();
      root.classList.remove("reveal-enabled");
    };
  }, []);

  return (
    <div className={`landing-page ${compactViewport ? "landing-page--compact" : ""}`}>
      {/* ── BOOKING MODAL ── */}
      {bookingOpen && (
        <div
          className="bk-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Book an Appointment"
          onClick={(e) => e.target === e.currentTarget && setBookingOpen(false)}
        >
          <div className="bk-modal-sheet">
            <BookingForm isModal onClose={() => setBookingOpen(false)} />
          </div>
        </div>
      )}

      {/* ── NAVBAR ── */}
      <nav className="navbar">
        <div className="nav-left">
          <Link href="/" className="nav-logo" aria-label="The Klinique Home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/the_klinique_logo-removebg-preview.png"
              alt="The Klinique Logo"
              className="nav-logo-img"
            />
          </Link>

          <ul className={`nav-links ${menuOpen ? "is-open" : ""}`}>
            <li><a href="#home" className="active" onClick={() => setMenuOpen(false)}>Home</a></li>
            <li><a href="#about" onClick={() => setMenuOpen(false)}>About</a></li>
            <li><a href="#services" onClick={() => setMenuOpen(false)}>Services</a></li>
            <li><a href="#gallery" onClick={() => setMenuOpen(false)}>Gallery</a></li>
            <li><a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a></li>
            <li><a href="#contact" onClick={() => setMenuOpen(false)}>Contact</a></li>
          </ul>
        </div>

        <div className="nav-actions">
          <Link
            href="/auth"
            className="btn-book"
            id="nav-signin-btn"
            aria-label="Sign in"
            style={{ background: "transparent", border: "1.5px solid rgba(201,123,123,0.4)", color: "var(--rose-dark)" }}
          >
            <i className="fa-regular fa-user" style={{ marginRight: "0.4rem" }} />
            <span className="nav-action-label">Sign In</span>
          </Link>
          <button
            type="button"
            className="btn-book"
            id="nav-book-btn"
            onClick={() => setBookingOpen(true)}
          >
            <i className="fa-solid fa-calendar-plus" style={{ marginRight: "0.4rem" }} />
            <span className="nav-action-label">Book Now</span>
          </button>
          <button
            type="button"
            className="nav-menu-toggle"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i className={`fa-solid ${menuOpen ? "fa-xmark" : "fa-bars"}`} />
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero" id="home" style={{ paddingTop: "88px" }}>
        <div className="hero-bg">
          <Image
            src="/images/herobg.png"
            alt="The Klinique — Your unique beauty in mind"
            fill
            style={{ objectFit: "cover", objectPosition: "center right" }}
            priority
            quality={90}
          />
        </div>
        <div className="hero-overlay" />

        <div className="hero-content">
          <p className="hero-tag">
            <span />
            Skin · Aesthetics · Wellness
          </p>

          <h1>
            Your <em>Unique</em><br />
            Beauty in Mind.
          </h1>

          <p className="hero-sub">Expert care. Natural results. A more confident you.</p>
          <p className="hero-desc">
            At The Klinique, we combine medical expertise with a personalized approach
            to help you look and feel your best — inside and out.
          </p>

          <button
            type="button"
            className="btn-primary"
            id="hero-book-btn"
            onClick={() => setBookingOpen(true)}
          >
            <i className="fa-solid fa-calendar-plus" />
            Book Your Consultation
          </button>

          <p className="hero-marquee">Look Good · Feel Good · Be You</p>
        </div>
      </section>

      {/* ── SERVICES ICON BAR ── */}
      <section className="services-bar">
        <div className="services-bar-inner">
          {[
            { src: "/images/botox-removebg-preview.png",          alt: "Botox",          name: "Botox &\nNeuromodulators" },
            { src: "/images/fillers-removebg-preview.png",        alt: "Fillers",        name: "Fillers" },
            { src: "/images/skinboosters-removebg-preview.png",   alt: "Skin Boosters",  name: "Skin Boosters" },
            { src: "/images/lasers-removebg-preview.png",         alt: "Lasers",         name: "Lasers &\nSkin Rejuvenation" },
            { src: "/images/facialandskin-removebg-preview.png",  alt: "Facial & Skin",  name: "Facial & Skin\nTreatments" },
            { src: "/images/IV_teraphy-removebg-preview.png",     alt: "IV Therapy",     name: "IV Therapy\n& Wellness" },
            { src: "/images/otherservices-removebg-preview.png",  alt: "Other Services", name: "Other\nServices" },
          ].map((s) => (
            <button
              key={s.alt}
              type="button"
              className="service-icon-item"
              onClick={() => setBookingOpen(true)}
              style={{ cursor: "pointer", background: "none", border: "none", padding: 0 }}
            >
              <div className="service-icon-circle">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt={s.alt} className="service-icon-img" />
              </div>
              <span className="service-icon-name">{s.name.replace(/\n/g, "\u00A0")}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── ABOUT / INTERIOR ── */}
      <section className="about-section" id="about">
        <div className="about-image">
          <Image
            src="/images/the klinique interior.jpg"
            alt="The Klinique interior — warm, luxurious medical aesthetic clinic"
            fill
            style={{ objectFit: "cover", objectPosition: "left center" }}
            quality={88}
            sizes="(max-width: 900px) 100vw, 50vw"
          />
          <div className="about-image-overlay" />
          <p className="about-image-text">Your unique beauty in mind.</p>
        </div>

        <div
          className="about-content"
          style={{
            backgroundImage: "url('/images/a personalized approach bg.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <p className="section-label">A Personalized Approach</p>
          <h2>
            Where Science<br />
            Meets Self-Care
          </h2>
          <p>
            We believe true beauty is unique to you. Our treatments are doctor-led,
            evidence-based, and tailored to your goals — for natural, refined results
            that enhance, not change, who you are.
          </p>

          <div className="about-pillars">
            {[
              { src: "/images/safeanddoctorled-removebg-preview.png",        alt: "Safe & Doctor-Led",     label: "Safe &\nDoctor-Led" },
              { src: "/images/premiumtechnology-removebg-preview.png",       alt: "Premium Technology",    label: "Premium\nTechnology" },
              { src: "/images/naturalrefinedresults-removebg-preview.png",   alt: "Natural Results",       label: "Natural,\nRefined Results" },
              { src: "/images/personalizedcare-removebg-preview.png",        alt: "Personalized Care",     label: "Personalized\nCare" },
            ].map((p) => (
              <div key={p.alt} className="pillar-item">
                <div className="pillar-icon pillar-icon-img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={p.alt} />
                </div>
                <span className="pillar-text">{p.label.replace(/\n/, "\u00A0")}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn-outline"
            id="about-book-btn"
            onClick={() => setBookingOpen(true)}
          >
            <i className="fa-solid fa-calendar-plus" />
            Book a Consultation
          </button>
        </div>
      </section>

      {/* ── SIGNATURE SERVICES ── */}
      <section className="services-section" id="services">
        <div className="section-header">
          <div className="section-header-left"><p className="section-label">Our Signature Services</p><h2>What We Do Best</h2></div>
          <button type="button" className="view-all" id="view-all-services-btn" onClick={() => setBookingOpen(true)}>Book a Service →</button>
        </div>
        <div className="services-grid">
          {[
            { src: "/images/botox.png", alt: "Botox treatment", name: "Botox", tagline: "Smoother. Fresher. More You.", id: "botox-card-btn" },
            { src: "/images/fillers.png", alt: "Dermal fillers", name: "Fillers", tagline: "Enhance Your Natural Beauty.", id: "fillers-card-btn" },
            { src: "/images/skin boosters.png", alt: "Skin boosters", name: "Skin Boosters", tagline: "Deep Hydration. Lasting Glow.", id: "skin-boosters-card-btn" },
            { src: "/images/lasers.png", alt: "Laser skin treatments", name: "Lasers", tagline: "Clearer Skin. Brighter You.", id: "lasers-card-btn" },
          ].map((service) => <div key={service.id} className="service-card"><Image className="service-card-img" src={service.src} alt={service.alt} width={400} height={533} style={{ width: "100%", height: "auto", aspectRatio: "3/4", objectFit: "cover" }} quality={85} /><div className="service-card-overlay" /><div className="service-card-content"><p className="service-card-name">{service.name}</p><p className="service-card-tagline">{service.tagline}</p><button type="button" className="service-card-btn" id={service.id} onClick={() => setBookingOpen(true)} aria-label={`Book ${service.name}`}>→</button></div></div>)}
        </div>
        <div className="landing-packages-block"><div className="landing-packages-copy"><p className="section-label">Clinic Packages</p><h3>Plans for consistent care</h3><p>Ask the clinic about package eligibility, inclusions, and scheduling.</p><button type="button" onClick={() => setBookingOpen(true)}>Book with a package <i className="fa-solid fa-arrow-right" /></button></div><div className="landing-package-list">{(landingPackages.length ? landingPackages.slice(0, 6) : [{ id: "underarms", name: "Underarms", description: "Unlimited diode laser hair removal for one year.", price: 12000, category: "Laser Hair Removal" }, { id: "lip", name: "Upper / Lower Lip", description: "Unlimited diode laser hair removal for one year.", price: 10000, category: "Laser Hair Removal" }, { id: "bikini", name: "Bikini Lines", description: "Unlimited diode laser hair removal for one year.", price: 12000, category: "Laser Hair Removal" }]).map((item) => <article key={item.id}><span><i className="fa-solid fa-box-open" /></span><div><small>{item.category}</small><h4>{item.name}</h4><p>{item.description}</p></div><strong>PHP {Number(item.price).toLocaleString()}</strong></article>)}</div></div>
      </section>

      {/* ── GALLERY ── */}
      <section className="quote-banner" id="gallery" style={{ backgroundImage: "url('/images/banner background.png')", backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="quote-banner-text-group"><p className="quote-text">&ldquo;Healthy skin is a form of self-care.&rdquo;</p><p className="quote-sub">Confidence · Wellness · A Brighter You</p></div>
        <button type="button" className="btn-book quote-book-btn" id="quote-book-btn" onClick={() => setBookingOpen(true)}><i className="fa-solid fa-calendar-plus" /> Book Now</button>
      </section>

      <div className="contact-strip">
        <div className="contact-item"><i className="fa-solid fa-location-dot" /><span>Cagayan de Oro City, PH 9000</span></div>
        <div className="contact-item"><i className="fa-regular fa-clock" /><span>By Appointment Only</span></div>
        <a href="https://www.instagram.com/thekliniqueph?igsh=MXQwcTRubjJ1MWd3&utm_source=qr&fbclid=IwY2xjawUm8flleHRuA2FlbQIxMABwZG9mBWJyaWQRMVd1ekpOMUpNQkJnVGMyeExzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEeabqHRNs5LxfdN_ea_rT-vNkzsb9-p2qlISX0fB-bQB4J2kXiqqNnl0sr47U_aem_1VdrPw10C7rUT1kHJ5sMAg" target="_blank" rel="noopener noreferrer" className="contact-item"><i className="fa-brands fa-instagram" /><span>@thekliniqueph · The Klinique by Dr. Khuryl</span></a>
        <a href="https://web.facebook.com/profile.php?id=61592051454777" target="_blank" rel="noopener noreferrer" className="contact-item"><i className="fa-brands fa-facebook-f" /><span>The Klinique by Dr. Khuryl</span></a>
      </div>

      {/* ── FAQ ── */}
      <section className="landing-faq" id="faq">
        <div className="landing-faq-inner"><div className="landing-faq-intro"><p className="section-label">Frequently Asked Questions</p><h2>Helpful answers before your visit</h2><p>Still unsure which treatment fits your goals? Start with a consultation and let the doctor guide your plan.</p><button type="button" onClick={() => setBookingOpen(true)}><i className="fa-solid fa-calendar-plus" /> Book a consultation</button></div>
        <div className="landing-faq-list">{FAQS.map((item, index) => <details key={item.question} open={index === 0}><summary><span>{String(index + 1).padStart(2, "0")}</span>{item.question}<i className="fa-solid fa-plus" /></summary><p>{item.answer}</p></details>)}</div></div>
      </section>

      {/* ── CONTACT ── */}
      <section className="landing-contact" id="contact">
        <div className="landing-contact-inner"><div className="landing-contact-details">
          <p className="section-label">Contact The Klinique</p><h2>Let’s talk about your goals</h2><p>Send a message for treatment questions, package inquiries, or help with an existing appointment.</p>
          <div className="landing-contact-list">
            <a href="tel:+639560031916"><span><i className="fa-solid fa-phone" /></span><div><small>Call or text</small><strong>+63 956 003 1916</strong></div><i className="fa-solid fa-arrow-up-right-from-square" /></a>
            <a href="mailto:thekliniqueinfo@gmail.com"><span><i className="fa-solid fa-envelope" /></span><div><small>Email</small><strong>thekliniqueinfo@gmail.com</strong></div><i className="fa-solid fa-arrow-up-right-from-square" /></a>
            <div><span><i className="fa-solid fa-location-dot" /></span><div><small>Clinic</small><strong>Cagayan de Oro City, PH 9000</strong></div></div>
            <div><span><i className="fa-regular fa-clock" /></span><div><small>Clinic hours</small><strong>By appointment only</strong></div></div>
          </div>
          <div className="landing-socials"><a href="https://www.instagram.com/thekliniqueph?igsh=MXQwcTRubjJ1MWd3&utm_source=qr&fbclid=IwY2xjawUm8flleHRuA2FlbQIxMABwZG9mBWJyaWQRMVd1ekpOMUpNQkJnVGMyeExzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEeabqHRNs5LxfdN_ea_rT-vNkzsb9-p2qlISX0fB-bQB4J2kXiqqNnl0sr47U_aem_1VdrPw10C7rUT1kHJ5sMAg" target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-instagram" /> Instagram</a><a href="https://web.facebook.com/profile.php?id=61592051454777" target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-facebook-f" /> Facebook</a></div>
        </div>
        <LandingContactForm /></div>
      </section>

      {/* ── LOCATION ── */}
      <section className="landing-location" aria-labelledby="location-heading">
        <div className="landing-location-head"><div><p className="section-label">Visit The Klinique</p><h2 id="location-heading">The Klinique Medical and Aesthetic Clinic</h2><p><i className="fa-solid fa-location-dot" /> Cagayan de Oro City, Misamis Oriental 9000, Philippines</p></div><a href="https://www.google.com/maps/search/?api=1&query=The+Klinique+Medical+and+Aesthetic+Clinic+Cagayan+de+Oro" target="_blank" rel="noopener noreferrer">Get directions <i className="fa-solid fa-arrow-right" /></a></div>
        <div className="landing-map-frame"><iframe title="Google Map showing The Klinique in Cagayan de Oro" src="https://www.google.com/maps?q=The%20Klinique%20Medical%20and%20Aesthetic%20Clinic%20Cagayan%20de%20Oro&output=embed" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer-info footer-info--extended">
        <div className="footer-inner">
          <div className="footer-logo"><Image src="/images/the_klinique_logo-removebg-preview.png" alt="The Klinique" width={220} height={110} style={{ height: "110px", width: "auto" }} /></div>
          <div className="footer-divider" aria-hidden="true" />
          <nav className="footer-nav" aria-label="Footer navigation"><a href="#home">Home</a><span className="footer-nav-sep">|</span><a href="#about">About</a><span className="footer-nav-sep">|</span><a href="#services">Services</a><span className="footer-nav-sep">|</span><a href="#gallery">Gallery</a><span className="footer-nav-sep">|</span><a href="#faq">FAQ</a><span className="footer-nav-sep">|</span><a href="#contact">Contact</a></nav>
          <div className="footer-divider" aria-hidden="true" />
          <div className="footer-newsletter"><p className="footer-newsletter-label">Be part of our community</p><form className="newsletter-form" id="newsletter-form" onSubmit={(event) => event.preventDefault()}><input type="email" placeholder="Your email address" aria-label="Email address for newsletter" id="newsletter-email" /><button type="submit" aria-label="Subscribe">→</button></form><p className="footer-script-tagline">Your unique beauty in mind.</p></div>
        </div>
        <div className="footer-contact-row"><a href="tel:+639560031916"><i className="fa-solid fa-phone" /> +63 956 003 1916</a><a href="mailto:thekliniqueinfo@gmail.com"><i className="fa-solid fa-envelope" /> thekliniqueinfo@gmail.com</a><span><i className="fa-solid fa-location-dot" /> Cagayan de Oro City</span><a href="https://www.instagram.com/thekliniqueph?igsh=MXQwcTRubjJ1MWd3&utm_source=qr" target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-instagram" /> @thekliniqueph</a><a href="https://web.facebook.com/profile.php?id=61592051454777" target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-facebook-f" /> Facebook</a></div>
        <div className="footer-bottom"><div className="footer-bottom-left"><span>© 2026 The Klinique. All rights reserved.</span><span className="footer-nav-sep">|</span><Link href="/terms">Terms &amp; Conditions</Link><span className="footer-nav-sep">|</span><Link href="/cancellation-policy">Cancellation Policy</Link><span className="footer-nav-sep">|</span><Link href="/auth">Patient Portal</Link></div></div>
      </footer>
    </div>
  );
}
