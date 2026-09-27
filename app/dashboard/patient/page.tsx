"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoleAuth } from "@/lib/rbac";
import DashboardAccountMenu from "@/app/components/DashboardAccountMenu";
import { fetchAppointments, type Appointment } from "@/lib/appointments";

type NavSection = "portal" | "appointments";
type PatientView = "overview" | "documents" | "history" | "messages" | "my-appts";

export default function PatientDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useRoleAuth(["patient", "doctor", "superadmin"]);
  const [view, setView] = useState<PatientView>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openSections, setOpenSections] = useState<NavSection[]>(["portal", "appointments"]);
  const [signingOut, setSigningOut] = useState(false);
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    if (!authLoading) fetchAppointments().then(setAppointments).catch((error) => setDataError(error.message));
  }, [authLoading]);

  const toggleSection = (s: NavSection) =>
    setOpenSections((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/signin");
  };

  const today = new Date();
  const dayName = today.toLocaleDateString("en-PH", { weekday: "long" });
  const dateStr = today.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

  const patientDisplayName =
    (user?.user_metadata?.full_name as string) ||
    (user?.email ? user.email.split("@")[0] : "Patient");

  const upcomingAppointments = appointments.filter((appointment) => appointment.status !== "cancelled" && appointment.date >= new Date().toISOString().slice(0, 10));
  const stats = [
    { icon: "fa-calendar-check",  label: "Appointments",    value: String(appointments.length), sub: `${upcomingAppointments.length} upcoming` },
    { icon: "fa-notes-medical",   label: "Released Notes",  value: "0", sub: "Allowed by doctor"    },
    { icon: "fa-prescription",    label: "Prescriptions",   value: "0", sub: "Open in documents"    },
    { icon: "fa-folder-open",     label: "Documents",       value: "0", sub: "Consents and files"   },
    { icon: "fa-file-invoice",    label: "Billing Records", value: "0", sub: "Receipts and balances" },
    { icon: "fa-paper-plane",     label: "Follow-Ups",      value: "0", sub: "Questions and replies" },
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
            <button className="dk-nav-section-hdr" onClick={() => toggleSection("portal")}>
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
                  { key: "messages",  icon: "fa-comment-medical",   label: "Follow-up Messages"   },
                ].map((item) => (
                  <button
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

          <div className="dk-nav-section">
            <button className="dk-nav-section-hdr dk-nav-section-hdr--solo">
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-envelope" />
                Messages
              </span>
              <span className="dk-nav-pill">0</span>
            </button>
          </div>

          {/* Appointments */}
          <div className="dk-nav-section">
            <button className="dk-nav-section-hdr" onClick={() => toggleSection("appointments")}>
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-calendar-days" />
                Appointments
              </span>
              <i className={`fa-solid fa-chevron-${openSections.includes("appointments") ? "up" : "down"} dk-nav-chevron`} />
            </button>
            {openSections.includes("appointments") && (
              <div className="dk-nav-items">
                <button id="nav-book" className="dk-nav-item dk-nav-item--book" onClick={() => router.push("/booking")}>
                  <i className="fa-solid fa-calendar-plus" />
                  Book Appointment
                </button>
                <button
                  id="nav-my-appts"
                  className={`dk-nav-item ${view === "my-appts" ? "active" : ""}`}
                  onClick={() => setView("my-appts")}
                >
                  <i className="fa-solid fa-list-check" />
                  My Appointments
                </button>
              </div>
            )}
          </div>

          <div className="dk-nav-section">
            <button className="dk-nav-section-hdr dk-nav-section-hdr--solo">
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-credit-card" />
                Online Payments
              </span>
              <i className="fa-solid fa-chevron-right dk-nav-chevron" />
            </button>
          </div>

          <div className="dk-nav-section">
            <button className="dk-nav-section-hdr dk-nav-section-hdr--solo">
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-circle-question" />
                Account &amp; Help
              </span>
              <i className="fa-solid fa-chevron-right dk-nav-chevron" />
            </button>
          </div>
        </nav>

        <div className="dk-availability">
          <p className="dk-availability-title">
            <i className="fa-solid fa-circle dk-availability-dot" />
            Available Today
          </p>
          <div className="dk-avail-item">
            <div className="dk-avail-icon"><i className="fa-solid fa-house-chimney-medical" /></div>
            <div>
              <p className="dk-avail-name">In-Person Clinic</p>
              <p className="dk-avail-hours">9:00 AM – 5:00 PM</p>
              <p className="dk-avail-open"><i className="fa-solid fa-circle" style={{ fontSize: "0.45rem" }} /> Open Now</p>
            </div>
          </div>
          <div className="dk-avail-item">
            <div className="dk-avail-icon"><i className="fa-solid fa-video" /></div>
            <div>
              <p className="dk-avail-name">Virtual Consult</p>
              <p className="dk-avail-hours">8:00 AM – 8:00 PM</p>
              <p className="dk-avail-open"><i className="fa-solid fa-circle" style={{ fontSize: "0.45rem" }} /> Open Now</p>
            </div>
          </div>
          <p className="dk-avail-day">{dayName}, {dateStr}</p>
        </div>

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
          <DashboardAccountMenu name={patientDisplayName} role="Patient" email={user?.email} onSignOut={handleSignOut} signingOut={signingOut} />
        </header>

        <div className="dk-body">
          {dataError && <p className="bk-form-error" role="alert">{dataError}</p>}
          {!dismissedBanner && (
            <div className="dk-notice-banner">
              <div className="dk-notice-left">
                <div className="dk-notice-icon"><i className="fa-solid fa-triangle-exclamation" /></div>
                <div>
                  <p className="dk-notice-title">Walk-ins not accepted — <strong>By Appointment Only</strong></p>
                  <p className="dk-notice-sub">
                    The Klinique operates strictly by appointment. Book online or contact us to schedule your visit.{" "}
                    <button className="dk-notice-link" onClick={() => router.push("/booking")}>Book now ?</button>
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
                  <p className="dk-welcome-sub">Your appointment, records, prescriptions, bills, and messages live here in one clean overview.</p>
                </div>
                <div className="dk-status-badge">
                  <i className="fa-solid fa-circle-check" /> Everything is up to date
                </div>
              </div>

              <div className="dk-stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                {stats.map((s) => (
                  <div key={s.label} className="dk-stat-card">
                    <div className="dk-stat-card-top">
                      <p className="dk-stat-label">{s.label.toUpperCase()}</p>
                      <i className={`fa-solid ${s.icon} dk-stat-icon`} />
                    </div>
                    <p className="dk-stat-value">{s.value}</p>
                    <p className="dk-stat-sub">{s.sub}</p>
                  </div>
                ))}
              </div>

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
                  <div className="dk-empty">
                    <div className="dk-empty-icon"><i className="fa-regular fa-calendar-xmark" /></div>
                    <h3>No upcoming appointments</h3>
                    <p>Book your next appointment when you&apos;re ready.</p>
                    <button type="button" className="dk-cta-btn" style={{ marginTop: "0.5rem" }} onClick={() => router.push("/booking")}>
                      <i className="fa-solid fa-calendar-plus" /> Book appointment
                    </button>
                  </div>
                </div>
              </div>

              <div className="dk-cta-strip">
                <div className="dk-cta-strip-left">
                  <i className="fa-solid fa-calendar-plus dk-cta-strip-icon" />
                  <div>
                    <p className="dk-cta-title">Ready for your next treatment?</p>
                    <p className="dk-cta-sub">Book with Dr. Kharyl Dence · The Klinique · Cagayan de Oro</p>
                  </div>
                </div>
                <button type="button" id="overview-book-btn" className="dk-cta-btn" onClick={() => router.push("/booking")}>
                  <i className="fa-solid fa-calendar-plus" /> Book Appointment
                </button>
              </div>

              <div className="dk-quick-grid">
                {[
                  { icon: "fa-file-medical",      label: "Medical Documents",    action: () => setView("documents") },
                  { icon: "fa-clock-rotate-left", label: "Consultation History", action: () => setView("history")   },
                  { icon: "fa-comment-medical",   label: "Follow-up Messages",   action: () => setView("messages")  },
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
                  <p className="dk-welcome-sub">Your upcoming and past bookings with Dr. Kharyl Dence at The Klinique.</p>
                </div>
                <button type="button" className="dk-cta-btn" onClick={() => router.push("/booking")}>
                  <i className="fa-solid fa-calendar-plus" /> Book Now
                </button>
              </div>
              <div className="dk-empty">
                <div className="dk-empty-icon"><i className="fa-regular fa-calendar-xmark" /></div>
                <h3>No appointments yet</h3>
                <p>Book your first treatment at The Klinique to get started.</p>
                <button type="button" className="dk-cta-btn" style={{ marginTop: "0.5rem" }} onClick={() => router.push("/booking")}>
                  <i className="fa-solid fa-calendar-plus" /> Book Appointment
                </button>
              </div>
            </>
          )}

          {view === "documents" && (
            <>
              <div className="dk-welcome-card">
                <div>
                  <p className="dk-welcome-label">Documents</p>
                  <p className="dk-welcome-title">Medical Documents</p>
                  <p className="dk-welcome-sub">Consents, prescriptions and clinical files shared by Dr. Kharyl Dence.</p>
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

          {view === "messages" && (
            <>
              <div className="dk-welcome-card">
                <div>
                  <p className="dk-welcome-label">Messages</p>
                  <p className="dk-welcome-title">Follow-up Messages</p>
                  <p className="dk-welcome-sub">Communicate with The Klinique team about your care.</p>
                </div>
              </div>
              <div className="dk-empty">
                <div className="dk-empty-icon"><i className="fa-regular fa-comment-dots" /></div>
                <h3>No messages yet</h3>
                <p>Follow-up messages from Dr. Kharyl Dence will appear here.</p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
