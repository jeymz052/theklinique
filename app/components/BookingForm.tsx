"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { RESERVATION_FEE_LABEL } from "@/lib/reservation";
import type { BookingSlot } from "@/lib/bookingAvailability";

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
type CatalogService = { id: string; category_id: string; subcategory: string; name: string; slug: string; description: string | null; price: number; price_note: string | null; duration_mins: number | null };
type Product = { id: string; name: string; description: string | null; price: number; category: string; subcategory: string };

const FALLBACK_CATALOG = {
  categories: [{ id: "legacy", name: "Treatments", slug: "legacy", sort_order: 1 }],
  services: SERVICES.map((service) => ({ id: service.id, category_id: "legacy", subcategory: "General", name: service.name, slug: service.slug, description: service.desc, price: Number(service.price.replace(/[^0-9]/g, "")) || 0, price_note: null, duration_mins: null })),
  products: [] as Product[],
};

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

/* ─── Step indicator ───────────────────────────────────── */
const STEPS = [
  { label: "Visit & Treatment", icon: "fa-list-check"       },
  { label: "Patient Details",   icon: "fa-user"             },
  { label: "Date & Time",   icon: "fa-calendar-days"       },
  { label: "Review & Payment", icon: "fa-circle-check"      },
];

const BOOKING_DRAFT_KEY = "theklinique.booking-draft.v1";

type BookingPolicy = "terms" | "cancellation";
type BookingType = "consultation" | "treatment";

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
  embedded?: boolean;
  onClose?: () => void;
  initialServiceSlug?: string | null;
  initialCategoryHint?: string | null;
  parentAppointmentId?: string | null;
}

