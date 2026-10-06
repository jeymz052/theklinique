"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import BookingForm from "@/app/components/BookingForm";
import LandingContactForm from "@/app/components/LandingContactForm";
import { DEFAULT_NAVIGATION_ORDER, DEFAULT_SERVICE_ICONS, type ContentTab, type LandingContent, type LandingMedia } from "@/app/components/WebsiteContentManager";
import { FEATURED_FACEBOOK_REEL, getInstagramEmbedUrl, isEmbeddableFacebookPost, isFacebookVideo, normalizeFacebookPostUrl } from "@/lib/landing-social";
import type { BlogPost } from "@/lib/blog";

type LandingPackage = { id: string; name: string; description: string | null; price: number; category: string };
type LandingCategory = { id: string; name: string; slug: string };

const FAQS = [
  { question: "Do I need a consultation before treatment?", answer: "Some medical aesthetic procedures require an in-clinic assessment first. Dr. Kharyl will review your goals, medical history, suitability, expected results, and alternatives before proceeding." },
  { question: "How do I reserve an appointment?", answer: "Choose a consultation or one or more treatments, select an available one-hour slot, then pay the PHP 500 reservation fee through PayMongo QR Ph. The fee is credited toward your clinic bill." },
  { question: "Can I book several treatments in one visit?", answer: "Yes. For medical-treatment bookings, you can add multiple eligible procedures to your appointment cart. Final eligibility and sequencing are confirmed by the doctor at the clinic." },
  { question: "What happens to the consent form?", answer: "The online checkbox only acknowledges your intent to proceed. Your formal informed-consent form will still be reviewed and signed in person before treatment." },
  { question: "Can I reschedule or cancel?", answer: "Please notify the clinic at least 24 hours before your appointment. Late cancellations, no-shows, and reservation-fee handling follow The Klinique cancellation policy." },
  { question: "Will I receive aftercare instructions?", answer: "Yes. Treatment-specific aftercare is discussed and provided at the clinic. Your booking review also shows a general preview so you know what to expect." },
];
const LANDING_NAV:Record<ContentTab,{label:string;href:string;icon:string}>={home:{label:"Home",href:"#home",icon:"fa-house"},about:{label:"About",href:"#about",icon:"fa-spa"},services:{label:"Services",href:"#services",icon:"fa-syringe"},doctor:{label:"Doctor",href:"#doctor",icon:"fa-user-doctor"},social:{label:"Socials",href:"#socials",icon:"fa-heart"},gallery:{label:"Gallery",href:"#gallery",icon:"fa-images"},faq:{label:"FAQ",href:"#faq",icon:"fa-circle-question"},contact:{label:"Contact",href:"#contact",icon:"fa-envelope"}};

