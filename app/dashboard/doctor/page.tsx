"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoleAuth } from "@/lib/rbac";
import DashboardAccountMenu from "@/app/components/DashboardAccountMenu";
import StaffSettingsWorkspace from "@/app/components/StaffSettingsWorkspace";
import AppointmentNotifications from "@/app/components/AppointmentNotifications";
import DashboardInsights from "@/app/components/DashboardInsights";
import DoctorAppointmentWorkspace from "@/app/components/DoctorAppointmentWorkspace";
import LiveClinicStatus from "@/app/components/LiveClinicStatus";
import PatientRecordsWorkspace from "@/app/components/PatientRecordsWorkspace";
import ConsultationWorkspace from "@/app/components/ConsultationWorkspace";
import TreatmentWorkspace from "@/app/components/TreatmentWorkspace";
import DoctorScheduleManager from "@/app/components/DoctorScheduleManager";
import ClinicCalendar from "@/app/components/ClinicCalendar";
import WebsiteContentManager from "@/app/components/WebsiteContentManager";
import BlogBuilder from "@/app/components/BlogBuilder";
import StaffAppointmentModal from "@/app/components/StaffAppointmentModal";
import type { PatientRecord } from "@/lib/patients";
import { appointmentStatusLabel, fetchAppointments, updateAppointmentStatus, type Appointment, type AppointmentStatus } from "@/lib/appointments";
import { fetchRescheduleRequests, reviewRescheduleRequest, type RescheduleRequest } from "@/lib/rescheduleRequests";

type NavSection = "scheduling" | "clinical";
type DoctorView = "dashboard" | "calendar" | "website-content" | "blog-builder" | "availability" | "blocked-dates" | "all-appts" | "emr" | "consultations" | "treatments" | "rooms" | "profile" | "settings";

interface Booking extends Appointment {
  room: string;
}

