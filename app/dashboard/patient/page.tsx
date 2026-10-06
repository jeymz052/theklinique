"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoleAuth } from "@/lib/rbac";
import DashboardAccountMenu from "@/app/components/DashboardAccountMenu";
import AppointmentNotifications from "@/app/components/AppointmentNotifications";
import DashboardInsights from "@/app/components/DashboardInsights";
import { appointmentStatusLabel, cancelAppointment, fetchAppointments, type Appointment } from "@/lib/appointments";
import { createRescheduleRequest, fetchRescheduleRequests, type RescheduleRequest } from "@/lib/rescheduleRequests";
import BookingForm from "@/app/components/BookingForm";
import PatientAppointments from "@/app/components/PatientAppointments";
import LiveClinicStatus from "@/app/components/LiveClinicStatus";
import AccountHelpHub from "@/app/components/AccountHelpHub";
import PatientPaymentsPage from "@/app/components/PatientPaymentsPage";
import BasicSettingsWorkspace from "@/app/components/BasicSettingsWorkspace";
import ClinicCalendar from "@/app/components/ClinicCalendar";

type NavSection = "portal" | "appointments";
type PatientView = "overview" | "documents" | "history" | "book" | "my-appts" | "calendar" | "payments" | "account-help" | "profile" | "settings";

