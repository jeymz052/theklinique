"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { RESERVATION_FEE_LABEL } from "@/lib/reservation";

/* ─── Data ─────────────────────────────────────────────── */
const SERVICES = [
  {
    id: "botox",
    slug: "botox-forehead",
    icon: "fa-syringe",
    name: "Botox & Neuromodulators",
    desc: "Forehead, glabella, crow's feet & more",
    price: "Starts at ₱3,500",
    duration: "30–45 min",
    color: "#c57171",
  },
  {
    id: "fillers",
    slug: "fillers-lip",
    icon: "fa-droplet",
    name: "Dermal Fillers",
    desc: "Lips, cheeks, jawline & tear troughs",
    price: "Starts at ₱8,000",
    duration: "45–60 min",
    color: "#e07b7b",
  },
  {
    id: "skin-boosters",
    slug: "sb-hyaron",
    icon: "fa-water-ladder",
    name: "Skin Boosters",
    desc: "Profhilo, Juvelook & deep hydration",
    price: "Starts at ₱6,000",
    duration: "30–45 min",
    color: "#c57171",
  },
  {
    id: "lasers",
    slug: "laser-co2-fractional",
    icon: "fa-bolt",
    name: "Lasers & Rejuvenation",
    desc: "Fractional, Q-switch & skin tightening",
    price: "Starts at ₱2,500",
    duration: "30–60 min",
    color: "#d4826f",
  },
  {
    id: "facial",
    slug: "consult-dr-kharyl",
    icon: "fa-spa",
    name: "Facial & Skin Treatments",
    desc: "Medical-grade facials & peels",
    price: "Starts at ₱1,500",
    duration: "45–90 min",
    color: "#c57171",
  },
  {
    id: "iv",
    slug: "consult-dr-kharyl",
    icon: "fa-bottle-droplet",
    name: "IV Therapy & Wellness",
    desc: "Glutathione, Vitamin C & immunity drips",
    price: "Starts at ₱3,000",
    duration: "45–60 min",
    color: "#b07a7a",
  },
  {
    id: "laser-hair",
    slug: "consult-dr-kharyl",
    icon: "fa-sun",
    name: "Laser Hair Removal",
    desc: "Long-lasting smooth skin",
    price: "Starts at ₱2,500",
    duration: "30–60 min",
    color: "#c98080",
  },
  {
    id: "other",
    slug: "consult-dr-kharyl",
    icon: "fa-circle-plus",
    name: "Other / Consultation",
    desc: "Not sure? Let's talk first",
    price: "Inquire for price",
    duration: "TBD",
    color: "#9c7070",
  },
];

type Category = { id: string; name: string; slug: string; sort_order: number };
type CatalogService = { id: string; category_id: string; name: string; slug: string; description: string | null; price: number; price_note: string | null; duration_mins: number | null };
type Product = { id: string; name: string; description: string | null; price: number; category: string };

const FALLBACK_CATALOG = {
  categories: [{ id: "legacy", name: "Treatments", slug: "legacy", sort_order: 1 }],
  services: SERVICES.map((service) => ({ id: service.id, category_id: "legacy", name: service.name, slug: service.slug, description: service.desc, price: Number(service.price.replace(/[^0-9]/g, "")) || 0, price_note: null, duration_mins: null })),
  products: [] as Product[],
};

const TIME_SLOTS = [
  "9:00 AM","9:30 AM","10:00 AM","10:30 AM",
  "11:00 AM","11:30 AM","1:00 PM","1:30 PM",
  "2:00 PM","2:30 PM","3:00 PM","3:30 PM",
  "4:00 PM","4:30 PM","5:00 PM",
];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

/* ─── Step indicator ───────────────────────────────────── */
const STEPS = [
  { label: "Service",       icon: "fa-list-check"           },
  { label: "Details",       icon: "fa-user"                },
  { label: "Date & Time",   icon: "fa-calendar-days"       },
  { label: "Confirm",       icon: "fa-circle-check"        },
];

const BOOKING_DRAFT_KEY = "theklinique.booking-draft.v1";

type BookingPolicy = "terms" | "cancellation";