/* ═══════════════════════════════════════════════════════════
   BookingForm
═══════════════════════════════════════════════════════════ */
export default function BookingForm({ isModal = false, embedded = false, onClose, initialServiceSlug = null, initialCategoryHint = null, parentAppointmentId = null }: BookingFormProps) {
  const router = useRouter();
  const today = new Date();

  /* ── State ── */
  const [step, setStep]                   = useState(0);
  const [bookingType, setBookingType]     = useState<BookingType | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories]       = useState<Category[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [products, setProducts]           = useState<Product[]>([]);
  const [cartProductIds, setCartProductIds] = useState<string[]>([]);
  const [cartTreatmentIds, setCartTreatmentIds] = useState<string[]>([]);
  const [catalogError, setCatalogError]   = useState("");
  const [form, setForm]                   = useState({
    firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", address: "",
    emergencyContactName: "", emergencyContactPhone: "", chiefConcern: "", treatmentGoals: "",
    allergies: "", currentMedications: "", medicalHistory: "", pregnancyStatus: "prefer_not_to_say",
    previousReactions: "", recentProcedures: "", notes: "", intakeConfirmed: false,
    agreed: false, consentAcknowledged: false,
  });
  const [calYear, setCalYear]             = useState(today.getFullYear());
  const [calMonth, setCalMonth]           = useState(today.getMonth());
  const [selectedDate, setSelectedDate]   = useState<string | null>(null);
  const [selectedTime, setSelectedTime]   = useState<string | null>(null);
  const [timeSlots, setTimeSlots]         = useState<BookingSlot[]>([]);
  const [availabilityHours, setAvailabilityHours] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("Select a date to view all hourly slots.");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [submitError, setSubmitError]     = useState("");
  const [policyModal, setPolicyModal]     = useState<BookingPolicy | null>(null);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [isSignedIn, setIsSignedIn]       = useState(false);
  const [authResolved, setAuthResolved]   = useState(false);
  const [resumeReviewAfterAuth, setResumeReviewAfterAuth] = useState(false);

  const service     = catalogServices.find((item) => item.id === selectedService);
  const isConsultationFollowUp = service?.slug === "follow-up-check-up" && Boolean(parentAppointmentId);
  const cartProducts = products.filter((item) => cartProductIds.includes(item.id));
  const cartTreatments = catalogServices.filter((item) => cartTreatmentIds.includes(item.id));
  const bookedTreatments = service ? [service, ...cartTreatments] : [];
  const selectedCategoryRecord = categories.find((item) => item.id === service?.category_id);
  const isConsultationOnly = selectedCategoryRecord?.slug === "consultations";
  const visibleTreatmentServices = catalogServices.filter((item) => categories.find((category) => category.id === item.category_id)?.slug !== "consultations" && (!selectedCategory || item.category_id === selectedCategory));
  const treatmentTotal = (service?.price || 0) + cartTreatments.reduce((sum, item) => sum + Number(item.price), 0);
  const packageTotal = cartProducts.reduce((sum, item) => sum + Number(item.price), 0);
  const cartItemCount = (service ? 1 : 0) + cartTreatments.length + cartProducts.length;
  const grandTotal = treatmentTotal + packageTotal;
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
        if (initialServiceSlug) {
          const initialService = (result.services as CatalogService[]).find((item) => item.slug === initialServiceSlug);
          const initialCategory = (result.categories as Category[]).find((item) => item.id === initialService?.category_id);
          if (initialService && initialCategory?.slug === "consultations") {
            setBookingType("consultation");
            setSelectedCategory(initialCategory.id);
            setSelectedService(initialService.id);
            setCartTreatmentIds([]);
            setCartProductIds([]);
          }
        } else if (initialCategoryHint) {
          const hint = initialCategoryHint.toLowerCase();
          const aliases = hint.includes("botox") || hint.includes("neuro") ? ["botox", "neurotoxin"]
            : hint.includes("filler") ? ["filler"]
            : hint.includes("skin booster") ? ["skin booster"]
            : hint.includes("laser") ? ["laser"]
            : hint.includes("facial") || hint.includes("skin treatment") ? ["facial", "skin treatment"]
            : hint.includes("iv") || hint.includes("wellness") ? ["iv", "wellness"]
            : [hint];
          const initialCategory = (result.categories as Category[]).find((item) => {
            const searchable = `${item.name} ${item.slug}`.toLowerCase().replaceAll("-", " ");
            return aliases.some((alias) => searchable.includes(alias));
          });
          setBookingType("treatment");
          setSelectedCategory(initialCategory?.id || null);
          setSelectedService(null);
          setCartTreatmentIds([]);
          setCartProductIds([]);
        }
      })
      .catch((error) => {
        setCategories(FALLBACK_CATALOG.categories);
        setCatalogServices(FALLBACK_CATALOG.services);
        setProducts(FALLBACK_CATALOG.products);
        setCatalogError(error instanceof Error ? error.message : "Showing a limited treatment list.");
      });
  }, [initialCategoryHint, initialServiceSlug]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setIsSignedIn(Boolean(data.session));
      if (data.session?.user.email) {
        setForm((current) => ({ ...current, email: data.session?.user.email || current.email }));
        fetch("/api/patient-profile", { headers: { Authorization: `Bearer ${data.session.access_token}` } })
          .then((response) => response.ok ? response.json() : null)
          .then((result) => {
            if (!active || !result?.profile) return;
            const profile = result.profile;
            const [firstName, ...lastName] = String(profile.full_name || "").trim().split(/\s+/);
            setForm((current) => ({ ...current,
              firstName: current.firstName || firstName || "", lastName: current.lastName || lastName.join(" "),
              phone: current.phone || profile.phone || "", dateOfBirth: current.dateOfBirth || profile.date_of_birth || "",
              address: current.address || profile.address || "", allergies: current.allergies || profile.allergies || "",
              medicalHistory: current.medicalHistory || profile.medical_history || "",
              currentMedications: current.currentMedications || profile.current_medications || "",
              emergencyContactName: current.emergencyContactName || profile.emergency_contact_name || "",
              emergencyContactPhone: current.emergencyContactPhone || profile.emergency_contact_phone || "",
            }));
          }).catch(() => undefined);
      }
      setAuthResolved(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session));
      if (session?.user.email) setForm((current) => ({ ...current, email: session.user.email || current.email }));
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(BOOKING_DRAFT_KEY);
        if (saved) {
          const draft = JSON.parse(saved);
          const savedStep = Math.min(Math.max(Number(draft.step) || 0, 0), 3);
          setStep(savedStep === 3 && draft.authenticated !== true ? 2 : savedStep);
          setResumeReviewAfterAuth(draft.resumeReviewAfterAuth === true);
          setBookingType(draft.bookingType === "consultation" || draft.bookingType === "treatment" ? draft.bookingType : null);
          setSelectedService(typeof draft.selectedService === "string" ? draft.selectedService : null);
          setSelectedCategory(typeof draft.selectedCategory === "string" ? draft.selectedCategory : null);
          setCartProductIds(Array.isArray(draft.cartProductIds) ? draft.cartProductIds : []);
          setCartTreatmentIds(Array.isArray(draft.cartTreatmentIds) ? draft.cartTreatmentIds : []);
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
    window.localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify({ step, bookingType, selectedService, selectedCategory, cartProductIds, cartTreatmentIds, form, selectedDate, selectedTime, authenticated: isSignedIn, resumeReviewAfterAuth }));
  }, [bookingType, cartProductIds, cartTreatmentIds, draftRestored, form, isSignedIn, resumeReviewAfterAuth, selectedCategory, selectedDate, selectedService, selectedTime, step]);

  useEffect(() => {
    if (!draftRestored || !authResolved || !isSignedIn || !resumeReviewAfterAuth) return;
    const frame = window.requestAnimationFrame(() => {
      setStep(3);
      setResumeReviewAfterAuth(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [authResolved, draftRestored, isSignedIn, resumeReviewAfterAuth]);

  useEffect(() => {
    if (!draftRestored || !authResolved || !isModal || isSignedIn || step !== 3) return;
    const frame = window.requestAnimationFrame(() => setStep(2));
    return () => window.cancelAnimationFrame(frame);
  }, [authResolved, draftRestored, isModal, isSignedIn, step]);

  useEffect(() => {
    if (!selectedDate) return;

    const controller = new AbortController();
    const date = new Date(selectedDate);
    const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    fetch(`/api/booking-availability?date=${isoDate}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load appointment availability.");
        const slots: BookingSlot[] = result.slots || [];
        setTimeSlots(slots);
        setAvailabilityHours(result.hours || "");
        setAvailabilityMessage(result.reason || "");
        setSelectedTime((current) => slots.some((slot) => slot.label === current && slot.status === "available") ? current : null);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTimeSlots([]);
        setAvailabilityMessage(error instanceof Error ? error.message : "Unable to load appointment availability.");
      })
      .finally(() => { if (!controller.signal.aborted) setAvailabilityLoading(false); });
    return () => controller.abort();
  }, [selectedDate]);

  const toggleProduct = (productId: string) => {
    setCartProductIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  };

  const toggleTreatment = (treatmentId: string) => {
    setCartTreatmentIds((current) => current.includes(treatmentId) ? current.filter((id) => id !== treatmentId) : [...current, treatmentId]);
  };

  const toggleCatalogTreatment = (treatmentId: string) => {
    if (treatmentId === selectedService) {
      const [nextPrimary, ...remaining] = cartTreatmentIds;
      setSelectedService(nextPrimary || null);
      setCartTreatmentIds(remaining);
      return;
    }
    if (cartTreatmentIds.includes(treatmentId)) {
      setCartTreatmentIds((current) => current.filter((id) => id !== treatmentId));
      return;
    }
    if (!selectedService) setSelectedService(treatmentId);
    else setCartTreatmentIds((current) => [...current, treatmentId]);
  };

  const treatmentIcon = (item: CatalogService) => {
    const slug = categories.find((category) => category.id === item.category_id)?.slug || "";
    if (slug.includes("laser")) return "fa-bolt";
    if (slug.includes("filler")) return "fa-droplet";
    if (slug.includes("botox") || slug.includes("neurotoxin")) return "fa-syringe";
    if (slug.includes("skin")) return "fa-spa";
    if (slug.includes("thread")) return "fa-link";
    if (slug.includes("mesolipo")) return "fa-weight-scale";
    return "fa-staff-snake";
  };

  const aftercareFor = (item: CatalogService) => {
    const category = categories.find((entry) => entry.id === item.category_id)?.slug || "";
    if (category.includes("laser")) return ["Keep the treated area clean and protected from direct sun.", "Use only the gentle products approved by the clinic.", "Contact the clinic for unexpected blistering or prolonged irritation."];
    if (category.includes("filler") || category.includes("botox") || category.includes("neurotoxin")) return ["Avoid rubbing, pressing, or massaging the treated area unless instructed.", "Avoid strenuous activity, alcohol, and excessive heat for the period advised.", "Contact the clinic immediately for severe pain, unusual discoloration, or vision changes."];
    if (category.includes("thread")) return ["Limit pressure and exaggerated facial movement as instructed.", "Keep entry points clean and follow the clinic sleeping-position guidance.", "Report increasing pain, swelling, discharge, or asymmetry promptly."];
    if (category.includes("skin")) return ["Use gentle skincare and avoid active ingredients until cleared.", "Apply sunscreen and avoid unnecessary heat or sun exposure.", "Follow the hydration and product instructions provided at discharge."];
    return ["Keep the treatment area clean and avoid unnecessary pressure.", "Avoid strenuous activity, heat, and unapproved products as advised.", "Follow the personalized aftercare sheet provided before leaving the clinic."];
  };

  const clearCart = () => {
    setSelectedService(null);
    setCartTreatmentIds([]);
    setCartProductIds([]);
  };

  const chooseBookingType = (type: BookingType) => {
    setBookingType(type);
    setCartTreatmentIds([]);
    setCartProductIds([]);
    if (type === "consultation") {
      const consultationCategory = categories.find((item) => item.slug === "consultations");
      const consultationService = catalogServices.find((item) => item.category_id === consultationCategory?.id && item.slug !== "follow-up-check-up");
      setSelectedCategory(consultationCategory?.id || null);
      setSelectedService(consultationService?.id || null);
    } else {
      setSelectedCategory(null);
      setSelectedService(null);
    }
  };

  function proceedToReview() {
    if (isModal && !isSignedIn) {
      setAuthPromptOpen(true);
      return;
    }
    setStep(3);
  }

  function continueWithAccount(mode: "signin" | "signup") {
    window.localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify({
      step: 2,
      bookingType,
      selectedService,
      selectedCategory,
      cartProductIds,
      cartTreatmentIds,
      form,
      selectedDate,
      selectedTime,
      authenticated: false,
      resumeReviewAfterAuth: true,
    }));
    router.push(`/auth?mode=${mode}&next=${encodeURIComponent("/dashboard/patient?view=book")}`);
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
        window.localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify({ step, bookingType, selectedService, selectedCategory, cartProductIds, cartTreatmentIds, form, selectedDate, selectedTime }));
        router.push(`/auth?next=${encodeURIComponent("/dashboard/patient?view=book")}`);
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
          dateOfBirth: form.dateOfBirth,
          address: form.address,
          emergencyContactName: form.emergencyContactName,
          emergencyContactPhone: form.emergencyContactPhone,
          chiefConcern: form.chiefConcern,
          treatmentGoals: form.treatmentGoals,
          allergies: form.allergies,
          currentMedications: form.currentMedications,
          medicalHistory: form.medicalHistory,
          pregnancyStatus: form.pregnancyStatus,
          previousReactions: form.previousReactions,
          recentProcedures: form.recentProcedures,
          intakeConfirmed: form.intakeConfirmed,
          notes: form.notes,
          consentAcknowledged: form.consentAcknowledged,
          serviceSlug: service.slug,
          bookingType,
          treatmentIds: isConsultationOnly ? [] : cartTreatmentIds,
          productIds: isConsultationOnly ? [] : cartProductIds,
          appointmentDate: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
          appointmentTime,
          parentAppointmentId: isConsultationFollowUp ? parentAppointmentId : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save the booking.");
      if (!result.requiresPayment) {
        window.localStorage.removeItem(BOOKING_DRAFT_KEY);
        router.push("/dashboard/patient?booking=confirmed");
        return;
      }
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
    <div className={embedded ? "bk-embedded" : isModal ? "bk-modal-inner" : "bk-standalone"}>
      {policyModal && <BookingPolicyModal type={policyModal} onClose={() => setPolicyModal(null)} />}
      {authPromptOpen && (
        <div className="bk-account-overlay" role="dialog" aria-modal="true" aria-labelledby="booking-account-title" onClick={(event) => event.target === event.currentTarget && setAuthPromptOpen(false)}>
          <section className="bk-account-card">
            <button type="button" className="bk-account-close" onClick={() => setAuthPromptOpen(false)} aria-label="Close account prompt"><i className="fa-solid fa-xmark" /></button>
            <span className="bk-account-icon"><i className="fa-solid fa-user-lock" /></span>
            <p className="bk-label">One last step</p>
            <h2 id="booking-account-title">Save your booking</h2>
            <p>Sign in or create a patient account to keep these treatment, date, time, and contact details. You’ll return directly to your booking review afterward.</p>
            <div className="bk-account-actions">
              <button type="button" className="bk-btn-primary" onClick={() => continueWithAccount("signin")}><i className="fa-solid fa-right-to-bracket" /><span>Sign in to continue</span></button>
              <div className="bk-account-divider"><span>or</span></div>
              <button type="button" className="bk-account-signup" onClick={() => continueWithAccount("signup")}><i className="fa-solid fa-user-plus" /><span>Create patient account</span></button>
            </div>
            <small><span className="bk-account-shield"><i className="fa-solid fa-shield-halved" /></span><span>Your treatment, schedule, and contact details will be ready after you sign in.</span></small>
          </section>
        </div>
      )}

      {/* ── Modal header bar ── */}
      {isModal && !embedded && (
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
      {!isModal && !embedded && (
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
              <span className="bk-panel-icon"><i className="fa-solid fa-kit-medical" /></span>
              <div>
                <h2 className="bk-panel-title">Choose Your Treatment</h2>
                <p className="bk-panel-sub">Select the service you&apos;d like to book with Dr. Kharyl Dence</p>
              </div>
            </div>

            <div className={`bk-service-catalog ${bookingType === "consultation" ? "is-consultation" : ""}`}>
              <div className="bk-booking-mode">
                <button type="button" disabled={!categories.length || !catalogServices.length} className={bookingType === "consultation" ? "selected" : ""} onClick={() => chooseBookingType("consultation")}>
                  <span><i className="fa-solid fa-user-doctor" /></span><div><small>Assessment only</small><strong>Consultation</strong><p>Meet Dr. Kharyl for evaluation and a personalized treatment plan.</p></div><i className="fa-solid fa-chevron-right" />
                </button>
                <button type="button" disabled={!categories.length || !catalogServices.length} className={bookingType === "treatment" ? "selected" : ""} onClick={() => chooseBookingType("treatment")}>
                  <span><i className="fa-solid fa-syringe" /></span><div><small>Book procedures</small><strong>Medical Treatment</strong><p>Select one or more treatments and add them to your appointment cart.</p></div><i className="fa-solid fa-chevron-right" />
                </button>
              </div>

              {bookingType === "treatment" && <section className="bk-treatment-catalog">
                <div className="bk-treatment-catalog-head"><div><span className="bk-label"><i className="fa-solid fa-kit-medical" /> Treatment catalog</span><p>Add one or more procedures to your appointment.</p></div><span>{cartTreatments.length + (service ? 1 : 0)} selected</span></div>
                <div className="bk-category-chips" role="group" aria-label="Filter treatment categories">
                  <button type="button" className={!selectedCategory ? "active" : ""} onClick={() => setSelectedCategory(null)}>All treatments</button>
                  {categories.filter((category) => category.slug !== "consultations").map((category) => <button type="button" key={category.id} className={selectedCategory === category.id ? "active" : ""} onClick={() => setSelectedCategory(category.id)}>{category.name}</button>)}
                </div>
                <div className="bk-catalog-card-grid">
                  {visibleTreatmentServices.map((item) => {
                    const primary = item.id === selectedService;
                    const added = primary || cartTreatmentIds.includes(item.id);
                    return <article key={item.id} className={`bk-catalog-card ${added ? "selected" : ""}`}>
                      <div className="bk-catalog-card-icon"><i className={`fa-solid ${treatmentIcon(item)}`} /></div>
                      <div className="bk-catalog-card-copy"><small>{categories.find((category) => category.id === item.category_id)?.name} · {item.subcategory}</small><strong>{item.name}</strong>{item.description && <p>{item.description}</p>}<span>{item.duration_mins && <><i className="fa-regular fa-clock" /> {item.duration_mins} min</>}<b>PHP {Number(item.price).toLocaleString()}</b></span></div>
                      <button type="button" className={added ? "is-added" : ""} onClick={() => toggleCatalogTreatment(item.id)}>{added ? <><i className="fa-solid fa-check" /> In cart</> : <><i className="fa-solid fa-plus" /> Add</>}</button>
                    </article>;
                  })}
                </div>
              </section>}
              {service && bookingType === "consultation" && (
                <div className="bk-selected-service bk-selected-service-summary">
                  <div><small className="bk-primary-label"><i className="fa-solid fa-star" /> Primary treatment</small><strong>{service.name}</strong>{service.description && <p>{service.description}</p>}</div>
                  <span>PHP {Number(service.price).toLocaleString()}{service.price_note && <small>{service.price_note}</small>}</span>
                </div>
              )}
              {catalogError && <p className="bk-form-error">{catalogError}</p>}
              {service && (isConsultationOnly ? (
                <div className="bk-consult-only"><i className="fa-solid fa-stethoscope" /><div><strong>Consultation-only appointment</strong><p>No cart or add-ons. This visit is reserved exclusively for assessment and treatment planning.</p><button type="button" onClick={() => setStep(1)}>Continue with consultation <i className="fa-solid fa-arrow-right" /></button></div></div>
              ) : null)}
              {products.length > 0 && service && !isConsultationOnly && (
                <details className="bk-package-drawer">
                  <summary><span><i className="fa-solid fa-gift" /> Optional packages</span><span className="bk-cart-count">{cartProducts.length} in cart</span></summary>
                  <div className="bk-products-grid">
                    {products.map((product) => {
                      const selected = cartProductIds.includes(product.id);
                      return <div key={product.id} className={`bk-product-card ${selected ? "selected" : ""}`}><div><small>{product.category} · {product.subcategory}</small><strong>{product.name}</strong><span>PHP {Number(product.price).toLocaleString()}</span>{product.description && <p>{product.description}</p>}</div><button type="button" onClick={() => toggleProduct(product.id)}>{selected ? "Remove" : "Add"}</button></div>;
                    })}
                  </div>
                </details>
              )}

              {bookingType === "treatment" && <aside className="bk-cart-panel" aria-label="Appointment cart">
                <div className="bk-cart-panel-head">
                  <div className="bk-cart-title"><span><i className="fa-solid fa-cart-shopping" /></span><div><strong>Your appointment cart</strong><small>{cartItemCount} item{cartItemCount === 1 ? "" : "s"}</small></div></div>
                  {service && <button type="button" className="bk-cart-clear" onClick={clearCart}>Clear</button>}
                </div>

                {!service ? <div className="bk-cart-empty"><i className="fa-solid fa-basket-shopping" /><strong>Your cart is empty</strong><p>Browse the treatment categories and add procedures to begin.</p></div> : <>
                  <div className="bk-cart-lines">
                    <div className="bk-cart-line bk-cart-line--primary">
                      <span className="bk-cart-line-icon"><i className="fa-solid fa-star" /></span>
                      <div><small>First treatment</small><strong>{service.name}</strong>{service.duration_mins && <span>{service.duration_mins} min</span>}</div>
                      <strong>₱{Number(service.price).toLocaleString()}</strong>
                    </div>
                    {cartTreatments.map((item) => <div className="bk-cart-line" key={item.id}>
                      <span className="bk-cart-line-icon"><i className={`fa-solid ${treatmentIcon(item)}`} /></span>
                      <div><small>Added treatment</small><strong>{item.name}</strong>{item.duration_mins && <span>{item.duration_mins} min</span>}</div>
                      <div className="bk-cart-line-end"><strong>₱{Number(item.price).toLocaleString()}</strong><button type="button" onClick={() => toggleTreatment(item.id)} aria-label={`Remove ${item.name}`}><i className="fa-solid fa-xmark" /></button></div>
                    </div>)}
                    {cartProducts.map((item) => <div className="bk-cart-line bk-cart-line--package" key={item.id}>
                      <span className="bk-cart-line-icon"><i className="fa-solid fa-gift" /></span>
                      <div><small>Package</small><strong>{item.name}</strong></div>
                      <div className="bk-cart-line-end"><strong>₱{Number(item.price).toLocaleString()}</strong><button type="button" onClick={() => toggleProduct(item.id)} aria-label={`Remove ${item.name}`}><i className="fa-solid fa-xmark" /></button></div>
                    </div>)}
                  </div>
                  {isConsultationOnly && <div className="bk-cart-consult-note"><i className="fa-solid fa-circle-info" /> Consultation-only visit</div>}
                  <div className="bk-cart-totals">
                    <div><span>Treatments</span><strong>₱{treatmentTotal.toLocaleString()}</strong></div>
                    {packageTotal > 0 && <div><span>Packages</span><strong>₱{packageTotal.toLocaleString()}</strong></div>}
                    <div className="bk-cart-grand"><span>Estimated total</span><strong>₱{grandTotal.toLocaleString()}</strong></div>
                  </div>
                  <button type="button" className="bk-cart-checkout" onClick={() => setStep(1)}><span>Continue</span><i className="fa-solid fa-arrow-right" /></button>
                  <p className="bk-cart-caption"><i className="fa-solid fa-shield-heart" /> Final eligibility is confirmed by the doctor.</p>
                </>}
              </aside>}
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
              <span className="bk-panel-icon"><i className="fa-solid fa-user" /></span>
              <div>
                <h2 className="bk-panel-title">Your Details</h2>
                <p className="bk-panel-sub">Tell us a bit about yourself so we can prepare for your visit</p>
              </div>
            </div>

            <div className="bk-details-intro">
              <span><i className="fa-solid fa-shield-halved" /></span>
              <div><strong>Private patient information</strong><small>Your details are used only to prepare and manage your clinic appointment.</small></div>
              <span className="bk-details-required"><i className="fa-solid fa-asterisk" /> Required fields</span>
            </div>

            <section className="bk-details-card">
              <div className="bk-details-section-head"><div><p>Contact information</p><small>We’ll use these details for appointment updates.</small></div><i className="fa-solid fa-address-card" /></div>
              <div className="bk-form-grid">
              {[
                { id: "b-first",  label: "First Name",     type: "text",  placeholder: "Maria",             key: "firstName", half: true,  icon: "fa-user" },
                { id: "b-last",   label: "Last Name",      type: "text",  placeholder: "Santos",            key: "lastName",  half: true,  icon: "fa-user" },
                { id: "b-email",  label: "Email Address",  type: "email", placeholder: "you@example.com",  key: "email",     half: false, icon: "fa-envelope" },
                { id: "b-phone",  label: "Phone Number",   type: "tel",   placeholder: "+63 9XX XXX XXXX", key: "phone",     half: false, icon: "fa-phone" },
              ].map((f) => (
                <div key={f.id} className={`bk-field ${f.half ? "bk-field-half" : "bk-field-full"}`}>
                  <label htmlFor={f.id} className="bk-label">
                    {f.label} <span className="bk-required">*</span>
                  </label>
                  <div className="bk-input-wrap">
                    <i className={`fa-solid ${f.icon} bk-input-icon`} />
                    <input
                      id={f.id}
                      type={f.type}
                      placeholder={f.placeholder}
                      value={form[f.key as keyof typeof form] as string}
                      onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="bk-input bk-input--icon"
                      readOnly={f.key === "email" && isSignedIn}
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
                <small className="bk-field-help">Share anything the doctor should know before your visit.</small>
              </div>
              </div>
            </section>

            <section className="bk-details-card bk-intake-card">
              <div className="bk-details-section-head"><div><p>Patient profile</p><small>Saved to your record and prefilled on your next booking.</small></div><i className="fa-solid fa-id-card" /></div>
              <div className="bk-form-grid">
                <div className="bk-field bk-field-half"><label className="bk-label" htmlFor="b-dob">Date of birth <span className="bk-required">*</span></label><input id="b-dob" className="bk-input" type="date" value={form.dateOfBirth} onChange={(e) => setForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))} required /></div>
                <div className="bk-field bk-field-half"><label className="bk-label" htmlFor="b-address">Address <span className="bk-optional">(optional)</span></label><input id="b-address" className="bk-input" value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} /></div>
                <div className="bk-field bk-field-half"><label className="bk-label" htmlFor="b-emergency-name">Emergency contact <span className="bk-optional">(optional)</span></label><input id="b-emergency-name" className="bk-input" placeholder="Full name" value={form.emergencyContactName} onChange={(e) => setForm((prev) => ({ ...prev, emergencyContactName: e.target.value }))} /></div>
                <div className="bk-field bk-field-half"><label className="bk-label" htmlFor="b-emergency-phone">Emergency contact number</label><input id="b-emergency-phone" className="bk-input" type="tel" value={form.emergencyContactPhone} onChange={(e) => setForm((prev) => ({ ...prev, emergencyContactPhone: e.target.value }))} /></div>
              </div>
            </section>

            <section className="bk-details-card bk-intake-card">
              <div className="bk-details-section-head"><div><p>{bookingType === "treatment" ? "Pre-treatment safety review" : "Visit preparation"}</p><small>Please review these answers for this appointment.</small></div><i className="fa-solid fa-heart-pulse" /></div>
              <div className="bk-form-grid">
                <div className="bk-field bk-field-full"><label className="bk-label" htmlFor="b-concern">Main concern <span className="bk-required">*</span></label><textarea id="b-concern" className="bk-textarea" rows={2} value={form.chiefConcern} onChange={(e) => setForm((prev) => ({ ...prev, chiefConcern: e.target.value }))} placeholder="What would you like the doctor to assess?" required /></div>
                <div className="bk-field bk-field-full"><label className="bk-label" htmlFor="b-goals">Goals or expected outcome <span className="bk-optional">(optional)</span></label><textarea id="b-goals" className="bk-textarea" rows={2} value={form.treatmentGoals} onChange={(e) => setForm((prev) => ({ ...prev, treatmentGoals: e.target.value }))} /></div>
                {bookingType === "treatment" && <>
                  <div className="bk-field bk-field-half"><label className="bk-label" htmlFor="b-allergies">Allergies <span className="bk-required">*</span></label><input id="b-allergies" className="bk-input" value={form.allergies} onChange={(e) => setForm((prev) => ({ ...prev, allergies: e.target.value }))} placeholder="Enter None if none known" required /></div>
                  <div className="bk-field bk-field-half"><label className="bk-label" htmlFor="b-medications">Current medications <span className="bk-required">*</span></label><input id="b-medications" className="bk-input" value={form.currentMedications} onChange={(e) => setForm((prev) => ({ ...prev, currentMedications: e.target.value }))} placeholder="Enter None if none" required /></div>
                  <div className="bk-field bk-field-full"><label className="bk-label" htmlFor="b-history">Relevant medical conditions <span className="bk-required">*</span></label><textarea id="b-history" className="bk-textarea" rows={2} value={form.medicalHistory} onChange={(e) => setForm((prev) => ({ ...prev, medicalHistory: e.target.value }))} placeholder="Enter None if none" required /></div>
                  <div className="bk-field bk-field-half"><label className="bk-label" htmlFor="b-pregnancy">Pregnancy / breastfeeding</label><select id="b-pregnancy" className="bk-input" value={form.pregnancyStatus} onChange={(e) => setForm((prev) => ({ ...prev, pregnancyStatus: e.target.value }))}><option value="prefer_not_to_say">Prefer not to say</option><option value="not_applicable">Not applicable</option><option value="no">No</option><option value="yes">Yes</option><option value="unsure">Unsure</option></select></div>
                  <div className="bk-field bk-field-half"><label className="bk-label" htmlFor="b-reactions">Previous treatment reactions</label><input id="b-reactions" className="bk-input" value={form.previousReactions} onChange={(e) => setForm((prev) => ({ ...prev, previousReactions: e.target.value }))} placeholder="Enter None if none" /></div>
                  <div className="bk-field bk-field-full"><label className="bk-label" htmlFor="b-recent">Recent procedures or treatments</label><input id="b-recent" className="bk-input" value={form.recentProcedures} onChange={(e) => setForm((prev) => ({ ...prev, recentProcedures: e.target.value }))} placeholder="Include approximate dates, if any" /></div>
                </>}
              </div>
              <label className="bk-intake-confirm"><input type="checkbox" checked={form.intakeConfirmed} onChange={(e) => setForm((prev) => ({ ...prev, intakeConfirmed: e.target.checked }))} /><span><strong>I reviewed this information</strong><small>These answers are accurate and current for this appointment.</small></span></label>
            </section>

            <section className="bk-agreement-card">
              <div className="bk-details-section-head"><div><p>Booking acknowledgement</p><small>Please review both items before continuing.</small></div><i className="fa-solid fa-file-signature" /></div>
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

              <label className="bk-consent-check" htmlFor="b-consent">
              <input id="b-consent" type="checkbox" checked={form.consentAcknowledged} onChange={(e) => setForm((prev) => ({ ...prev, consentAcknowledged: e.target.checked }))} />
              <span className="bk-consent-checkmark"><i className="fa-solid fa-check" /></span>
              <span className="bk-consent-copy"><strong>I agree to proceed with this booking</strong><small>I understand that this online acknowledgement is not the final medical consent. The clinic will review the procedure, risks, benefits, alternatives, and aftercare with me, and I will complete and sign the formal consent form in person before treatment.</small></span>
              </label>
            </section>

            <div className="bk-nav">
              <button type="button" id="step1-back" className="bk-btn-ghost" onClick={() => setStep(0)}>
                <i className="fa-solid fa-arrow-left" /> Back
              </button>
              <button
                type="button"
                id="step1-next"
                className="bk-btn-primary"
                disabled={!form.firstName || !form.lastName || !form.email || !form.phone || !form.dateOfBirth || !form.chiefConcern || !form.intakeConfirmed || (bookingType === "treatment" && (!form.allergies || !form.currentMedications || !form.medicalHistory)) || !form.agreed || !form.consentAcknowledged}
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
              <span className="bk-panel-icon"><i className="fa-solid fa-calendar-days" /></span>
              <div>
                <h2 className="bk-panel-title">Select Date & Time</h2>
                <p className="bk-panel-sub">Choose your preferred appointment slot with Dr. Kharyl Dence</p>
              </div>
            </div>

            <div className="bk-schedule-context">
              <div><span><i className="fa-solid fa-user-doctor" /></span><p>Doctor<strong>Dr. Kharyl Dence</strong></p></div>
              <div><span><i className="fa-solid fa-clock" /></span><p>Slot interval<strong>Every 1 hour</strong></p></div>
              <div><span><i className="fa-solid fa-location-dot" /></span><p>Location<strong>The Klinique CDO</strong></p></div>
            </div>

            <div className="bk-datetime-layout">
              {/* Calendar */}
              <div className="bk-calendar">
                <div className="bk-datetime-card-title"><span><i className="fa-regular fa-calendar" /></span><div><strong>Choose a date</strong><small>Select an open clinic day</small></div></div>
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
                        onClick={() => {
                          if (past) return;
                          setSelectedDate(dateStr);
                          setSelectedTime(null);
                          setTimeSlots([]);
                          setAvailabilityHours("");
                          setAvailabilityMessage("");
                          setAvailabilityLoading(true);
                        }}
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
                <div className="bk-datetime-card-title"><span><i className="fa-regular fa-clock" /></span><div><strong>Choose a time</strong><small>{availabilityHours ? `Clinic hours: ${availabilityHours}` : "Select a date to view availability"}</small></div></div>
                <div className="bk-slot-legend" aria-label="Time slot status legend">
                  <span><i className="available" /> Available</span>
                  <span><i className="unavailable" /> Not available</span>
                  <span><i className="past" /> Past</span>
                </div>
                {availabilityLoading && <p className="bk-availability-message"><i className="fa-solid fa-spinner fa-spin" /> Checking availability…</p>}
                {!availabilityLoading && availabilityMessage && <p className="bk-availability-message">{availabilityMessage}</p>}
                {!selectedDate && !availabilityLoading && <div className="bk-timeslots-empty"><span><i className="fa-regular fa-calendar" /></span><strong>No date selected</strong><small>Choose a date from the calendar to see hourly appointment slots.</small></div>}
                <div className="bk-timeslots-grid">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot.time}
                      id={`timeslot-${slot.time.replace(":", "-")}`}
                      type="button"
                      className={`bk-timeslot ${slot.status} ${selectedTime === slot.label ? "selected" : ""}`}
                      disabled={slot.status !== "available"}
                      onClick={() => setSelectedTime(slot.label)}
                    >
                      <span><i className="fa-regular fa-clock" /> {slot.label}</span>
                      <small>{slot.status === "available" ? "Available" : slot.status === "past" ? "Past" : "Not available"}</small>
                    </button>
                  ))}
                </div>
                {selectedDate && selectedTime && <div className="bk-selected-slot"><i className="fa-solid fa-circle-check" /><span>Your selected appointment<strong>{selectedDate} at {selectedTime}</strong></span></div>}
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
              <span className="bk-panel-icon"><i className="fa-solid fa-circle-check" /></span>
              <div>
                <h2 className="bk-panel-title">Review & Confirm</h2>
                <p className="bk-panel-sub">Please double-check your appointment details before confirming</p>
              </div>
            </div>

            <div className="bk-review-card">
              <div className="bk-review-overview">
                <div><span className="bk-review-status"><i className="fa-solid fa-qrcode" /> Ready for payment</span><h3>Your appointment summary</h3><p>{isConsultationFollowUp ? "Review the schedule before paying the full follow-up check-up fee." : "Review each section before paying the reservation fee that confirms your slot."}</p></div>
                <div className="bk-review-slot"><span>{selectedDate}</span><strong>{selectedTime}</strong></div>
              </div>
              {/* Service highlight */}
              <div className="bk-review-service-band">
                <div className="bk-review-service-icon">
                  <i className="fa-solid fa-kit-medical" />
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

              {cartTreatments.length > 0 && <div className="bk-review-cart">
                <div className="bk-review-cart-head"><span><i className="fa-solid fa-cart-shopping" /> Same-visit treatments</span><button type="button" onClick={() => setStep(0)}>Edit cart</button></div>
                {cartTreatments.map((item) => <div className="bk-review-cart-row" key={item.id}><span><i className="fa-solid fa-plus" /> {item.name}</span><strong>PHP {Number(item.price).toLocaleString()}</strong></div>)}
                <div className="bk-review-cart-total"><span>Treatment total</span><strong>PHP {treatmentTotal.toLocaleString()}</strong></div>
              </div>}

              {cartProducts.length > 0 && <div className="bk-review-cart bk-review-cart--packages">
                <div className="bk-review-cart-head"><span><i className="fa-solid fa-gift" /> Packages</span><button type="button" onClick={() => setStep(0)}>Edit packages</button></div>
                {cartProducts.map((item) => <div className="bk-review-cart-row" key={item.id}><span>{item.name}</span><strong>PHP {Number(item.price).toLocaleString()}</strong></div>)}
                <div className="bk-review-cart-total"><span>Package total</span><strong>PHP {packageTotal.toLocaleString()}</strong></div>
              </div>}

              <div className="bk-review-detail-grid">
                <section className="bk-review-section">
                  <div className="bk-review-section-head"><span><i className="fa-solid fa-calendar-check" /></span><div><p>Visit details</p><small>Schedule and clinic</small></div><button type="button" onClick={() => setStep(2)}>Edit</button></div>
                  <dl>
                    <div><dt>Date</dt><dd>{selectedDate}</dd></div>
                    <div><dt>Time</dt><dd>{selectedTime}</dd></div>
                    <div><dt>Doctor</dt><dd>Dr. Kharyl Dence, MD</dd></div>
                    <div><dt>Clinic</dt><dd>The Klinique · Cagayan de Oro</dd></div>
                  </dl>
                </section>
                <section className="bk-review-section">
                  <div className="bk-review-section-head"><span><i className="fa-solid fa-user" /></span><div><p>Patient details</p><small>Contact information</small></div><button type="button" onClick={() => setStep(1)}>Edit</button></div>
                  <dl>
                    <div><dt>Patient</dt><dd>{form.firstName} {form.lastName}</dd></div>
                    <div><dt>Email</dt><dd>{form.email}</dd></div>
                    <div><dt>Phone</dt><dd>{form.phone}</dd></div>
                    <div><dt>Consent</dt><dd><span className="bk-consent-status"><i className="fa-solid fa-check" /> Acknowledged</span></dd></div>
                    {form.notes && <div><dt>Notes</dt><dd>{form.notes}</dd></div>}
                  </dl>
                </section>
              </div>

              {bookingType === "treatment" && bookedTreatments.length > 0 && <section className="bk-aftercare">
                <div className="bk-aftercare-head"><span><i className="fa-solid fa-hand-holding-medical" /></span><div><p className="bk-reservation-eyebrow">Clinic-provided guidance</p><h3>Aftercare for your treatments</h3><p>Preview only. Dr. Kharyl and the clinic team will review and provide your final personalized aftercare instructions before you leave.</p></div></div>
                <div className="bk-aftercare-list">{bookedTreatments.map((item) => <details key={item.id}><summary><span><i className={`fa-solid ${treatmentIcon(item)}`} /> {item.name}</span><i className="fa-solid fa-chevron-down" /></summary><ul>{aftercareFor(item).map((instruction) => <li key={instruction}>{instruction}</li>)}</ul></details>)}</div>
                <div className="bk-aftercare-alert"><i className="fa-solid fa-phone-volume" /><span>For urgent or unexpected symptoms after treatment, contact The Klinique immediately and follow the emergency advice given by your doctor.</span></div>
              </section>}

              <div className="bk-review-notice">
                <i className="fa-solid fa-circle-info" />
                <span>
                  Your slot will be held as <strong>awaiting payment</strong>. It becomes confirmed automatically after PayMongo reports a successful QR Ph payment.
                </span>
              </div>
              <div className="bk-review-total">
                <div><span>Estimated treatment total</span><small>Final amount may change after the doctor’s assessment.</small></div>
                <strong>PHP {grandTotal.toLocaleString()}</strong>
              </div>
              <div className="bk-reservation-card">
                <div className="bk-reservation-icon"><i className="fa-solid fa-qrcode" /></div>
                <div>
                  <p className="bk-reservation-eyebrow">Required to confirm</p>
                  <h3>{isConsultationFollowUp ? "PHP 500 full follow-up fee" : `${RESERVATION_FEE_LABEL} reservation fee`}</h3>
                  <p>{isConsultationFollowUp ? "Securely pay the complete follow-up check-up fee via QR Ph with PayMongo." : "Securely pay via QR Ph with PayMongo. This amount is credited toward your clinic bill when you visit."}</p>
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