export default function DoctorDashboard() {
  const router = useRouter();
  const { user, role, loading: authLoading } = useRoleAuth(["doctor", "superadmin"]);
  const [view, setView] = useState<DoctorView>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openSections, setOpenSections] = useState<NavSection[]>(["scheduling", "clinical"]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rescheduleRequests, setRescheduleRequests] = useState<RescheduleRequest[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  const [bookingPatient, setBookingPatient] = useState<PatientRecord | null>(null);
  const [dataError, setDataError] = useState("");
  const [clinicalAppointmentId, setClinicalAppointmentId] = useState<string | null>(null);

  const today    = new Date();
  const dayName  = today.toLocaleDateString("en-PH", { weekday: "long" });
  const dateStr  = today.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  const todayStr = today.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const todayBookings = bookings.filter((b) => b.date === todayKey);

  useEffect(() => {
    if (!authLoading) {
      const refresh = () => Promise.all([fetchAppointments(), fetchRescheduleRequests()])
          .then(([appointments, requests]) => { setBookings(appointments.map((appointment) => ({ ...appointment, room: "Clinic" }))); setRescheduleRequests(requests); })
          .catch((error) => setDataError(error.message));
      void refresh();
      const interval = window.setInterval(refresh, 10_000);
      return () => window.clearInterval(interval);
    }
  }, [authLoading]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    if (requestedView === "calendar" || requestedView === "website-content" || requestedView === "blog-builder" || requestedView === "all-appts" || requestedView === "availability" || requestedView === "blocked-dates" || requestedView === "profile" || requestedView === "settings") {
      window.history.replaceState({}, "", "/dashboard/doctor");
      queueMicrotask(() => setView(requestedView));
    }
  }, []);

  const openPatientBooking = (patient: PatientRecord) => {
    setBookingPatient(patient); setDataError("");
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

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    try {
      await updateAppointmentStatus(id, status);
      setBookings((prev) => prev.map((booking) => (booking.id === id ? { ...booking, status } : booking)));
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Unable to update appointment.");
    }
  };

  const handleReviewReschedule = async (requestId: string, decision: "approved" | "rejected") => {
    try {
      await reviewRescheduleRequest(requestId, decision);
      const [appointments, requests] = await Promise.all([fetchAppointments(), fetchRescheduleRequests()]);
      setBookings(appointments.map((appointment) => ({ ...appointment, room: "Clinic" })));
      setRescheduleRequests(requests);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Unable to review reschedule request.");
      throw error;
    }
  };

  const appointmentActions = (booking: Booking) => (
    <div className="dk-action-group">
      {booking.status === "pending" && <button type="button" className="dk-act-btn dk-act-complete" onClick={() => handleStatusChange(booking.id, "confirmed")}><i className="fa-solid fa-check" /> Confirm</button>}
      {booking.status === "confirmed" && <button type="button" className="dk-act-btn dk-act-complete" onClick={() => handleStatusChange(booking.id, "completed")}><i className="fa-solid fa-check-double" /> Complete</button>}
      {booking.status === "confirmed" && <button type="button" className="dk-act-btn" onClick={() => handleStatusChange(booking.id, "no_show")}><i className="fa-solid fa-user-slash" /> No show</button>}
      {(booking.status === "pending" || booking.status === "confirmed") && <button type="button" className="dk-act-btn" onClick={() => handleStatusChange(booking.id, "cancelled")}><i className="fa-solid fa-xmark" /> Cancel</button>}
    </div>
  );

  const doctorName =
    (user?.user_metadata?.full_name as string) || (role === "superadmin" ? "Super Administrator" : "Dr. Kharyl Dence");

  const stats = [
    { icon: "fa-calendar-day",   label: "Today's Procedures", value: todayBookings.length.toString(),                                    sub: "Scheduled today"       },
    { icon: "fa-hourglass-half", label: "Pending Intake",     value: bookings.filter((b) => b.status === "pending").length.toString(),   sub: "Awaiting confirmation" },
    { icon: "fa-circle-check",   label: "Completed",          value: bookings.filter((b) => b.status === "completed").length.toString(), sub: "This week"             },
    { icon: "fa-users",          label: "Total Patients",     value: bookings.length.toString(),                                         sub: "All time records"      },
  ];

  const rooms = [
    { icon: "fa-syringe",     name: "Suite 1 — Injectables",    cap: "1 patient · Botox / Fillers",   status: "Ready" },
    { icon: "fa-microscope",  name: "Suite 2 — Skin Lasers",     cap: "1 patient · Laser Resurfacing", status: "Ready" },
    { icon: "fa-droplet",     name: "Suite 3 — IV Therapy",      cap: "2 patients · Infusion Bay",     status: "Ready" },
    { icon: "fa-spa",         name: "Suite 4 — Facial Clinic",   cap: "1 patient · Facial Treatments", status: "Ready" },
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
      {bookingPatient && <StaffAppointmentModal patient={bookingPatient} onClose={() => setBookingPatient(null)} onCreated={async () => { const appointments=await fetchAppointments(); setBookings(appointments.map(appointment=>({...appointment,room:"Clinic"}))); }} />}

      {/* SIDEBAR */}
      <aside className="dk-sidebar" onClick={(event) => {
        if ((event.target as HTMLElement).closest(".dk-nav-item")) setMobileNavOpen(false);
      }}>
        <Link href="/" className="dk-logo" title="The Klinique Home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/the_klinique_logo-removebg-preview.png" alt="The Klinique" />
        </Link>

        <div className="dk-user-badge">
          <div className="dk-user-avatar black">
            {doctorName.split(" ").filter((w) => w.startsWith("Dr") || w.length > 2).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="dk-user-name">{doctorName}</p>
            <p className="dk-user-role">{role === "superadmin" ? "Super Administrator" : "Attending Physician"}</p>
          </div>
        </div>

        <nav className="dk-nav">
          <div className="dk-nav-section">
            <button type="button" id="nav-dashboard" className={`dk-nav-item ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}>
              <i className="fa-solid fa-table-columns" />
              Overview
            </button>
          </div>

          {/* Scheduling */}
          <div className="dk-nav-section">
            <button type="button" className="dk-nav-section-hdr" onClick={() => toggleSection("scheduling")}>
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-calendar-days" />
                Scheduling
              </span>
              <i className={`fa-solid fa-chevron-${openSections.includes("scheduling") ? "up" : "down"} dk-nav-chevron`} />
            </button>
            {openSections.includes("scheduling") && (
              <div className="dk-nav-items">
                {[
                  { key: "all-appts",  icon: "fa-list-check",       label: "All Appointments"    },
                  { key: "calendar", icon: "fa-calendar", label: "Calendar View" },
                  { key: "availability", icon: "fa-calendar-days", label: "Doctor Schedule"     },
                  { key: "blocked-dates", icon: "fa-calendar-xmark", label: "Blocked Dates"     },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    id={`nav-${item.key}`}
                    className={`dk-nav-item ${view === item.key ? "active" : ""}`}
                    onClick={() => setView(item.key as DoctorView)}
                  >
                    <i className={`fa-solid ${item.icon}`} />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clinical care */}
          <div className="dk-nav-section">
            <button type="button" className="dk-nav-section-hdr" onClick={() => toggleSection("clinical")}>
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-stethoscope" />
                Clinical Care
              </span>
              <i className={`fa-solid fa-chevron-${openSections.includes("clinical") ? "up" : "down"} dk-nav-chevron`} />
            </button>
            {openSections.includes("clinical") && (
              <div className="dk-nav-items">
                <button type="button" id="nav-consultations" className={`dk-nav-item ${view === "consultations" ? "active" : ""}`} onClick={() => setView("consultations")}><i className="fa-solid fa-comment-medical" /> Consultations</button>
                <button type="button" id="nav-treatments" className={`dk-nav-item ${view === "treatments" ? "active" : ""}`} onClick={() => setView("treatments")}><i className="fa-solid fa-syringe" /> Treatment Workspace</button>
                <button type="button" id="nav-rooms" className={`dk-nav-item ${view === "rooms" ? "active" : ""}`} onClick={() => setView("rooms")}><i className="fa-solid fa-door-open" /> Treatment Suites</button>
              </div>
            )}
          </div>

          <div className="dk-nav-section">
            <button type="button" id="nav-emr" className={`dk-nav-item ${view === "emr" ? "active" : ""}`} onClick={() => setView("emr")}>
              <i className="fa-solid fa-notes-medical" />
              Patient Records
            </button>
          </div>

          <div className="dk-nav-section">
            <button type="button" id="nav-website-content" className={`dk-nav-item ${view === "website-content" ? "active" : ""}`} onClick={() => setView("website-content")}>
              <i className="fa-solid fa-wand-magic-sparkles" />
              Website Content
            </button>
            <button type="button" id="nav-blog-builder" className={`dk-nav-item ${view === "blog-builder" ? "active" : ""}`} onClick={() => setView("blog-builder")}><i className="fa-solid fa-newspaper"/> Blog Builder</button>
          </div>

          <div className="dk-nav-section">
            <button type="button" id="nav-settings" className={`dk-nav-item ${view === "settings" || view === "profile" ? "active" : ""}`} onClick={() => setView("settings")}>
              <i className="fa-solid fa-sliders" />
              Clinic Settings
            </button>
          </div>

        </nav>

        <LiveClinicStatus onAction={() => setView("all-appts")} actionLabel="Open appointments" />

        <div className="dk-sidebar-foot">
          <p className="dk-email-label">Logged in as</p>
          <p className="dk-email-value">{user?.email || "doctor@theklinique.ph"}</p>
          <button type="button" id="doctor-signout-btn" className="dk-signout-btn" onClick={handleSignOut} disabled={signingOut}>
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
          <div>
            <p className="dk-workspace-eyebrow">The Klinique</p>
            <p className="dk-workspace-title">{view === "all-appts" ? "Manage Appointments" : view === "emr" ? "Patient Records" : view === "consultations" ? "Consultations" : view === "treatments" ? "Treatment Workspace" : "Doc Kharyl Workspace"}</p>
            <p style={{ fontSize: "0.7rem", color: "#9a7a84", marginTop: "0.1rem" }}>
              <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: "#16a34a", marginRight: "0.4rem", verticalAlign: "middle" }} />
              The Klinique · Cagayan de Oro · {dayName}, {dateStr}
            </p>
          </div>
          <div className="dk-topbar-actions">
            <AppointmentNotifications appointments={bookings} onOpenSchedule={() => setView("all-appts")} />
            <DashboardAccountMenu name={doctorName} role={role === "superadmin" ? "Super Administrator" : "Attending Physician"} email={user?.email} onSignOut={handleSignOut} signingOut={signingOut} onProfileClick={() => setView("profile")} onSettingsClick={() => setView("settings")} />
          </div>
        </header>

        <div className="dk-body">
          {dataError && <p className="bk-form-error" role="alert">{dataError}</p>}
          {view === "dashboard" && (
            <div className="dk-welcome-card dk-welcome-card--primary">
              <div>
                <p className="dk-welcome-label">Clinical overview</p>
                <p className="dk-welcome-title">Good day, {doctorName}</p>
                <p className="dk-welcome-sub">{todayBookings.length ? `${todayBookings.length} patient${todayBookings.length === 1 ? "" : "s"} scheduled today.` : "No patients scheduled today."} Review the queue and prepare treatment notes before each visit.</p>
              </div>
              <button type="button" className="dk-cta-btn" onClick={() => setView("emr")}><i className="fa-solid fa-user-check" /> Choose patient to book</button>
            </div>
          )}
          {view === "calendar" && <ClinicCalendar />}
          {view === "website-content" && <WebsiteContentManager />}
          {view === "blog-builder" && <BlogBuilder />}
          {view === "dashboard" && (
          <div className="dk-stats-grid dk-stats-grid--4col" style={{ marginBottom: "1.5rem" }}>
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
          )}

          {view === "dashboard" && <DashboardInsights appointments={bookings} role="doctor" />}

          {view === "dashboard" && <div className="dk-quick-grid" style={{ marginBottom: "1.5rem" }}>
            {[
              { icon: "fa-list-check", label: "All Appointments", action: () => setView("all-appts") },
              { icon: "fa-comment-medical", label: "Consultations", action: () => setView("consultations") },
              { icon: "fa-syringe", label: "Treatment Workspace", action: () => setView("treatments") },
              { icon: "fa-notes-medical", label: "Patient Records", action: () => setView("emr") },
            ].map((item) => <button type="button" className="dk-quick-card" key={item.label} onClick={item.action}><i className={`fa-solid ${item.icon} dk-quick-icon`} /><span className="dk-quick-label">{item.label}</span><i className="fa-solid fa-arrow-right dk-quick-arrow" /></button>)}
          </div>}

          {view === "dashboard" && (
            <>
              {bookings.length === 0 ? (
                <div className="dk-empty">
                  <div className="dk-empty-icon"><i className="fa-regular fa-calendar-xmark" /></div>
                  <h3>No consultations yet today</h3>
                  <p>Add a walk-in or scheduled patient to begin your clinical workflow.</p>
                  <button type="button" className="dk-cta-btn" style={{ marginTop: "0.5rem" }} onClick={() => setView("emr")}>
                    <i className="fa-solid fa-user-check" /> Choose Patient to Book
                  </button>
                </div>
              ) : (
                <div className="dk-panel">
                  <div className="dk-panel-hdr">
                    <div className="dk-panel-title-wrap">
                      <i className="fa-solid fa-calendar-day" />
                      <div>
                        <p className="dk-panel-title">Today&apos;s Patient Queue</p>
                        <p className="dk-panel-sub">{todayStr}</p>
                      </div>
                    </div>
                    <button type="button" className="dk-btn dk-btn-outline dk-btn-sm" onClick={() => setView("all-appts")}>
                      All appointments <i className="fa-solid fa-arrow-right" />
                    </button>
                  </div>
                  <div className="dk-table-wrap">
                    <table className="dk-table">
                      <thead>
                        <tr>
                          <th>Patient</th>
                          <th>Procedure</th>
                          <th>Time</th>
                          <th>Suite</th>
                          <th>Status</th>
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {todayBookings.map((b) => (
                          <tr key={b.id}>
                            <td>
                              <div className="dk-patient-cell">
                                <div className="dk-patient-avatar">
                                  {b.patient.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                </div>
                                <div>
                                  <p className="dk-cell-primary">{b.patient}</p>
                                  <p className="dk-cell-secondary">{b.referenceNo}</p>
                                </div>
                              </div>
                            </td>
                            <td style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.service}</td>
                            <td>{b.time}</td>
                            <td>{b.room}</td>
                            <td>
                              <span className={`dk-badge dk-badge-${b.status}`}>
                                <i className={`fa-solid ${b.status === "confirmed" ? "fa-circle-check" : b.status === "completed" ? "fa-award" : "fa-hourglass-half"}`} />
                                <span>{appointmentStatusLabel(b)}</span>
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {appointmentActions(b)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {(view === "availability" || view === "blocked-dates") && (
            <DoctorScheduleManager key={view} doctorName={doctorName} initialTab={view === "blocked-dates" ? "blocks" : "schedule"} />
          )}

          {/* All Appointments */}
          {view === "all-appts" && (
            <>
              <div className="dk-welcome-card ma-hero">
                <div>
                  <p className="dk-welcome-label">Appointments / Management</p>
                  <p className="dk-welcome-title">All bookings, one timeline</p>
                  <p className="dk-welcome-sub">Search, filter, review requests, and manage every The Klinique appointment by date.</p>
                </div>
                <div className="ma-hero-actions"><button type="button" className="dk-cta-btn" onClick={() => setView("emr")}><i className="fa-solid fa-user-check" /> Choose patient to book</button></div>
              </div>
              <DoctorAppointmentWorkspace appointments={bookings} onStatusChange={handleStatusChange} rescheduleRequests={rescheduleRequests} onReviewReschedule={handleReviewReschedule} onOpenClinicalWorkspace={(appointment) => { setClinicalAppointmentId(appointment.id); setView(appointment.serviceCategory === "consultations" ? "consultations" : "treatments"); }} />
            </>
          )}

          {/* Treatment Suites */}
          {view === "rooms" && (
            <>
              <div className="dk-welcome-card">
                <div>
                  <p className="dk-welcome-label">Facilities</p>
                  <p className="dk-welcome-title">Treatment Suites</p>
                  <p className="dk-welcome-sub">All suites sanitized and available for today&apos;s procedures.</p>
                </div>
              </div>
              <div className="dk-room-grid">
                {rooms.map((r) => (
                  <div key={r.name} className="dk-room-card">
                    <div className="dk-room-icon"><i className={`fa-solid ${r.icon}`} /></div>
                    <div>
                      <p className="dk-room-name">{r.name}</p>
                      <p className="dk-room-cap">{r.cap}</p>
                      <p className="dk-room-status">
                        <i className="fa-solid fa-circle" style={{ fontSize: "0.5rem", marginRight: "0.3rem" }} />
                        {r.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* EMR */}
          {view === "emr" && (
            <PatientRecordsWorkspace onBookPatient={openPatientBooking} />
          )}
          {view === "consultations" && <ConsultationWorkspace appointments={bookings} initialAppointmentId={clinicalAppointmentId} onOpenRecords={() => setView("emr")} onCompleted={async () => { const appointments = await fetchAppointments(); setBookings(appointments.map((appointment) => ({ ...appointment, room: "Clinic" }))); }} />}
          {view === "treatments" && <TreatmentWorkspace initialAppointmentId={clinicalAppointmentId} onCompleted={async () => { const appointments = await fetchAppointments(); setBookings(appointments.map((appointment) => ({ ...appointment, room: "Clinic" }))); }} />}
          {(view === "settings" || view === "profile") && <StaffSettingsWorkspace key={view} email={user?.email || ""} initialTab={view === "profile" ? "profile" : "general"} />}
        </div>
      </main>
    </div>
  );
}