export default function Home() {
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingCategoryHint, setBookingCategoryHint] = useState<string | null>(null);
  const [bookingServiceSlug, setBookingServiceSlug] = useState<string | null>(null);
  const [bookingCatalogView, setBookingCatalogView] = useState<"treatments" | "packages">("treatments");
  const [menuOpen, setMenuOpen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);
  const [landingPackages, setLandingPackages] = useState<LandingPackage[]>([]);
  const [landingCategories, setLandingCategories] = useState<LandingCategory[]>([]);
  const [content, setContent] = useState<LandingContent | null>(null);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [showAllServices, setShowAllServices] = useState(false);
  const [heroSlide, setHeroSlide] = useState(0);
  const heroMedia = content?.heroMedia || [];
  const activeHeroSlide = heroMedia.length ? heroSlide % heroMedia.length : 0;
  const openBooking = (categoryHint: string | null = null) => {
    setBookingCatalogView("treatments");
    setBookingServiceSlug(null);
    setBookingCategoryHint(categoryHint);
    setBookingOpen(true);
  };
  const openPackageBooking = () => {
    setBookingCatalogView("packages");
    setBookingServiceSlug(null);
    setBookingCategoryHint(null);
    setBookingOpen(true);
  };

  useEffect(() => {
    const query=new URLSearchParams(window.location.search),service=query.get("treatment"),shouldOpen=query.get("book")==="1";
    if(shouldOpen)queueMicrotask(()=>{setBookingServiceSlug(service);setBookingCategoryHint(query.get("category"));setBookingOpen(true);});
    void fetch("/api/blog-posts").then(response=>response.ok?response.json():{posts:[]}).then(result=>setBlogPosts(result.posts||[]));
  }, []);

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
        setLandingCategories(catalog.categories || []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => { fetch("/api/landing-content").then(async response => { const result = await response.json(); if (response.ok) setContent(result.content); }).catch(() => undefined); }, []);
  useEffect(() => {
    if (heroMedia.length < 2) return;
    const timer = window.setTimeout(() => setHeroSlide((current) => (current + 1) % heroMedia.length), 5000);
    return () => window.clearTimeout(timer);
  }, [heroSlide, heroMedia.length]);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".landing-page");
    if (!root) return;
    root.classList.add("reveal-enabled");

    const selectors = [
      ".services-bar .service-icon-item",
      ".about-image", ".about-content > *",
      ".landing-doctor-copy > *", ".landing-doctor-photo",
      ".services-section .section-header", ".services-section .service-card", ".landing-packages-block",
      ".landing-media-gallery > header > *", ".landing-results-viewport", ".landing-results-note",
      ".quote-banner > *", ".contact-strip > *",
      ".landing-blog > header > *", ".landing-blog > div > a", ".landing-blog-empty",
      ".landing-social-copy > *", ".landing-social-posts > article",
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

  const navigationOrder=(content?.navigationOrder||DEFAULT_NAVIGATION_ORDER).filter(key=>LANDING_NAV[key]),primaryNavigation=navigationOrder.slice(0,4),moreNavigation=navigationOrder.slice(4);
  const sectionOrder=(key:ContentTab,offset=0)=>100+navigationOrder.indexOf(key)*10+offset;
  const landingPackageTypes = Array.from(landingPackages.reduce((groups, item) => {
    const key = item.category.trim();
    const current = groups.get(key);
    groups.set(key, current ? { ...current, count: current.count + 1, fromPrice: Math.min(current.fromPrice, Number(item.price)) } : { category: key, count: 1, fromPrice: Number(item.price) });
    return groups;
  }, new Map<string, { category: string; count: number; fromPrice: number }>()).values());
  return (
    <div className={`landing-page ${compactViewport ? "landing-page--compact" : ""}`}>
      {/* ── BOOKING MODAL ── */}
      {bookingOpen && (
        <div
          className="bk-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Book an Appointment"
          onClick={(e) => { if (e.target === e.currentTarget) { setBookingOpen(false); setBookingCategoryHint(null); setBookingCatalogView("treatments"); } }}
        >
          <div className="bk-modal-sheet">
            <BookingForm key={`${bookingCatalogView}-${bookingServiceSlug || bookingCategoryHint || "all-services"}`} isModal initialServiceSlug={bookingServiceSlug} initialCategoryHint={bookingCategoryHint} initialCatalogView={bookingCatalogView} onClose={() => { setBookingOpen(false); setBookingCategoryHint(null); setBookingServiceSlug(null); setBookingCatalogView("treatments"); }} />
          </div>
        </div>
      )}

      {/* ── NAVBAR ── */}
      <nav className="navbar">
        <div className="nav-left">
          <Link href="/" className="nav-logo" aria-label="The Klinique Home">
            <img
              src="/images/the_klinique_logo-removebg-preview.png"
              alt="The Klinique Logo"
              className="nav-logo-img"
            />
          </Link>

          <ul className={`nav-links ${menuOpen ? "is-open" : ""}`}>{primaryNavigation.map((key,index)=>{const item=LANDING_NAV[key];return <li key={key}><a href={item.href} className={index===0?"active":""} onClick={()=>setMenuOpen(false)}>{item.label}</a></li>})}<li className="nav-more"><details><summary>More <i className="fa-solid fa-chevron-down"/></summary><div className="nav-more-menu">{moreNavigation.map(key=>{const item=LANDING_NAV[key];return <a href={item.href} key={key} onClick={()=>setMenuOpen(false)}><i className={`fa-regular ${item.icon}`}/> {item.label}</a>})}<a href="#blog" onClick={()=>setMenuOpen(false)}><i className="fa-regular fa-newspaper"/> Blogs</a></div></details></li></ul>
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
            onClick={() => openBooking()}
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
      <section className="hero" id="home" style={{ paddingTop: "88px", order:sectionOrder("home") }}>
        <div className="hero-bg">{heroMedia[activeHeroSlide]?.type === "video" ? <video key={`${activeHeroSlide}-${heroMedia[activeHeroSlide].url}`} src={heroMedia[activeHeroSlide].url} autoPlay muted loop playsInline /> : <Image key={`${activeHeroSlide}-${heroMedia[activeHeroSlide]?.url || "default"}`} src={heroMedia[activeHeroSlide]?.url || "/images/herobg.png"} alt={heroMedia[activeHeroSlide]?.alt || "The Klinique — Your unique beauty in mind"} fill style={{ objectFit: "cover", objectPosition: "center right" }} priority={activeHeroSlide === 0} quality={90} unoptimized={Boolean(heroMedia[activeHeroSlide]?.url?.startsWith("http"))} />}</div>
        <div className="hero-overlay" />

        <div className="hero-content">
          <p className="hero-tag">
            <span />
            {content?.heroEyebrow || "Skin · Aesthetics · Wellness"}
          </p>

          <h1 className="landing-script-accent">{(content?.heroTitle || "Your Unique Beauty in Mind.").split(/(unique)/i).map((part, index) => /^unique$/i.test(part) ? <em key={index}>{part}</em> : part)}</h1>

          <p className="hero-sub">{content?.heroSubtitle || "Expert care. Natural results. A more confident you."}</p>
          <p className="hero-desc">{content?.heroDescription || "At The Klinique, we combine medical expertise with a personalized approach to help you look and feel your best — inside and out."}</p>

          <button
            type="button"
            className="btn-primary"
            id="hero-book-btn"
            onClick={() => openBooking()}
          >
            <i className="fa-solid fa-calendar-plus" />
            Book Your Consultation
          </button>

          <p className="hero-marquee">Look Good · Feel Good · Be You</p>
          {heroMedia.length > 1 && <div className="landing-carousel-controls"><button type="button" aria-label="Previous slide" onClick={() => setHeroSlide(value => (value - 1 + heroMedia.length) % heroMedia.length)}><i className="fa-solid fa-chevron-left" /></button>{heroMedia.map((_,index) => <button type="button" aria-label={`Go to slide ${index + 1}`} className={index === activeHeroSlide ? "active" : ""} key={index} onClick={() => setHeroSlide(index)} />)}<button type="button" aria-label="Next slide" onClick={() => setHeroSlide(value => (value + 1) % heroMedia.length)}><i className="fa-solid fa-chevron-right" /></button></div>}
        </div>
      </section>

      {/* ── SERVICES ICON BAR ── */}
      <section className="services-bar" style={{order:sectionOrder("services")}}>
        <div className="services-bar-inner">
          {(content?.serviceIcons??DEFAULT_SERVICE_ICONS).map((s) => (
            <button
              key={s.alt}
              type="button"
              className="service-icon-item"
              onClick={() => openBooking(s.category||null)}
              style={{ cursor: "pointer", background: "none", border: "none", padding: 0 }}
            >
              <div className="service-icon-circle">
                {s.image?<img src={s.image} alt={s.alt||s.name} className="service-icon-img" />:<i className="fa-solid fa-spa"/>}
              </div>
              <span className="service-icon-name">{s.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── ABOUT / INTERIOR ── */}
      <section className="about-section" id="about" style={{order:sectionOrder("about")}}>
        <div className="about-image">
          <Image
            src={content?.aboutImage || "/images/the klinique interior.jpg"}
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
          <p className="section-label">{content?.aboutEyebrow || "A Personalized Approach"}</p>
          <h2>{content?.aboutTitle || "Where Science Meets Self-Care"}</h2>
          <p>{content?.aboutBody || "We believe true beauty is unique to you. Our treatments are doctor-led, evidence-based, and tailored to your goals — for natural, refined results that enhance, not change, who you are."}</p>

          <div className="about-pillars">
            {[
              { src: "/images/safeanddoctorled-removebg-preview.png",        alt: "Safe & Doctor-Led",     label: "Safe &\nDoctor-Led" },
              { src: "/images/premiumtechnology-removebg-preview.png",       alt: "Premium Technology",    label: "Premium\nTechnology" },
              { src: "/images/naturalrefinedresults-removebg-preview.png",   alt: "Natural Results",       label: "Natural,\nRefined Results" },
              { src: "/images/personalizedcare-removebg-preview.png",        alt: "Personalized Care",     label: "Personalized\nCare" },
            ].map((p) => (
              <div key={p.alt} className="pillar-item">
                <div className="pillar-icon pillar-icon-img">
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
            onClick={() => openBooking()}
          >
            <i className="fa-solid fa-calendar-plus" />
            Book a Consultation
          </button>
        </div>
      </section>

      {/* ── MEET THE DOCTOR ── */}
      <section className="landing-doctor-section" id="doctor" style={{order:sectionOrder("doctor")}}>
        <div className="landing-doctor-copy"><p className="section-label landing-script-accent">{content?.doctorEyebrow || "Meet Your Doctor"}</p><h2>{content?.doctorName || "Dr. Kharyl"}</h2><h3>{content?.doctorTitle || "Medical and Aesthetic Doctor"}</h3><p>{content?.doctorBio || "Doctor-led, evidence-based aesthetic care shaped around your goals, comfort, and natural features."}</p><button type="button" className="btn-primary" onClick={() => setBookingOpen(true)}><i className="fa-solid fa-calendar-plus" /> Book with Dr. Kharyl</button></div>
        <div className="landing-doctor-photo">{content?.doctorPhoto ? <img src={content.doctorPhoto} alt={content.doctorName || "Dr. Kharyl"} /> : <div><i className="fa-solid fa-user-doctor" /><span>Doctor photo can be uploaded in Settings → Website</span></div>}</div>
      </section>

      {/* ── SIGNATURE SERVICES ── */}
      <section className="services-section" id="services" style={{order:sectionOrder("services",1)}}>
        <div className="section-header">
          <div className="section-header-left"><p className="section-label">{content?.servicesEyebrow || "Our Signature Services"}</p><h2>{content?.servicesTitle || "What We Do Best"}</h2></div>
          <button type="button" className="view-all" id="view-all-services-btn" aria-expanded={showAllServices} onClick={() => setShowAllServices(current => !current)}>{showAllServices ? "Show fewer services" : "View all services"} <i className={`fa-solid ${showAllServices ? "fa-arrow-up" : "fa-arrow-down"}`} /></button>
        </div>
        <div className="services-grid">
          {(content?.serviceShowcase?.length ? content.serviceShowcase : [
            { image: "/images/botox.png", alt: "Botox treatment", name: "Botox", tagline: "Smoother. Fresher. More You." },
            { image: "/images/fillers.png", alt: "Dermal fillers", name: "Fillers", tagline: "Enhance Your Natural Beauty." },
            { image: "/images/skin boosters.png", alt: "Skin boosters", name: "Skin Boosters", tagline: "Deep Hydration. Lasting Glow." },
            { image: "/images/lasers.png", alt: "Laser skin treatments", name: "Lasers", tagline: "Clearer Skin. Brighter You." },
          ]).slice(0,showAllServices?undefined:4).map((service,index) => {const hint=service.name.toLowerCase(),aliases=hint.includes("botox")?["botox","neurotoxin"]:hint.includes("filler")?["filler"]:hint.includes("skin booster")?["skin booster"]:hint.includes("laser")?["laser"]:[hint];const relatedCategory=landingCategories.find(category=>aliases.some(alias=>`${category.name} ${category.slug}`.toLowerCase().replaceAll("-"," ").includes(alias)));const article=blogPosts.find(post=>post.service_category_id===relatedCategory?.id);return <article key={`${service.name}-${index}`} className="service-card">{service.image?<img className="service-card-img" src={service.image} alt={service.alt||service.name} style={{width:"100%",height:"auto",aspectRatio:"3/4",objectFit:"cover"}}/>:<div className="service-card-img service-card-placeholder"><i className="fa-solid fa-spa"/></div>}<div className="service-card-overlay"/><div className="service-card-content"><p className="service-card-name">{service.name}</p><p className="service-card-tagline">{service.tagline}</p><div className="service-card-actions"><button type="button" onClick={()=>openBooking(relatedCategory?.name||service.name)}><i className="fa-solid fa-calendar-plus"/> Book appointment</button><Link href={article?`/blog/${article.slug}`:"/blog"}><i className="fa-regular fa-file-lines"/> View details</Link></div></div></article>})}
        </div>
        <div className="landing-packages-block"><div className="landing-packages-copy"><p className="section-label">Glow Plans</p><h3>Plans for consistent care</h3><p>Explore our package types, then choose the plan that fits your goals in the booking catalog.</p><button type="button" onClick={openPackageBooking}>Book a Package <i className="fa-solid fa-arrow-right" /></button></div><div className="landing-package-list">{(landingPackageTypes.length ? landingPackageTypes : [{ category: "Laser Hair Removal", count: 1, fromPrice: 10000 }, { category: "RF Treatments", count: 1, fromPrice: 0 }]).slice(0,6).map((item) => {const relatedCategory=landingCategories.find(category=>{const haystack=`${category.name} ${category.slug}`.toLowerCase().replaceAll("-"," "),needle=item.category.toLowerCase();return haystack.includes(needle)||needle.includes(haystack)}),article=blogPosts.find(post=>post.service_category_id===relatedCategory?.id);return <article key={item.category}><span><i className="fa-solid fa-box-open" /></span><div><small>Package type</small><h4>{item.category}</h4><p>{item.count} Glow Plan{item.count === 1 ? "" : "s"} available</p><div className="landing-package-actions"><button type="button" onClick={openPackageBooking}><i className="fa-solid fa-calendar-plus"/> Book</button>{article?<Link href={`/blog/${article.slug}`}>View details <i className="fa-solid fa-arrow-right"/></Link>:<Link href="/blog">View details <i className="fa-solid fa-arrow-right"/></Link>}</div></div>{item.fromPrice > 0 && <strong>From PHP {item.fromPrice.toLocaleString()}</strong>}</article>})}</div></div>
      </section>

      {/* ── MOVING RESULTS GALLERY ── */}
      {(content?.galleryMedia?.length || 0) > 0 && <LandingResultsBoard items={content!.galleryMedia} eyebrow={content?.galleryEyebrow} title={content?.galleryTitle} description={content?.galleryDescription} badge={content?.galleryBadge} order={sectionOrder("gallery")}/>}

      {/* ── GALLERY ── */}
      <section className="quote-banner" id={(content?.galleryMedia?.length || 0) ? "gallery-message" : "gallery"} style={{ backgroundImage: "url('/images/banner background.png')", backgroundSize: "cover", backgroundPosition: "center", order:sectionOrder("gallery",1) }}>
        <div className="quote-banner-text-group"><p className="quote-text landing-script-accent">&ldquo;{content?.quoteText || "Healthy skin is a form of self-care."}&rdquo;</p><p className="quote-sub">{content?.quoteSubtitle || "Confidence · Wellness · A Brighter You"}</p></div>
        <button type="button" className="btn-book quote-book-btn" id="quote-book-btn" onClick={() => openBooking()}><i className="fa-solid fa-calendar-plus" /> Book Now</button>
      </section>

      {/* ── BLOGS ── */}
      <section className="landing-blog" id="blog" style={{order:sectionOrder("gallery",2)}}><header><div><p className="section-label">The Klinique Blog</p><h2>Learn with Dr. Kharyl</h2><span>Procedure guides, what to expect, aftercare, and clinic stories.</span></div><Link href="/blog">View all blogs <i className="fa-solid fa-arrow-right"/></Link></header>{blogPosts.length>0?<div>{blogPosts.slice(0,3).map(post=><Link href={`/blog/${post.slug}`} key={post.id}>{post.hero_url?(post.hero_type==="video"?<video src={post.hero_url} muted/>:<img src={post.hero_url} alt={post.title}/>):<span className="landing-blog-placeholder"><i className="fa-solid fa-newspaper"/></span>}<small>{post.category}</small><h3>{post.title}</h3><p>{post.excerpt}</p><strong>Read blog <i className="fa-solid fa-arrow-right"/></strong></Link>)}</div>:<div className="landing-blog-empty"><i className="fa-regular fa-newspaper"/><p>Published blogs will appear here.</p></div>}</section>

      {/* ── LATEST SOCIAL POSTS ── */}
      <section className="landing-social-feature" id="socials" style={{order:sectionOrder("social")}}>
        <div className="landing-social-copy">
          <p className="section-label">Social Updates</p>
          <h2 className="landing-script-accent">{content?.socialHeading || "Latest from The Klinique"}</h2>
          <p>See clinic announcements, treatment education, and our latest updates.</p>
          <div className="landing-social-links">
            {content?.facebookPageUrl && <a href={content.facebookPageUrl} target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-facebook-f" /> Facebook</a>}
            {content?.instagramUrl && <a href={content.instagramUrl} target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-instagram" /> Instagram</a>}
          </div>
        </div>
        <div className="landing-social-posts">
          {(content?.socialPosts?.length ? content.socialPosts : [{ title: "Latest from The Klinique", url: content?.socialPostUrl || FEATURED_FACEBOOK_REEL, platform: "facebook" as const }]).map((post, index) => {
            const postUrl = normalizeFacebookPostUrl(post.url);
            const embedFacebookPost = post.platform === "facebook" && isEmbeddableFacebookPost(postUrl);
            const embedFacebookVideo = embedFacebookPost && isFacebookVideo(postUrl);
            const instagramEmbedUrl = post.platform === "instagram" ? getInstagramEmbedUrl(postUrl) : null;
            const destination = postUrl || (post.platform === "facebook" ? content?.facebookPageUrl : content?.instagramUrl) || "#socials";
            return <article key={`${postUrl}-${index}`}>
              <header><span><i className={`fa-brands fa-${post.platform}`} /> {post.title || `${post.platform} post`}</span><a href={destination} target="_blank" rel="noopener noreferrer" aria-label={`Open ${post.title || post.platform} post`}><i className="fa-solid fa-arrow-up-right-from-square" /></a></header>
              {embedFacebookPost ? <iframe title={post.title || `Facebook post ${index + 1}`} src={`https://www.facebook.com/plugins/${embedFacebookVideo ? "video" : "post"}.php?href=${encodeURIComponent(postUrl)}&show_text=true&width=500`} width="500" height="520" scrolling="no" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowFullScreen /> : instagramEmbedUrl ? <iframe className="landing-instagram-embed" title={post.title || `Instagram post ${index + 1}`} src={instagramEmbedUrl} scrolling="no" allow="clipboard-write; encrypted-media; picture-in-picture; web-share" /> : post.platform === "facebook" ? <a className="landing-social-preview" href={destination} target="_blank" rel="noopener noreferrer"><span className="landing-social-preview-media"><img src="/images/herobg.png" alt="The Klinique" /><i className="fa-brands fa-facebook-f" /></span><strong>{post.title || "Latest from The Klinique"}</strong><span>View our latest posts on Facebook</span></a> : <a className="landing-instagram-post" href={destination} target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-instagram" /><strong>{post.title || "View Instagram"}</strong><span>Open this post on Instagram</span></a>}
            </article>;
          })}
        </div>
      </section>

      <div className="contact-strip" style={{order:sectionOrder("social",1)}}>
        <div className="contact-item"><i className="fa-solid fa-location-dot" /><span>{content?.address || "Cagayan de Oro City, PH 9000"}</span></div>
        <div className="contact-item"><i className="fa-regular fa-clock" /><span>{content?.clinicHours || "By Appointment Only"}</span></div>
        <a href="https://www.instagram.com/thekliniqueph?igsh=MXQwcTRubjJ1MWd3&utm_source=qr&fbclid=IwY2xjawUm8flleHRuA2FlbQIxMABwZG9mBWJyaWQRMVd1ekpOMUpNQkJnVGMyeExzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEeabqHRNs5LxfdN_ea_rT-vNkzsb9-p2qlISX0fB-bQB4J2kXiqqNnl0sr47U_aem_1VdrPw10C7rUT1kHJ5sMAg" target="_blank" rel="noopener noreferrer" className="contact-item"><i className="fa-brands fa-instagram" /><span>@thekliniqueph · The Klinique by Dr. Kharyl</span></a>
        <a href="https://web.facebook.com/profile.php?id=61592051454777" target="_blank" rel="noopener noreferrer" className="contact-item"><i className="fa-brands fa-facebook-f" /><span>The Klinique by Dr. Kharyl</span></a>
      </div>

      {/* ── FAQ ── */}
      <section className="landing-faq" id="faq" style={{order:sectionOrder("faq")}}>
        <div className="landing-faq-inner"><div className="landing-faq-intro"><p className="section-label">Frequently Asked Questions</p><h2>Helpful answers before your visit</h2><p>Still unsure which treatment fits your goals? Start with a consultation and let the doctor guide your plan.</p><button type="button" onClick={() => setBookingOpen(true)}><i className="fa-solid fa-calendar-plus" /> Book a consultation</button></div>
        <div className="landing-faq-list">{(content?.faqs?.length ? content.faqs : FAQS).map((item, index) => <details key={`${item.question}-${index}`} open={index === 0}><summary><span>{String(index + 1).padStart(2, "0")}</span>{item.question}<i className="fa-solid fa-plus" /></summary><p>{item.answer}</p></details>)}</div></div>
      </section>

      {/* ── CONTACT ── */}
      <section className="landing-contact" id="contact" style={{order:sectionOrder("contact")}}>
        <div className="landing-contact-inner"><div className="landing-contact-details">
          <p className="section-label">{content?.contactEyebrow || "Contact The Klinique"}</p><h2>{content?.contactTitle || "Let’s talk about your goals"}</h2><p>{content?.contactBody || "Send a message for treatment questions, package inquiries, or help with an existing appointment."}</p>
          <div className="landing-contact-list">
            <a href={`tel:${(content?.phone || "+63 956 003 1916").replace(/[^+\d]/g, "")}`}><span><i className="fa-solid fa-phone" /></span><div><small>Call or text</small><strong>{content?.phone || "+63 956 003 1916"}</strong></div><i className="fa-solid fa-arrow-up-right-from-square" /></a>
            <a href={`mailto:${content?.email || "thekliniqueinfo@gmail.com"}`}><span><i className="fa-solid fa-envelope" /></span><div><small>Email</small><strong>{content?.email || "thekliniqueinfo@gmail.com"}</strong></div><i className="fa-solid fa-arrow-up-right-from-square" /></a>
            <div><span><i className="fa-solid fa-location-dot" /></span><div><small>Clinic</small><strong>{content?.address || "Cagayan de Oro City, PH 9000"}</strong></div></div>
            <div><span><i className="fa-regular fa-clock" /></span><div><small>Clinic hours</small><strong>{content?.clinicHours || "By appointment only"}</strong></div></div>
          </div>
          <div className="landing-socials"><a href="https://www.instagram.com/thekliniqueph?igsh=MXQwcTRubjJ1MWd3&utm_source=qr&fbclid=IwY2xjawUm8flleHRuA2FlbQIxMABwZG9mBWJyaWQRMVd1ekpOMUpNQkJnVGMyeExzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEeabqHRNs5LxfdN_ea_rT-vNkzsb9-p2qlISX0fB-bQB4J2kXiqqNnl0sr47U_aem_1VdrPw10C7rUT1kHJ5sMAg" target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-instagram" /> Instagram</a><a href="https://web.facebook.com/profile.php?id=61592051454777" target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-facebook-f" /> Facebook</a></div>
        </div>
        <LandingContactForm /></div>
      </section>

      {/* ── LOCATION ── */}
      <section className="landing-location" aria-labelledby="location-heading" style={{order:sectionOrder("contact",1)}}>
        <div className="landing-location-head"><div><p className="section-label">Visit The Klinique</p><h2 id="location-heading">The Klinique Medical and Aesthetic Clinic</h2><p><i className="fa-solid fa-location-dot" /> Cagayan de Oro City, Misamis Oriental 9000, Philippines</p></div><a href="https://www.google.com/maps/search/?api=1&query=The+Klinique+Medical+and+Aesthetic+Clinic+Cagayan+de+Oro" target="_blank" rel="noopener noreferrer">Get directions <i className="fa-solid fa-arrow-right" /></a></div>
        <div className="landing-map-frame"><iframe title="Google Map showing The Klinique in Cagayan de Oro" src="https://www.google.com/maps?q=The%20Klinique%20Medical%20and%20Aesthetic%20Clinic%20Cagayan%20de%20Oro&output=embed" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer-info footer-info--extended" style={{order:sectionOrder("contact",2)}}>
        <div className="footer-inner">
          <div className="footer-logo"><Image src="/images/the_klinique_logo-removebg-preview.png" alt="The Klinique" width={220} height={110} style={{ height: "110px", width: "auto" }} /></div>
          <div className="footer-divider" aria-hidden="true" />
          <nav className="footer-nav" aria-label="Footer navigation"><a href="#home">Home</a><span className="footer-nav-sep">|</span><a href="#about">About</a><span className="footer-nav-sep">|</span><a href="#services">Services</a><span className="footer-nav-sep">|</span><a href="#gallery">Gallery</a><span className="footer-nav-sep">|</span><a href="#blog">Blogs</a><span className="footer-nav-sep">|</span><a href="#socials">Socials</a><span className="footer-nav-sep">|</span><a href="#faq">FAQ</a><span className="footer-nav-sep">|</span><a href="#contact">Contact</a></nav>
          <div className="footer-divider" aria-hidden="true" />
          <div className="footer-newsletter"><p className="footer-newsletter-label">Be part of our community</p><form className="newsletter-form" id="newsletter-form" onSubmit={(event) => event.preventDefault()}><input type="email" placeholder="Your email address" aria-label="Email address for newsletter" id="newsletter-email" /><button type="submit" aria-label="Subscribe">→</button></form><p className="footer-script-tagline landing-script-accent">{content?.footerTagline || "Your unique beauty in mind."}</p></div>
        </div>
        <div className="footer-contact-row"><a href="tel:+639560031916"><i className="fa-solid fa-phone" /> +63 956 003 1916</a><a href="mailto:thekliniqueinfo@gmail.com"><i className="fa-solid fa-envelope" /> thekliniqueinfo@gmail.com</a><span><i className="fa-solid fa-location-dot" /> Cagayan de Oro City</span><a href="https://www.instagram.com/thekliniqueph?igsh=MXQwcTRubjJ1MWd3&utm_source=qr" target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-instagram" /> @thekliniqueph</a><a href="https://web.facebook.com/profile.php?id=61592051454777" target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-facebook-f" /> Facebook</a></div>
        <div className="footer-bottom"><div className="footer-bottom-left"><span>© 2026 The Klinique. All rights reserved.</span><span className="footer-nav-sep">|</span><Link href="/terms">Terms &amp; Conditions</Link><span className="footer-nav-sep">|</span><Link href="/cancellation-policy">Cancellation Policy</Link><span className="footer-nav-sep">|</span><Link href="/auth">Patient Portal</Link></div></div>
      </footer>
    </div>
  );
}

function LandingResultsBoard({items,eyebrow,title,description,badge,order}:{items:LandingMedia[];eyebrow?:string;title?:string;description?:string;badge?:string;order?:number}) {
  return <section className="landing-media-gallery landing-results-board" id="gallery" style={{order}}>
    <header><div><p className="section-label">{eyebrow||"Before & After"}</p><h2>{title||"Featured Results"}</h2><span>{description||"Aesthetic transformations and clinic stories."}</span></div><strong>{badge||"Results Board"}</strong></header>
    <div className="landing-results-viewport"><div className={`landing-results-track ${items.length===1?"is-single":""}`}>
      {[...items,...items].map((item,index)=>{const originalIndex=index%items.length;const duplicate=index>=items.length;return <article className="landing-result-card" key={`${duplicate?"copy":"original"}-${item.url}-${originalIndex}`} aria-hidden={duplicate||undefined}><header><div><span>Aesthetic Results</span><h3>{item.title?.trim()||`Featured result ${originalIndex+1}`}</h3></div><small>Case {String(originalIndex+1).padStart(2,"0")}</small></header><div className="landing-result-media">{item.type==="video"?<video src={item.url} controls={!duplicate} autoPlay muted loop playsInline/>:<img src={item.url} alt={duplicate?"":item.alt}/>}</div></article>})}
    </div></div>
    <p className="landing-results-note"><i className="fa-solid fa-arrows-left-right"/> Results move continuously. Hover or focus to pause.</p>
  </section>;
}