export default function PatientDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useRoleAuth(["patient"]);
  const [view, setView] = useState<PatientView>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openSections, setOpenSections] = useState<NavSection[]>(["portal", "appointments"]);
  const [signingOut, setSigningOut] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [rescheduleRequests, setRescheduleRequests] = useState<RescheduleRequest[]>([]);
  const [dataError, setDataError] = useState("");
  const [bookingNotice, setBookingNotice] = useState("");
  const [payingAppointmentId, setPayingAppointmentId] = useState<string | null>(null);
  const [bookingServiceSlug, setBookingServiceSlug] = useState<string | null>(null);
  const [bookingParentId, setBookingParentId] = useState<string | null>(null);

  const verifyReturnedPayment = useCallback(async function verifyPayment(appointmentId: string | null, attempt = 0) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch("/api/payments/reservation/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ appointmentId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to verify the reservation payment.");
      if (!result.confirmed) {
        if (attempt < 5) {
          setBookingNotice("Payment is processing. Checking PayMongo again…");
          window.setTimeout(() => void verifyPayment(appointmentId, attempt + 1), 3_000);
          return;
        }
        throw new Error("PayMongo has not marked this checkout as paid. Use Verify payment after the transaction appears as paid in PayMongo.");
      }
      setBookingNotice("Payment successful. Your appointment is confirmed.");
      const refreshed = await fetchAppointments();
      setAppointments(refreshed);
    } catch (error) {
      setBookingNotice(error instanceof Error ? error.message : "Unable to verify the reservation payment.");
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      const refresh = () => Promise.all([fetchAppointments(), fetchRescheduleRequests()])
        .then(([nextAppointments, nextRequests]) => { setAppointments(nextAppointments); setRescheduleRequests(nextRequests); setDataError(""); })
        .catch((error) => setDataError(error.message));
      void refresh();
      const interval = window.setInterval(refresh, 10_000);
      return () => window.clearInterval(interval);
    }
  }, [authLoading, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "profile" || params.get("view") === "settings") {
      const accountView = params.get("view") as "profile" | "settings";
      window.history.replaceState({}, "", "/dashboard/patient");
      queueMicrotask(() => setView(accountView));
    } else if (params.get("view") === "book") {
      const requestedService = params.get("service");
      const requestedParent = params.get("parent");
      window.history.replaceState({}, "", "/dashboard/patient");
      queueMicrotask(() => {
        setBookingServiceSlug(requestedService);
        setBookingParentId(requestedParent);
        setView("book");
      });
    } else if (params.get("payment") === "return") {
      window.history.replaceState({}, "", "/dashboard/patient");
      queueMicrotask(() => {
        setView("my-appts");
        setBookingNotice("Verifying your reservation payment with PayMongo…");
        void verifyReturnedPayment(params.get("appointment"));
      });
    } else if (params.get("payment") === "cancelled") {
      window.history.replaceState({}, "", "/dashboard/patient");
      queueMicrotask(() => {
        setView("my-appts");
        setBookingNotice("Payment was not completed. Your appointment is not confirmed yet.");
      });
    }
  }, [verifyReturnedPayment]);

  const resumeReservationPayment = async (appointmentId: string) => {
    setPayingAppointmentId(appointmentId);
    setDataError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch("/api/payments/reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ appointmentId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to start the reservation payment.");
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Unable to start the reservation payment.");
      setPayingAppointmentId(null);
    }
  };

  const verifyAppointmentPayment = (appointmentId: string) => {
    setBookingNotice("Verifying your reservation payment with PayMongo…");
    void verifyReturnedPayment(appointmentId);
  };

  const handleCancelAppointment = async (appointmentId: string, reason: string) => {
    await cancelAppointment(appointmentId, reason);
    const [nextAppointments, nextRequests] = await Promise.all([fetchAppointments(), fetchRescheduleRequests()]);
    setAppointments(nextAppointments); setRescheduleRequests(nextRequests);
    setBookingNotice("Your appointment was cancelled. The clinic has been notified.");
  };

  const handleRescheduleAppointment = async (appointmentId: string, date: string, time: string, reason: string) => {
    await createRescheduleRequest(appointmentId, date, time, reason);
    setRescheduleRequests(await fetchRescheduleRequests());
    setBookingNotice("Your reschedule request was sent to Dr. Kharyl. Your original schedule remains confirmed until it is approved.");
  };

  const toggleSection = (s: NavSection) =>
    setOpenSections((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/signin");
  };


  const patientDisplayName =
    (user?.user_metadata?.full_name as string) ||
    (user?.email ? user.email.split("@")[0] : "Patient");

  const upcomingAppointments = appointments.filter((appointment) => appointment.status === "confirmed" && appointment.date >= new Date().toISOString().slice(0, 10));
  const stats = [
    { icon: "fa-calendar-check",  label: "Appointments",    value: String(appointments.length), sub: `${upcomingAppointments.length} upcoming` },
    { icon: "fa-notes-medical",   label: "Released Notes",  value: "0", sub: "Allowed by doctor"    },
    { icon: "fa-prescription",    label: "Prescriptions",   value: "0", sub: "Open in documents"    },
    { icon: "fa-file-invoice",    label: "Billing Records", value: String(appointments.length), sub: "Appointment receipts" },
  ];

  if (authLoading) {
    return (
      <div className="dk-loading">
        <i className="fa-solid fa-spinner fa-spin fa-2x" />
      </div>
    );
  }

  return (
    <div className={`dk-root ${mobileNavOpen ? "mobile-nav-open" : ""}`}>
      <button type="button" className="dk-mobile-nav-overlay" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
      {/* SIDEBAR */}
      <aside className="dk-sidebar" onClick={(event) => {
        if ((event.target as HTMLElement).closest(".dk-nav-item")) setMobileNavOpen(false);
      }}>
        <Link href="/" className="dk-logo" title="Back to home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/the_klinique_logo-removebg-preview.png" alt="The Klinique" />
        </Link>

        <div className="dk-user-badge">
          <div className="dk-user-avatar pink">
            {patientDisplayName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="dk-user-name">{patientDisplayName}</p>
            <p className="dk-user-role">Patient</p>
          </div>
        </div>

        <nav className="dk-nav">
          {/* Patient Portal */}
          <div className="dk-nav-section">
            <button type="button" className="dk-nav-section-hdr" onClick={() => toggleSection("portal")}>
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-house-medical" />
                Patient Portal
              </span>
              <i className={`fa-solid fa-chevron-${openSections.includes("portal") ? "up" : "down"} dk-nav-chevron`} />
            </button>
            {openSections.includes("portal") && (
              <div className="dk-nav-items">
                {[
                  { key: "overview",  icon: "fa-table-columns",    label: "Portal Overview"      },
                  { key: "documents", icon: "fa-file-medical",      label: "Medical Documents"    },
                  { key: "history",   icon: "fa-clock-rotate-left", label: "Consultation History" },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    id={`nav-${item.key}`}
                    className={`dk-nav-item ${view === item.key ? "active" : ""}`}
                    onClick={() => setView(item.key as PatientView)}
                  >
                    <i className={`fa-solid ${item.icon}`} />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Appointments */}
          <div className="dk-nav-section">
            <button type="button" className="dk-nav-section-hdr" onClick={() => toggleSection("appointments")}>
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-calendar-days" />
                Appointments
              </span>
              <i className={`fa-solid fa-chevron-${openSections.includes("appointments") ? "up" : "down"} dk-nav-chevron`} />
            </button>
            {openSections.includes("appointments") && (
              <div className="dk-nav-items">
                <button type="button" id="nav-book" className={`dk-nav-item dk-nav-item--book ${view === "book" ? "active" : ""}`} onClick={() => setView("book")}>
                  <i className="fa-solid fa-calendar-plus" />
                  Book Appointment
                </button>
                <button
                  type="button"
                  id="nav-my-appts"
                  className={`dk-nav-item ${view === "my-appts" ? "active" : ""}`}
                  onClick={() => setView("my-appts")}
                >
                  <i className="fa-solid fa-list-check" />
                  My Appointments
                </button>
                <button type="button" className={`dk-nav-item ${view === "calendar" ? "active" : ""}`} onClick={() => setView("calendar")}><i className="fa-solid fa-calendar" /> Calendar View</button>
              </div>
            )}
          </div>

          <div className="dk-nav-section">
            <button type="button" className={`dk-nav-section-hdr dk-nav-section-hdr--solo ${view === "payments" ? "active" : ""}`} onClick={() => setView("payments")}>
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-credit-card" />
                Online Payments
              </span>
            </button>
          </div>

          <div className="dk-nav-section">
            <button type="button" className={`dk-nav-section-hdr dk-nav-section-hdr--solo ${view === "account-help" ? "active" : ""}`} onClick={() => setView("account-help")}>
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-circle-question" />
                Account &amp; Help
              </span>
            </button>
          </div>

          <div className="dk-nav-section">
            <button type="button" className={`dk-nav-section-hdr dk-nav-section-hdr--solo ${view === "settings" || view === "profile" ? "active" : ""}`} onClick={() => setView("settings")}>
              <span className="dk-nav-section-label"><i className="fa-solid fa-gear" /> Settings</span>
            </button>
          </div>
        </nav>

        <LiveClinicStatus onAction={() => setView("book")} />

        <div className="dk-sidebar-foot">
          <p className="dk-email-label">Signed in as</p>
          <p className="dk-email-value">{user?.email || "patient@theklinique.ph"}</p>
          <button type="button" id="patient-signout-btn" className="dk-signout-btn" onClick={handleSignOut} disabled={signingOut}>
            <i className="fa-solid fa-arrow-right-from-bracket" />
            {signingOut ? "Signing out…" : "Sign Out"}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="dk-main">
        <header className="dk-topbar">
          <button type="button" className="dk-mobile-menu-trigger" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>
            <i className="fa-solid fa-bars" />
          </button>
          <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0d0d0d" }}>Workspace</p>
          <div className="dk-topbar-actions">
            <AppointmentNotifications />
            <DashboardAccountMenu name={patientDisplayName} role="Patient" email={user?.email} onSignOut={handleSignOut} signingOut={signingOut} onProfileClick={() => setView("profile")} onSettingsClick={() => setView("settings")} />
          </div>
        </header>

        <div className="dk-body">
          {dataError && view !== "book" && <p className="bk-form-error" role="alert">{dataError}</p>}
          {bookingNotice && <div className="dk-booking-notice" role="status"><i className="fa-solid fa-circle-info" /><span>{bookingNotice}</span><button type="button" onClick={() => setBookingNotice("")} aria-label="Dismiss"><i className="fa-solid fa-xmark" /></button></div>}
          {!dismissedBanner && view !== "book" && (
            <div className="dk-notice-banner">
              <div className="dk-notice-left">
                <div className="dk-notice-icon"><i className="fa-solid fa-triangle-exclamation" /></div>
                <div>
                  <p className="dk-notice-title">Walk-ins not accepted — <strong>By Appointment Only</strong></p>
                  <p className="dk-notice-sub">
                    The Klinique operates strictly by appointment. Book online or contact us to schedule your visit.{" "}
                    <button className="dk-notice-link" onClick={() => setView("book")}>Book now ?</button>
                  </p>
                </div>
              </div>
              <button className="dk-notice-close" onClick={() => setDismissedBanner(true)} aria-label="Dismiss">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          )}

          {view === "overview" && (
            <>
              <div className="dk-welcome-card">
                <div>
                  <p className="dk-welcome-label">Patient Portal</p>
                  <p className="dk-welcome-title">Welcome, {patientDisplayName}</p>
                  <p className="dk-welcome-sub">Your appointments, records, prescriptions, and bills live here in one clean overview.</p>
                </div>
                <div className="dk-status-badge">
                  <i className="fa-solid fa-circle-check" /> Everything is up to date
                </div>
              </div>

              <div className="dk-stats-grid dk-stats-grid--4col">
                {stats.map((s) => (
                  <div key={s.label} className="dk-stat-card">
                    <div className="dk-stat-card-top">
                      <p className="dk-stat-label">{s.label.toUpperCase()}</p>
                      <span className="dk-stat-icon"><i className={`fa-solid ${s.icon}`} /></span>
                    </div>
                    <p className="dk-stat-value">{s.value}</p>
                    <p className="dk-stat-sub">{s.sub}</p>
                  </div>
                ))}
              </div>

              <DashboardInsights appointments={appointments} role="patient" />

              <div className="dk-panel" style={{ marginBottom: "1.5rem" }}>
                <div className="dk-panel-hdr">
                  <div className="dk-panel-title-wrap">
                    <i className="fa-solid fa-calendar-day" />
                    <div>
                      <p className="dk-panel-title">Your Next Appointment</p>
                      <p className="dk-panel-sub">A single glance to see what comes next.</p>
                    </div>
                  </div>
                  <button className="dk-btn dk-btn-outline dk-btn-sm" onClick={() => setView("my-appts")}>
                    View all appointments ?
                  </button>
                </div>
                <div className="dk-panel-body">
                  {upcomingAppointments.length ? (
                    <div className="dk-info-block">
                      <p className="dk-info-block-title">{upcomingAppointments[0].service}</p>
                      <div className="dk-info-row"><span>Date</span><strong>{upcomingAppointments[0].date}</strong></div>
                      <div className="dk-info-row"><span>Time</span><strong>{upcomingAppointments[0].time}</strong></div>
                      <div className="dk-info-row"><span>Reference</span><strong>{upcomingAppointments[0].referenceNo}</strong></div>
                      <div className="dk-info-row"><span>Status</span><span className={`dk-badge dk-badge-${upcomingAppointments[0].status}`}>{appointmentStatusLabel(upcomingAppointments[0])}</span></div>
                    </div>
                  ) : <div className="dk-empty">
                    <div className="dk-empty-icon"><i className="fa-regular fa-calendar-xmark" /></div>
                    <h3>No upcoming appointments</h3>
                    <p>Book your next appointment when you&apos;re ready.</p>
                    <button type="button" className="dk-cta-btn" style={{ marginTop: "0.5rem" }} onClick={() => setView("book")}>
                      <i className="fa-solid fa-calendar-plus" /> Book appointment
                    </button>
                  </div>}
                </div>
              </div>

              <div className="dk-cta-strip">
                <div className="dk-cta-strip-left">
                  <i className="fa-solid fa-calendar-plus dk-cta-strip-icon" />
                  <div>
                    <p className="dk-cta-title">Ready for your next treatment?</p>
                    <p className="dk-cta-sub">Book with Dr. Kharyl · The Klinique · Cagayan de Oro</p>
                  </div>
                </div>
                <button type="button" id="overview-book-btn" className="dk-cta-btn" onClick={() => setView("book")}>
                  <i className="fa-solid fa-calendar-plus" /> Book Appointment
                </button>
              </div>

              <div className="dk-quick-grid">
                {[
                  { icon: "fa-file-medical",      label: "Medical Documents",    action: () => setView("documents") },
                  { icon: "fa-clock-rotate-left", label: "Consultation History", action: () => setView("history")   },
                  { icon: "fa-calendar-plus",     label: "Book Appointment",     action: () => setView("book")      },
                  { icon: "fa-list-check",        label: "My Appointments",      action: () => setView("my-appts")  },
                ].map((q) => (
                  <button key={q.label} className="dk-quick-card" onClick={q.action}>
                    <i className={`fa-solid ${q.icon} dk-quick-icon`} />
                    <span className="dk-quick-label">{q.label}</span>
                    <i className="fa-solid fa-arrow-right dk-quick-arrow" />
                  </button>
                ))}
              </div>
            </>
          )}

          {view === "my-appts" && (
            <>
              <div className="dk-welcome-card">
                <div>
                  <p className="dk-welcome-label">Appointments</p>
                  <p className="dk-welcome-title">Book and manage visits in one place</p>
                  <p className="dk-welcome-sub">Your upcoming and past bookings with Dr. Kharyl at The Klinique.</p>
                </div>
                <button type="button" className="dk-cta-btn" onClick={() => setView("book")}>
                  <i className="fa-solid fa-calendar-plus" /> Book Now
                </button>
              </div>
              <PatientAppointments appointments={appointments} payingAppointmentId={payingAppointmentId} onPay={resumeReservationPayment} onVerify={verifyAppointmentPayment} onBook={() => setView("book")} rescheduleRequests={rescheduleRequests} onCancel={handleCancelAppointment} onReschedule={handleRescheduleAppointment} />
            </>
          )}
          {view === "calendar" && <ClinicCalendar />}

          {view === "documents" && (
            <>
              <div className="dk-welcome-card">
                <div>
                  <p className="dk-welcome-label">Documents</p>
                  <p className="dk-welcome-title">Medical Documents</p>
                  <p className="dk-welcome-sub">Consents, prescriptions and clinical files shared by Dr. Kharyl.</p>
                </div>
              </div>
              <div className="dk-empty">
                <div className="dk-empty-icon"><i className="fa-regular fa-folder-open" /></div>
                <h3>No documents yet</h3>
                <p>Documents released by your doctor will appear here after your first visit.</p>
              </div>
            </>
          )}

          {view === "history" && (
            <>
              <div className="dk-welcome-card">
                <div>
                  <p className="dk-welcome-label">History</p>
                  <p className="dk-welcome-title">Consultation History</p>
                  <p className="dk-welcome-sub">Your complete treatment log and aftercare notes.</p>
                </div>
              </div>
              <div className="dk-empty">
                <div className="dk-empty-icon"><i className="fa-regular fa-clock" /></div>
                <h3>No history yet</h3>
                <p>Completed consultations will appear here after your first visit.</p>
              </div>
            </>
          )}

          {view === "payments" && <PatientPaymentsPage payingId={payingAppointmentId} onPay={resumeReservationPayment} onVerify={verifyAppointmentPayment} />}

          {view === "account-help" && <AccountHelpHub profileHref="/dashboard/patient?view=profile" settingsHref="/dashboard/patient?view=settings" />}

          {(view === "settings" || view === "profile") && <BasicSettingsWorkspace key={view} email={user?.email} initialTab={view === "profile" ? "profile" : "general"} />}

          {view === "book" && (
            <>
              <section className="dk-booking-heading" aria-labelledby="patient-booking-title">
                <div>
                  <p className="dk-welcome-label">Book Appointment</p>
                  <h1 id="patient-booking-title">Schedule your clinic visit</h1>
                  <p>Choose your treatments, select an available schedule, and confirm your reservation.</p>
                </div>
                <span className="dk-booking-type"><i className="fa-solid fa-hospital" /> Clinic Visit</span>
              </section>
              <section className="dk-embedded-booking" aria-label="Appointment booking form">
                <BookingForm embedded initialServiceSlug={bookingServiceSlug} parentAppointmentId={bookingParentId} />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