function BookingPolicyModal({ type, onClose }: { type: BookingPolicy; onClose: () => void }) {
  const isTerms = type === "terms";
  const title = isTerms ? "Terms & Conditions" : "Cancellation Policy";
  const points = isTerms
    ? ["A consultation may be required before a treatment is approved.", "Please provide complete and accurate health information.", `Your ${RESERVATION_FEE_LABEL} reservation fee is credited to your clinic bill.`]
    : ["Please reschedule or cancel at least 24 hours before your appointment.", "Late cancellations and no-shows may forfeit the reservation fee.", "Rescheduled appointments remain subject to clinic availability."];

  return (
    <div className="bk-policy-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="bk-policy-card">
        <div className="bk-policy-head">
          <div><p className="bk-label">Booking policy</p><h3>{title}</h3></div>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`}><i className="fa-solid fa-xmark" /></button>
        </div>
        <ul>{points.map((point) => <li key={point}>{point}</li>)}</ul>
        <button type="button" className="bk-btn-primary" onClick={onClose}>I understand</button>
      </section>
    </div>
  );
}

/* ─── Props ─────────────────────────────────────────────── */
interface BookingFormProps {
  isModal?: boolean;
  onClose?: () => void;
}

/* ═══════════════════════════════════════════════════════════
   BookingForm
═══════════════════════════════════════════════════════════ */
export default function BookingForm({ isModal = false, onClose }: BookingFormProps) {
  const router = useRouter();
  const today = new Date();

  /* ── State ── */
  const [step, setStep]                   = useState(0);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories]       = useState<Category[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [products, setProducts]           = useState<Product[]>([]);
  const [cartProductIds, setCartProductIds] = useState<string[]>([]);
  const [catalogError, setCatalogError]   = useState("");
  const [form, setForm]                   = useState({
    firstName: "", lastName: "", email: "", phone: "", notes: "", agreed: false,
  });
  const [calYear, setCalYear]             = useState(today.getFullYear());
  const [calMonth, setCalMonth]           = useState(today.getMonth());
  const [selectedDate, setSelectedDate]   = useState<string | null>(null);
  const [selectedTime, setSelectedTime]   = useState<string | null>(null);
  const [submitting, setSubmitting]       = useState(false);
  const [submitError, setSubmitError]     = useState("");
  const [policyModal, setPolicyModal]     = useState<BookingPolicy | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [isSignedIn, setIsSignedIn]       = useState(false);

  const service     = catalogServices.find((item) => item.id === selectedService);
  const categoryServices = catalogServices.filter((item) => item.category_id === selectedCategory);
  const cartProducts = products.filter((item) => cartProductIds.includes(item.id));
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay    = new Date(calYear, calMonth, 1).getDay();

  useEffect(() => {
    fetch("/api/booking-catalog")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load the booking catalog.");
        setCategories(result.categories);
        setCatalogServices(result.services);
        setProducts(result.products);
      })
      .catch((error) => {
        setCategories(FALLBACK_CATALOG.categories);
        setCatalogServices(FALLBACK_CATALOG.services);
        setProducts(FALLBACK_CATALOG.products);
        setCatalogError(error instanceof Error ? error.message : "Showing a limited treatment list.");
      });
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setIsSignedIn(Boolean(data.session));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setIsSignedIn(Boolean(session)));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(BOOKING_DRAFT_KEY);
        if (saved) {
          const draft = JSON.parse(saved);
          setStep(Math.min(Math.max(Number(draft.step) || 0, 0), 3));
          setSelectedService(typeof draft.selectedService === "string" ? draft.selectedService : null);
          setSelectedCategory(typeof draft.selectedCategory === "string" ? draft.selectedCategory : null);
          setCartProductIds(Array.isArray(draft.cartProductIds) ? draft.cartProductIds : []);
          setForm((current) => ({ ...current, ...(draft.form || {}) }));
          setSelectedDate(typeof draft.selectedDate === "string" ? draft.selectedDate : null);
          setSelectedTime(typeof draft.selectedTime === "string" ? draft.selectedTime : null);
        }
      } catch {
        window.localStorage.removeItem(BOOKING_DRAFT_KEY);
      } finally {
        setDraftRestored(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!draftRestored) return;
    window.localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify({ step, selectedService, selectedCategory, cartProductIds, form, selectedDate, selectedTime }));
  }, [cartProductIds, draftRestored, form, selectedCategory, selectedDate, selectedService, selectedTime, step]);

  const selectCategory = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setSelectedService(null);
  };

  const toggleProduct = (productId: string) => {
    setCartProductIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  };

  function proceedToReview() {
    if (isModal && !isSignedIn) {
      router.push("/auth?next=/booking");
      return;
    }
    setStep(3);
  }

  function prevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  }

  function isDatePast(day: number) {
    return new Date(calYear, calMonth, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !selectedDate || !selectedTime) return;

    setSubmitting(true);
    setSubmitError("");
    try {
      const day = new Date(selectedDate);
      const [time, period] = selectedTime.split(" ");
      const [hoursText, minutes] = time.split(":");
      let hours = Number(hoursText);
      if (period === "PM" && hours !== 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      const appointmentTime = `${String(hours).padStart(2, "0")}:${minutes}:00`;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify({ step, selectedService, selectedCategory, cartProductIds, form, selectedDate, selectedTime }));
        router.push("/auth?next=/booking");
        return;
      }
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          notes: form.notes,
          serviceSlug: service.slug,
          productIds: cartProductIds,
          appointmentDate: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
          appointmentTime,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save the booking.");
      const paymentResponse = await fetch("/api/payments/reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ appointmentId: result.appointment.id }),
      });
      const payment = await paymentResponse.json();
      if (!paymentResponse.ok) throw new Error(payment.error || "Unable to start the reservation payment.");
      window.localStorage.removeItem(BOOKING_DRAFT_KEY);
      window.location.assign(payment.checkoutUrl);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to save the booking.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ─── Success screen ─────────────────────────────────── */
  /* ─── Main render ─────────────────────────────────────── */
  return (
    <div className={isModal ? "bk-modal-inner" : "bk-standalone"}>
      {policyModal && <BookingPolicyModal type={policyModal} onClose={() => setPolicyModal(null)} />}

      {/* ── Modal header bar ── */}
      {isModal && (
        <div className="bk-modal-topbar">
          <div className="bk-modal-topbar-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/the_klinique_logo-removebg-preview.png"
              alt="The Klinique"
              className="bk-modal-logo"
            />
            <div>
              <p className="bk-modal-clinic">Book an Appointment</p>
              <p className="bk-modal-doctor">
                <i className="fa-solid fa-user-doctor" /> Dr. Kharyl Dence, MD · The Klinique CDO
              </p>
            </div>
          </div>
          {onClose && (
            <button type="button" className="bk-modal-close-btn" onClick={onClose} aria-label="Close booking">
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>
      )}

      {/* ── Standalone header ── */}
      {!isModal && (
        <div className="bk-standalone-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/the_klinique_logo-removebg-preview.png"
            alt="The Klinique"
            className="bk-standalone-logo"
          />
          <div className="bk-standalone-meta">
            <h1 className="bk-standalone-title">Book an Appointment</h1>
            <p className="bk-standalone-sub">
              <i className="fa-solid fa-user-doctor" />
              Dr. Kharyl Dence, MD · The Klinique · Cagayan de Oro City
            </p>
          </div>
        </div>
      )}

      {/* ── Step indicator ── */}
      <div className="bk-steps-bar">
        {STEPS.map((s, i) => (
          <div key={s.label} className="bk-step-item">
            <div className={`bk-step-bubble ${i < step ? "done" : i === step ? "active" : ""}`}>
              {i < step
                ? <i className="fa-solid fa-check" />
                : <i className={`fa-solid ${s.icon}`} />
              }
            </div>
            <span className={`bk-step-label ${i === step ? "active" : ""}`}>{s.label}</span>
            {i < STEPS.length - 1 && (
              <div className={`bk-step-connector ${i < step ? "done" : ""}`} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step content ── */}
      <div className="bk-content">

        {/* ══ STEP 0: Service ══ */}
        {step === 0 && (
          <div className="bk-panel" id="step-service">
            <div className="bk-panel-head">
              <i className="fa-solid fa-wand-magic-sparkles bk-panel-icon" />
              <div>
                <h2 className="bk-panel-title">Choose Your Treatment</h2>
                <p className="bk-panel-sub">Select the service you&apos;d like to book with Dr. Kharyl Dence</p>
              </div>
            </div>

            <div className="bk-service-catalog">
              <div className="bk-appointment-choice">
                <div className="bk-choice-field">
                  <label htmlFor="booking-category-select" className="bk-label">Service category</label>
                  <select id="booking-category-select" className="bk-catalog-select" value={selectedCategory || ""} onChange={(event) => selectCategory(event.target.value)}>
                    <option value="">Choose a category</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </div>
                <div className="bk-choice-field">
                  <label htmlFor="booking-service-select" className="bk-label">Specific treatment</label>
                  <select id="booking-service-select" className="bk-catalog-select" value={selectedService || ""} onChange={(event) => setSelectedService(event.target.value || null)} disabled={!selectedCategory}>
                    <option value="">{selectedCategory ? "Choose a treatment" : "Choose a category first"}</option>
                    {categoryServices.map((item) => <option key={item.id} value={item.id}>{item.name} - PHP {Number(item.price).toLocaleString()}</option>)}
                  </select>
                </div>
              </div>
              {service && (
                <div className="bk-selected-service bk-selected-service-summary">
                  <div><strong>{service.name}</strong>{service.description && <p>{service.description}</p>}</div>
                  <span>PHP {Number(service.price).toLocaleString()}{service.price_note && <small>{service.price_note}</small>}</span>
                </div>
              )}
              {catalogError && <p className="bk-form-error">{catalogError}</p>}
              {products.length > 0 && (
                <details className="bk-package-drawer">
                  <summary><span><i className="fa-solid fa-bag-shopping" /> Add a package</span><span className="bk-cart-count">{cartProducts.length} in cart</span></summary>
                  <div className="bk-products-grid">
                    {products.map((product) => {
                      const selected = cartProductIds.includes(product.id);
                      return <div key={product.id} className={`bk-product-card ${selected ? "selected" : ""}`}><div><strong>{product.name}</strong><span>PHP {Number(product.price).toLocaleString()}</span>{product.description && <p>{product.description}</p>}</div><button type="button" onClick={() => toggleProduct(product.id)}>{selected ? "Remove" : "Add"}</button></div>;
                    })}
                  </div>
                </details>
              )}
            </div>

            <div className="bk-nav">
              <span />
              <button
                type="button"
                id="step0-next"
                className="bk-btn-primary"
                disabled={!selectedService}
                onClick={() => setStep(1)}
              >
                Next: Your Details
                <i className="fa-solid fa-arrow-right" />
              </button>
            </div>
          </div>
        )}

        {/* ══ STEP 1: Patient Details ══ */}
        {step === 1 && (
          <div className="bk-panel" id="step-details">
            <div className="bk-panel-head">
              <i className="fa-solid fa-user bk-panel-icon" />
              <div>
                <h2 className="bk-panel-title">Your Details</h2>
                <p className="bk-panel-sub">Tell us a bit about yourself so we can prepare for your visit</p>
              </div>
            </div>

            <div className="bk-form-grid">
              {[
                { id: "b-first",  label: "First Name",     type: "text",  placeholder: "Maria",             key: "firstName", half: true  },
                { id: "b-last",   label: "Last Name",      type: "text",  placeholder: "Santos",            key: "lastName",  half: true  },
                { id: "b-email",  label: "Email Address",  type: "email", placeholder: "you@example.com",  key: "email",     half: false },
                { id: "b-phone",  label: "Phone Number",   type: "tel",   placeholder: "+63 9XX XXX XXXX", key: "phone",     half: false },
              ].map((f) => (
                <div key={f.id} className={`bk-field ${f.half ? "bk-field-half" : "bk-field-full"}`}>
                  <label htmlFor={f.id} className="bk-label">
                    {f.label} <span className="bk-required">*</span>
                  </label>
                  <div className="bk-input-wrap">
                    <input
                      id={f.id}
                      type={f.type}
                      placeholder={f.placeholder}
                      value={form[f.key as keyof typeof form] as string}
                      onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="bk-input"
                      required
                    />
                  </div>
                </div>
              ))}

              <div className="bk-field bk-field-full">
                <label htmlFor="b-notes" className="bk-label">
                  <i className="fa-solid fa-note-sticky" /> Concerns / Notes
                  <span className="bk-optional"> (optional)</span>
                </label>
                <textarea
                  id="b-notes"
                  rows={3}
                  className="bk-textarea"
                  placeholder="Example: acne scars on cheeks, first-time Botox concerns, pigmentation, or preferred treatment areas."
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>

            <label className="bk-checkbox-row" htmlFor="b-agree">
              <input
                id="b-agree"
                type="checkbox"
                checked={form.agreed}
                onChange={(e) => setForm((prev) => ({ ...prev, agreed: e.target.checked }))}
                className="bk-checkbox"
              />
              <span className="bk-checkbox-text">
                I agree to the{" "}
                <button type="button" className="bk-inline-link" onClick={() => setPolicyModal("terms")}>Terms & Conditions</button>
                {" "}and{" "}
                <button type="button" className="bk-inline-link" onClick={() => setPolicyModal("cancellation")}>Cancellation Policy</button>
              </span>
            </label>

            <div className="bk-nav">
              <button type="button" id="step1-back" className="bk-btn-ghost" onClick={() => setStep(0)}>
                <i className="fa-solid fa-arrow-left" /> Back
              </button>
              <button
                type="button"
                id="step1-next"
                className="bk-btn-primary"
                disabled={!form.firstName || !form.lastName || !form.email || !form.phone || !form.agreed}
                onClick={() => setStep(2)}
              >
                Next: Date & Time
                <i className="fa-solid fa-arrow-right" />
              </button>
            </div>
          </div>
        )}

        {/* ══ STEP 2: Date & Time ══ */}
        {step === 2 && (
          <div className="bk-panel" id="step-datetime">
            <div className="bk-panel-head">
              <i className="fa-solid fa-calendar-days bk-panel-icon" />
              <div>
                <h2 className="bk-panel-title">Select Date & Time</h2>
                <p className="bk-panel-sub">Choose your preferred appointment slot with Dr. Kharyl Dence</p>
              </div>
            </div>

            <div className="bk-datetime-layout">
              {/* Calendar */}
              <div className="bk-calendar">
                <div className="bk-cal-nav">
                  <button type="button" id="cal-prev" className="bk-cal-nav-btn" onClick={prevMonth} aria-label="Prev month">
                    <i className="fa-solid fa-chevron-left" />
                  </button>
                  <span className="bk-cal-month">{MONTHS[calMonth]} {calYear}</span>
                  <button type="button" id="cal-next" className="bk-cal-nav-btn" onClick={nextMonth} aria-label="Next month">
                    <i className="fa-solid fa-chevron-right" />
                  </button>
                </div>

                <div className="bk-cal-grid">
                  {DAY_LABELS.map((d) => (
                    <div key={d} className="bk-cal-day-head">{d}</div>
                  ))}
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`e${i}`} className="bk-cal-day-empty" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day     = i + 1;
                    const dateStr = `${MONTHS[calMonth]} ${day}, ${calYear}`;
                    const past    = isDatePast(day);
                    return (
                      <button
                        key={day}
                        id={`cal-day-${day}`}
                        type="button"
                        className={`bk-cal-day ${selectedDate === dateStr ? "selected" : ""} ${past ? "past" : ""}`}
                        disabled={past}
                        onClick={() => !past && setSelectedDate(dateStr)}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>

                {selectedDate && (
                  <div className="bk-cal-selected-label">
                    <i className="fa-solid fa-calendar-check" />
                    {selectedDate}
                  </div>
                )}
              </div>

              {/* Time slots */}
              <div className="bk-timeslots">
                <p className="bk-timeslots-title">
                  <i className="fa-regular fa-clock" /> Available Times
                </p>
                <p className="bk-timeslots-sub">Clinic hours: 9 AM – 5 PM · By Appointment Only</p>
                <div className="bk-timeslots-grid">
                  {TIME_SLOTS.map((t) => (
                    <button
                      key={t}
                      id={`timeslot-${t.replace(/[: ]/g, "-")}`}
                      type="button"
                      className={`bk-timeslot ${selectedTime === t ? "selected" : ""}`}
                      onClick={() => setSelectedTime(t)}
                    >
                      <i className="fa-regular fa-clock" />
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bk-nav">
              <button type="button" id="step2-back" className="bk-btn-ghost" onClick={() => setStep(1)}>
                <i className="fa-solid fa-arrow-left" /> Back
              </button>
              <button
                type="button"
                id="step2-next"
                className="bk-btn-primary"
                disabled={!selectedDate || !selectedTime}
                onClick={proceedToReview}
              >
                Review Booking
                <i className="fa-solid fa-arrow-right" />
              </button>
            </div>
          </div>
        )}

        {/* ══ STEP 3: Review & Confirm ══ */}
        {step === 3 && (
          <div className="bk-panel" id="step-review">
            <div className="bk-panel-head">
              <i className="fa-solid fa-circle-check bk-panel-icon" />
              <div>
                <h2 className="bk-panel-title">Review & Confirm</h2>
                <p className="bk-panel-sub">Please double-check your appointment details before confirming</p>
              </div>
            </div>

            <div className="bk-review-card">
              {/* Service highlight */}
              <div className="bk-review-service-band">
                <div className="bk-review-service-icon">
                  <i className="fa-solid fa-wand-magic-sparkles" />
                </div>
                <div>
                  <p className="bk-review-service-name">{service?.name}</p>
                  <p className="bk-review-service-meta">
                    <span><i className="fa-solid fa-tag" /> PHP {service ? Number(service.price).toLocaleString() : ""}</span>
                    {service?.duration_mins && <span><i className="fa-regular fa-clock" /> {service.duration_mins} min</span>}
                  </p>
                </div>
                <button
                  type="button"
                  className="bk-review-edit"
                  onClick={() => setStep(0)}
                  title="Edit service"
                >
                  <i className="fa-solid fa-pen" />
                </button>
              </div>

              {/* Review rows */}
              <div className="bk-review-rows">
                {[
                  { icon: "fa-calendar-days",   label: "Date",           value: selectedDate,                      step: 2 },
                  { icon: "fa-clock",            label: "Time",           value: selectedTime,                      step: 2 },
                  { icon: "fa-user-doctor",      label: "Doctor",         value: "Dr. Kharyl Dence, MD",            step: null },
                  { icon: "fa-location-dot",     label: "Clinic",         value: "The Klinique · Cagayan de Oro",   step: null },
                  { icon: "fa-user",             label: "Patient",        value: `${form.firstName} ${form.lastName}`, step: 1 },
                  { icon: "fa-envelope",         label: "Email",          value: form.email,                        step: 1 },
                  { icon: "fa-phone",            label: "Phone",          value: form.phone,                        step: 1 },
                  ...(form.notes   ? [{ icon: "fa-note-sticky", label: "Notes",  value: form.notes,                step: 1 as number | null }] : []),
                ].map((r) => (
                  <div key={r.label} className="bk-review-row">
                    <span className="bk-review-row-icon">
                      <i className={`fa-solid ${r.icon}`} />
                    </span>
                    <span className="bk-review-row-label">{r.label}</span>
                    <span className="bk-review-row-value">{r.value}</span>
                    {r.step !== null && (
                      <button
                        type="button"
                        className="bk-review-row-edit"
                        onClick={() => setStep(r.step as number)}
                        title="Edit"
                      >
                        <i className="fa-solid fa-pen-to-square" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="bk-review-notice">
                <i className="fa-solid fa-circle-info" />
                <span>
                  Your booking is <strong>pending confirmation</strong>. We&apos;ll contact you
                  within 24 hours via phone or email to confirm your slot.
                </span>
              </div>
              <div className="bk-reservation-card">
                <div className="bk-reservation-icon"><i className="fa-solid fa-qrcode" /></div>
                <div>
                  <p className="bk-reservation-eyebrow">Required to confirm</p>
                  <h3>{RESERVATION_FEE_LABEL} reservation fee</h3>
                  <p>Securely pay via QR Ph with PayMongo. This amount is credited toward your clinic bill when you visit.</p>
                </div>
                <strong>{RESERVATION_FEE_LABEL}</strong>
              </div>
            </div>

            <div className="bk-nav">
              <button type="button" id="step3-back" className="bk-btn-ghost" onClick={() => setStep(2)}>
                <i className="fa-solid fa-arrow-left" /> Back
              </button>
              <form onSubmit={handleConfirm} style={{ display: "inline" }}>
                {submitError && <p className="bk-form-error" role="alert">{submitError}</p>}
                <button type="submit" id="confirm-booking-btn" className="bk-btn-confirm" disabled={submitting}>
                  <i className="fa-solid fa-check" />
                  {submitting ? "Opening payment..." : "Continue to PayMongo"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
