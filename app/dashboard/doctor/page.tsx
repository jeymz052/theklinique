"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoleAuth } from "@/lib/rbac";
import DashboardAccountMenu from "@/app/components/DashboardAccountMenu";
import AppointmentNotifications from "@/app/components/AppointmentNotifications";
import { fetchAppointments, updateAppointmentStatus, type Appointment, type AppointmentStatus } from "@/lib/appointments";

type NavSection = "workflow" | "patients";
type DoctorView = "dashboard" | "schedule" | "all-appts" | "emr" | "rooms";

interface Booking extends Appointment {
  room: string;
}

export default function DoctorDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useRoleAuth(["doctor", "superadmin"]);
  const [view, setView] = useState<DoctorView>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openSections, setOpenSections] = useState<NavSection[]>(["workflow", "patients"]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [newPatient, setNewPatient]   = useState("");
  const [newEmail, setNewEmail]       = useState("");
  const [newPhone, setNewPhone]       = useState("");
  const [newService, setNewService]   = useState("consult-dr-kharyl");
  const [newTime, setNewTime]         = useState("09:00");
  const [newNotes, setNewNotes]       = useState("");
  const [dataError, setDataError] = useState("");
  const [savingConsultation, setSavingConsultation] = useState(false);

  const today    = new Date();
  const dayName  = today.toLocaleDateString("en-PH", { weekday: "long" });
  const dateStr  = today.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  const todayStr = today.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [newAppointmentDate, setNewAppointmentDate] = useState(todayKey);
  const clinicOpenToday = today.getDay() >= 1 && today.getDay() <= 6;

  const todayBookings = bookings.filter((b) => b.date === todayKey);

  useEffect(() => {
    if (!authLoading) {
      fetchAppointments()
        .then((appointments) => setBookings(appointments.map((appointment) => ({ ...appointment, room: "Clinic" }))))
        .catch((error) => setDataError(error.message));
    }
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

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    try {
      await updateAppointmentStatus(id, status);
      setBookings((prev) => prev.map((booking) => (booking.id === id ? { ...booking, status } : booking)));
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Unable to update appointment.");
    }
  };

  const handleAddConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    const [firstName, ...lastNameParts] = newPatient.trim().split(/\s+/);
    if (!firstName || !lastNameParts.length) {
      setDataError("Please enter the patient's first and last name.");
      return;
    }
    setSavingConsultation(true);
    setDataError("");
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName: lastNameParts.join(" "),
          email: newEmail,
          phone: newPhone,
          serviceSlug: newService,
          appointmentDate: newAppointmentDate,
          appointmentTime: `${newTime}:00`,
          notes: newNotes,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create consultation.");
      const appointments = await fetchAppointments();
      setBookings(appointments.map((appointment) => ({ ...appointment, room: "Clinic" })));
      setShowAddModal(false);
      setNewPatient(""); setNewEmail(""); setNewPhone(""); setNewNotes("");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Unable to create consultation.");
    } finally {
      setSavingConsultation(false);
    }
  };

  const filteredAll = bookings;

  const doctorName =
    (user?.user_metadata?.full_name as string) || "Dr. Kharyl Dence";

  const stats = [
    { icon: "fa-calendar-day",   label: "Today's Procedures", value: todayBookings.length.toString(),                                    sub: "Scheduled today"       },
    { icon: "fa-hourglass-half", label: "Pending Intake",     value: bookings.filter((b) => b.status === "pending").length.toString(),   sub: "Awaiting confirmation" },
    { icon: "fa-circle-check",   label: "Completed",          value: bookings.filter((b) => b.status === "completed").length.toString(), sub: "This week"             },
    { icon: "fa-door-open",      label: "Suites Open",        value: "4 / 4",                                                           sub: "Sanitized & ready"     },
    { icon: "fa-users",          label: "Total Patients",     value: bookings.length.toString(),                                         sub: "All time records"      },
    { icon: "fa-clipboard-list", label: "All Appointments",   value: bookings.length.toString(),                                         sub: "Across all dates"      },
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
      {/* Add Consultation Modal */}
      {showAddModal && (
        <div className="dk-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="dk-modal-card">
            <div className="dk-modal-head">
              <p className="dk-modal-title">
                <i className="fa-solid fa-calendar-plus" /> New Consultation
              </p>
              <button type="button" className="dk-modal-close" onClick={() => setShowAddModal(false)}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form onSubmit={handleAddConsultation}>
              <div className="dk-modal-body">
                <div className="dk-modal-field">
                  <label className="dk-modal-label">Patient Full Name *</label>
                  <input
                    className="dk-modal-input"
                    type="text"
                    placeholder="e.g. Maria Santos"
                    value={newPatient}
                    onChange={(e) => setNewPatient(e.target.value)}
                    required
                  />
                </div>
                <div className="dk-modal-grid-2">
                  <div className="dk-modal-field">
                    <label className="dk-modal-label">Service / Procedure</label>
                    <select className="dk-modal-select" value={newService} onChange={(e) => setNewService(e.target.value)}>
                      <option value="consult-dr-kharyl">Consultation with Dr. Kharyl</option>
                      <option value="botox-forehead">Botox / Neuromodulators</option>
                      <option value="fillers-lip">Dermal Fillers</option>
                      <option value="sb-hyaron">Skin Boosters</option>
                      <option value="laser-co2-fractional">CO2 Fractional Laser</option>
                    </select>
                  </div>
                  <div className="dk-modal-field">
                    <label className="dk-modal-label">Scheduled Time</label>
                    <input className="dk-modal-input" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                  </div>
                </div>
                <div className="dk-modal-grid-2">
                  <div className="dk-modal-field">
                    <label className="dk-modal-label">Appointment Date</label>
                    <input className="dk-modal-input" type="date" value={newAppointmentDate} onChange={(e) => setNewAppointmentDate(e.target.value)} required />
                  </div>
                  <div className="dk-modal-field">
                    <label className="dk-modal-label">Phone Number *</label>
                    <input className="dk-modal-input" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} required />
                  </div>
                </div>
                <div className="dk-modal-field">
                  <label className="dk-modal-label">Email Address *</label>
                  <input className="dk-modal-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
                </div>
                <div className="dk-modal-field">
                  <label className="dk-modal-label">Clinical Notes</label>
                  <textarea className="dk-modal-textarea" placeholder="Procedure notes, allergies, special instructions..." value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
                </div>
                <div className="dk-modal-foot">
                  <button type="button" className="dk-btn dk-btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="dk-btn dk-btn-pink" disabled={savingConsultation}>
                    <i className="fa-solid fa-calendar-plus" /> {savingConsultation ? "Saving..." : "Add Consultation"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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
            <p className="dk-user-role">Attending Physician</p>
          </div>
        </div>

        <nav className="dk-nav">
          {/* Clinical Workflow */}
          <div className="dk-nav-section">
            <button className="dk-nav-section-hdr" onClick={() => toggleSection("workflow")}>
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-stethoscope" />
                Clinical Workflow
              </span>
              <i className={`fa-solid fa-chevron-${openSections.includes("workflow") ? "up" : "down"} dk-nav-chevron`} />
            </button>
            {openSections.includes("workflow") && (
              <div className="dk-nav-items">
                {[
                  { key: "dashboard",  icon: "fa-table-columns",    label: "Dashboard"           },
                  { key: "schedule",   icon: "fa-calendar-day",     label: "Today's Schedule"    },
                  { key: "all-appts",  icon: "fa-calendar-check",   label: "All Appointments"    },
                  { key: "rooms",      icon: "fa-door-open",        label: "Treatment Suites"    },
                ].map((item) => (
                  <button
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

          {/* Patient Records */}
          <div className="dk-nav-section">
            <button className="dk-nav-section-hdr" onClick={() => toggleSection("patients")}>
              <span className="dk-nav-section-label">
                <i className="fa-solid fa-users" />
                Patient Records
              </span>
              <i className={`fa-solid fa-chevron-${openSections.includes("patients") ? "up" : "down"} dk-nav-chevron`} />
            </button>
            {openSections.includes("patients") && (
              <div className="dk-nav-items">
                <button
                  id="nav-emr"
                  className={`dk-nav-item ${view === "emr" ? "active" : ""}`}
                  onClick={() => setView("emr")}
                >
                  <i className="fa-solid fa-notes-medical" />
                  Medical Records (EMR)
                </button>
              </div>
            )}
          </div>

          {/* Add consult shortcut */}
          <div className="dk-nav-section">
            <button className="dk-nav-section-hdr dk-nav-section-hdr--solo" style={{ cursor: "pointer" }} onClick={() => setShowAddModal(true)}>
              <span className="dk-nav-section-label" style={{ color: "var(--dk-pink-600)", fontWeight: 700 }}>
                <i className="fa-solid fa-calendar-plus" />
                Add Consultation
              </span>
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
              <p className={clinicOpenToday ? "dk-avail-open" : "dk-avail-closed"}><i className="fa-solid fa-circle" style={{ fontSize: "0.45rem" }} /> {clinicOpenToday ? "Appointments available" : "Reopens Monday"}</p>
            </div>
          </div>
          <p className="dk-avail-day">{dayName}, {dateStr}</p>
        </div>

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
            <p className="dk-workspace-title">Doc Kharyl Workspace</p>
            <p style={{ fontSize: "0.7rem", color: "#9a7a84", marginTop: "0.1rem" }}>
              <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: "#16a34a", marginRight: "0.4rem", verticalAlign: "middle" }} />
              The Klinique · Cagayan de Oro · {dayName}, {dateStr}
            </p>
          </div>
          <div className="dk-topbar-actions">
            <AppointmentNotifications appointments={bookings} onOpenSchedule={() => setView("schedule")} />
            <DashboardAccountMenu name={doctorName} role="Attending Physician" email={user?.email} onSignOut={handleSignOut} signingOut={signingOut} />
          </div>
        </header>

        <div className="dk-body">
          {dataError && <p className="bk-form-error" role="alert">{dataError}</p>}
          {view === "dashboard" && (
          <div className="dk-stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "1.5rem" }}>
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
          )}

          {view === "dashboard" && (
            <>
              <div className="dk-welcome-card">
                <div>
                  <p className="dk-welcome-label">Clinical Dashboard</p>
                  <p className="dk-welcome-title">Good day, {doctorName}</p>
                  <p className="dk-welcome-sub">
                    You have {todayBookings.length} procedures scheduled today. All treatment suites are sanitized and ready.
                  </p>
                </div>
                  <button type="button" className="dk-cta-btn" onClick={() => setShowAddModal(true)}>
                  <i className="fa-solid fa-calendar-plus" /> Add Consultation
                </button>
              </div>

              {bookings.length === 0 ? (
                <div className="dk-empty">
                  <div className="dk-empty-icon"><i className="fa-regular fa-calendar-xmark" /></div>
                  <h3>No consultations yet today</h3>
                  <p>Add a walk-in or scheduled patient to begin your clinical workflow.</p>
                  <button type="button" className="dk-cta-btn" style={{ marginTop: "0.5rem" }} onClick={() => setShowAddModal(true)}>
                    <i className="fa-solid fa-calendar-plus" /> Add Consultation
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
                    <button type="button" className="dk-btn dk-btn-outline dk-btn-sm" onClick={() => setView("schedule")}>
                      Full Schedule ?
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
                                <span style={{ textTransform: "capitalize" }}>{b.status}</span>
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div className="dk-action-group">
                                {b.status === "confirmed" && (
                                  <button type="button" className="dk-act-btn dk-act-complete" onClick={() => handleStatusChange(b.id, "completed")}>
                                    <i className="fa-solid fa-check" /> Complete
                                  </button>
                                )}
                              </div>
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

          {/* Schedule */}
          {view === "schedule" && (
            <>
              <div className="dk-welcome-card">
                <div>
                  <p className="dk-welcome-label">Schedule</p>
                  <p className="dk-welcome-title">Today&apos;s Schedule</p>
                  <p className="dk-welcome-sub">All consultations booked for {todayStr}.</p>
                </div>
                <button type="button" className="dk-cta-btn" onClick={() => setShowAddModal(true)}>
                  <i className="fa-solid fa-calendar-plus" /> Add
                </button>
              </div>
              {todayBookings.length === 0 ? (
                <div className="dk-empty">
                  <div className="dk-empty-icon"><i className="fa-regular fa-calendar-xmark" /></div>
                  <h3>No consultations today</h3>
                  <p>Add a consultation to build today&apos;s schedule.</p>
                  <button type="button" className="dk-cta-btn" style={{ marginTop: "0.5rem" }} onClick={() => setShowAddModal(true)}>
                    <i className="fa-solid fa-calendar-plus" /> Add Consultation
                  </button>
                </div>
              ) : (
                <div className="dk-panel">
                  <div className="dk-table-wrap">
                    <table className="dk-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Patient</th>
                          <th>Procedure</th>
                          <th>Suite</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {todayBookings.sort((a, b) => a.time.localeCompare(b.time)).map((b) => (
                          <tr key={b.id}>
                            <td><strong>{b.time}</strong></td>
                            <td><p className="dk-cell-primary">{b.patient}</p></td>
                            <td>{b.service}</td>
                            <td>{b.room}</td>
                            <td>
                              <span className={`dk-badge dk-badge-${b.status}`}>
                                <span style={{ textTransform: "capitalize" }}>{b.status}</span>
                              </span>
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

          {/* All Appointments */}
          {view === "all-appts" && (
            <>
              <div className="dk-welcome-card">
                <div>
                  <p className="dk-welcome-label">Appointments</p>
                  <p className="dk-welcome-title">All Appointments</p>
                  <p className="dk-welcome-sub">Complete appointment history across all dates.</p>
                </div>
                <button type="button" className="dk-cta-btn" onClick={() => setShowAddModal(true)}>
                  <i className="fa-solid fa-calendar-plus" /> Add
                </button>
              </div>
              {filteredAll.length === 0 ? (
                <div className="dk-empty">
                  <div className="dk-empty-icon"><i className="fa-regular fa-calendar-xmark" /></div>
                  <h3>No appointments yet</h3>
                  <p>Add your first consultation to start tracking appointments.</p>
                  <button type="button" className="dk-cta-btn" style={{ marginTop: "0.5rem" }} onClick={() => setShowAddModal(true)}>
                    <i className="fa-solid fa-calendar-plus" /> Add Consultation
                  </button>
                </div>
              ) : (
                <div className="dk-panel">
                  <div className="dk-table-wrap">
                    <table className="dk-table">
                      <thead>
                        <tr>
                          <th>Ref ID</th>
                          <th>Patient</th>
                          <th>Procedure</th>
                          <th>Date & Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAll.map((b) => (
                          <tr key={b.id}>
                            <td><span className="dk-cell-id">{b.referenceNo}</span></td>
                            <td><p className="dk-cell-primary">{b.patient}</p></td>
                            <td>{b.service}</td>
                            <td>
                              <p className="dk-cell-primary">{b.time}</p>
                              <p className="dk-cell-secondary">{b.date}</p>
                            </td>
                            <td>
                              <span className={`dk-badge dk-badge-${b.status}`}>
                                <span style={{ textTransform: "capitalize" }}>{b.status}</span>
                              </span>
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
            <>
              <div className="dk-welcome-card">
                <div>
                  <p className="dk-welcome-label">Medical Records</p>
                  <p className="dk-welcome-title">Patient EMR</p>
                  <p className="dk-welcome-sub">Electronic medical records and consultation notes for your patients.</p>
                </div>
              </div>
              <div className="dk-empty">
                <div className="dk-empty-icon"><i className="fa-regular fa-folder-open" /></div>
                <h3>No records yet</h3>
                <p>Patient medical records will appear here once consultations are completed.</p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
