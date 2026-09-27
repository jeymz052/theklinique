"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import BookingForm from "@/app/components/BookingForm";

export default function Home() {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);

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
            src="/images/the klinique interior.png"
            alt="The Klinique interior — warm, luxurious medical aesthetic clinic"
            fill
            style={{ objectFit: "cover" }}
            quality={88}
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
          <div className="section-header-left">
            <p className="section-label">Our Signature Services</p>
            <h2>What We Do Best</h2>
          </div>
          <button
            type="button"
            className="view-all"
            id="view-all-services-btn"
            onClick={() => setBookingOpen(true)}
          >
            Book a Service →
          </button>
        </div>

        <div className="services-grid">
          {[
            { src: "/images/botox.png",         alt: "Botox treatment",         name: "Botox",         tagline: "Smoother. Fresher. More You.",     id: "botox-card-btn"         },
            { src: "/images/fillers.png",        alt: "Dermal fillers",          name: "Fillers",       tagline: "Enhance Your Natural Beauty.",     id: "fillers-card-btn"       },
            { src: "/images/skin boosters.png",  alt: "Skin boosters",           name: "Skin Boosters", tagline: "Deep Hydration. Lasting Glow.",    id: "skin-boosters-card-btn" },
            { src: "/images/lasers.png",         alt: "Laser skin treatments",   name: "Lasers",        tagline: "Clearer Skin. Brighter You.",      id: "lasers-card-btn"        },
          ].map((s) => (
            <div key={s.id} className="service-card">
              <Image
                className="service-card-img"
                src={s.src}
                alt={s.alt}
                width={400}
                height={533}
                style={{ width: "100%", height: "auto", aspectRatio: "3/4", objectFit: "cover" }}
                quality={85}
              />
              <div className="service-card-overlay" />
              <div className="service-card-content">
                <p className="service-card-name">{s.name}</p>
                <p className="service-card-tagline">{s.tagline}</p>
                <button
                  type="button"
                  className="service-card-btn"
                  id={s.id}
                  onClick={() => setBookingOpen(true)}
                  aria-label={`Book ${s.name}`}
                >
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── QUOTE BANNER ── */}
      <section
        className="quote-banner"
        id="gallery"
        style={{
          backgroundImage: "url('/images/banner background.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="quote-banner-text-group">
          <p className="quote-text">&ldquo;Healthy skin is a form of self-care.&rdquo;</p>
          <p className="quote-sub">Confidence · Wellness · A Brighter You</p>
        </div>
        <button
          type="button"
          className="btn-book quote-book-btn"
          id="quote-book-btn"
          onClick={() => setBookingOpen(true)}
        >
          <i className="fa-solid fa-calendar-plus" />
          Book Now
        </button>
      </section>

      {/* ── CONTACT STRIP ── */}
      <div className="contact-strip" id="contact">
        <div className="contact-item">
          <i className="fa-solid fa-location-dot" />
          <span>Cagayan de Oro City, PH 9000</span>
        </div>
        <div className="contact-item">
          <i className="fa-regular fa-clock" />
          <span>By Appointment Only</span>
        </div>
        <a
          href="https://www.instagram.com/thekliniqueph"
          target="_blank"
          rel="noopener noreferrer"
          className="contact-item"
          style={{ textDecoration: "none", color: "inherit" }}
          id="instagram-link"
        >
          <i className="fa-brands fa-instagram" />
          <span>@thekliniqueph · The Klinique by Dr. Khuryl</span>
        </a>
        <a
          href="https://www.facebook.com/thekliniqueph"
          target="_blank"
          rel="noopener noreferrer"
          className="contact-item"
          style={{ textDecoration: "none", color: "inherit" }}
          id="facebook-link"
        >
          <i className="fa-brands fa-facebook-f" />
          <span>The Klinique by Dr. Khuryl</span>
        </a>
      </div>

      {/* ── FOOTER ── */}
      <footer className="footer-info" id="faq">
        <div className="footer-inner">
          <div className="footer-logo">
            <Image
              src="/images/the_klinique_logo-removebg-preview.png"
              alt="The Klinique"
              width={220}
              height={110}
              style={{ height: "110px", width: "auto" }}
            />
          </div>

          <div className="footer-divider" aria-hidden="true" />

          <nav className="footer-nav" aria-label="Footer navigation">
            <a href="#home">Home</a>
            <span className="footer-nav-sep" aria-hidden="true">|</span>
            <a href="#about">About</a>
            <span className="footer-nav-sep" aria-hidden="true">|</span>
            <a href="#services">Services</a>
            <span className="footer-nav-sep" aria-hidden="true">|</span>
            <a href="#gallery">Gallery</a>
            <span className="footer-nav-sep" aria-hidden="true">|</span>
            <a href="#faq">FAQ</a>
            <span className="footer-nav-sep" aria-hidden="true">|</span>
            <a href="#contact">Contact</a>
          </nav>

          <div className="footer-divider" aria-hidden="true" />

          <div className="footer-newsletter">
            <p className="footer-newsletter-label">Be part of our community</p>
            <form className="newsletter-form" id="newsletter-form">
              <input
                type="email"
                placeholder="Your email address"
                aria-label="Email address for newsletter"
                id="newsletter-email"
              />
              <button type="submit" aria-label="Subscribe">→</button>
            </form>
            <p className="footer-script-tagline">Your unique beauty in mind.</p>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-bottom-left">
            <span>© 2026 The Klinique. All rights reserved.</span>
            <span className="footer-nav-sep" aria-hidden="true">|</span>
            <Link href="/terms">Terms &amp; Conditions</Link>
            <span className="footer-nav-sep" aria-hidden="true">|</span>
            <Link href="/cancellation-policy">Cancellation Policy</Link>
            <span className="footer-nav-sep" aria-hidden="true">|</span>
            <Link href="/auth">Patient Portal</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
