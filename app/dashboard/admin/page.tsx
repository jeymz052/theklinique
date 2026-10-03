"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoleAuth } from "@/lib/rbac";
import { fetchAppointments, updateAppointmentStatus, type Appointment, type AppointmentStatus } from "@/lib/appointments";
import DashboardAccountMenu from "@/app/components/DashboardAccountMenu";
import StaffSettingsWorkspace from "@/app/components/StaffSettingsWorkspace";
import DashboardInsights from "@/app/components/DashboardInsights";
import { RESERVATION_FEE_LABEL } from "@/lib/reservation";

type Booking = Appointment;

type AdminTab = "overview" | "bookings" | "patients" | "revenue" | "profile" | "settings";

export default function AdminDashboard() {
  const router = useRouter();
  const { user, role, loading: authLoading } = useRoleAuth(["superadmin", "doctor"]);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [dataError, setDataError] = useState("");

  useEffect(() => {
    if (!authLoading) {
      fetchAppointments().then(setBookings).catch((error) => setDataError(error.message));
    }
  }, [authLoading]);

  useEffect(() => {
    if (!authLoading && (role === "doctor" || role === "superadmin")) router.replace("/dashboard/doctor");
  }, [authLoading, role, router]);

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "profile" || requestedView === "settings") {
      window.history.replaceState({}, "", "/dashboard/admin");
      queueMicrotask(() => setActiveTab(requestedView));
    }
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/signin");
  };

  const totalRevenue = bookings
    .filter((b) => b.status === "completed" || b.status === "confirmed")
    .reduce((sum, b) => sum + b.amount, 0);
  const pendingCount   = bookings.filter((b) => b.status === "pending").length;
  const confirmedCount = bookings.filter((b) => b.status === "confirmed").length;
  const patients = Array.from(bookings.reduce((records, booking) => {
    const existing = records.get(booking.email) || { ...booking, visits: 0, totalSpent: 0 };
    existing.visits += 1;
    existing.totalSpent += booking.amount;
    records.set(booking.email, existing);
    return records;
  }, new Map<string, Appointment & { visits: number; totalSpent: number }>()).values());

  const filteredBookings = bookings.filter((b) => {
    const matchStatus = filterStatus === "all" || b.status === filterStatus;
    const matchSearch =
      b.patient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.service.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.referenceNo.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  const handleUpdateStatus = async (id: string, newStatus: AppointmentStatus) => {
    try {
      await updateAppointmentStatus(id, newStatus);
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: newStatus } : b)));
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Unable to update appointment.");
    }
  };

  const exportCsv = () => {
    const rows = [["Reference", "Patient", "Service", "Date", "Time", "Status", "Amount"]].concat(
      bookings.map((booking) => [booking.referenceNo, booking.patient, booking.service, booking.date, booking.time, booking.status, String(booking.amount)])
    );
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
    const blobUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = "the-klinique-appointments.csv";
    link.click();
    URL.revokeObjectURL(blobUrl);
  };

  const navItems: { key: AdminTab; icon: string; label: string; badge?: number }[] = [
    { key: "overview",  icon: "fa-chart-pie",    label: "Clinic Overview"    },
    { key: "bookings",  icon: "fa-calendar-check",label: "All Bookings",    badge: bookings.length },
    { key: "patients",  icon: "fa-users",         label: "Patient Directory", badge: patients.length },
    { key: "revenue",   icon: "fa-receipt",       label: "Revenue & Sales"   },
    { key: "settings",  icon: "fa-sliders",       label: "Clinic Settings"   },
  ];

  const serviceBars = Array.from(bookings.reduce((counts, booking) => {
    counts.set(booking.service, (counts.get(booking.service) || 0) + 1);
    return counts;
  }, new Map<string, number>()).entries())
    .sort(([, left], [, right]) => right - left)
    .slice(0, 4)
    .map(([label, count], index) => ({
      label,
      pct: bookings.length ? Math.round((count / bookings.length) * 100) : 0,
      cls: ["dk-bar-pink", "dk-bar-black", "dk-bar-green", "dk-bar-amber"][index],
    }));

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
        <Link href="/" className="dk-logo" title="The Klinique Home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/the_klinique_logo-removebg-preview.png" alt="The Klinique" />
        </Link>

        <div className="dk-user-badge">
          <div className="dk-user-avatar black">SA</div>
          <div>
            <p className="dk-user-name">{role === "doctor" ? "Doctor" : "Super Administrator"}</p>
            <p className="dk-user-role">Clinical leadership · Full Access</p>
          </div>
        </div>

        <nav className="dk-nav">
          <div className="dk-nav-section">
            <div className="dk-nav-section-hdr dk-nav-section-hdr--solo" style={{ cursor: "default" }}>
              <span className="dk-nav-section-label" style={{ fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#9a7a84" }}>
                Practice Management
              </span>
            </div>
          </div>

          {navItems.map((item) => (
            <button
              type="button"
              key={item.key}
              id={`admin-nav-${item.key}`}
              className={`dk-nav-item ${activeTab === item.key || (item.key === "settings" && activeTab === "profile") ? "active" : ""}`}
              style={{ paddingLeft: "1.2rem", justifyContent: "space-between" }}
              onClick={() => setActiveTab(item.key)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                <i className={`fa-solid ${item.icon}`} />
                {item.label}
              </span>
              {item.badge !== undefined && (
                <span className="dk-nav-pill">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="dk-sidebar-foot">
          <p className="dk-email-label">Logged in as</p>
          <p className="dk-email-value">{user?.email || "superadmin@theklinique.ph"}</p>
          <button type="button" id="admin-signout-btn" className="dk-signout-btn" onClick={handleSignOut} disabled={signingOut}>
            <i className="fa-solid fa-arrow-right-from-bracket" />
            {signingOut ? "Signing out…" : "Sign Out Session"}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="dk-main">
        {/* Topbar */}
        <header className="dk-topbar">
          <button type="button" className="dk-mobile-menu-trigger" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>
            <i className="fa-solid fa-bars" />
          </button>
          <div>
            <p style={{ fontSize: "1rem", fontWeight: 800, color: "#0d0d0d" }}>Clinic Administration Portal</p>
            <p style={{ fontSize: "0.7rem", color: "#9a7a84", marginTop: "0.1rem" }}>
              <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: "#d94f74", marginRight: "0.4rem", verticalAlign: "middle" }} />
              The Klinique Practice Management · Cagayan de Oro City · Master Access
            </p>
          </div>
          <div className="dk-topbar-actions">
            <div className="dk-search">
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                placeholder="Search bookings or patients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button type="button" className="dk-btn dk-btn-outline" onClick={exportCsv}>
              <i className="fa-solid fa-download" /> Export CSV
            </button>
            <Link href="/booking" className="dk-btn dk-btn-pink">
              <i className="fa-solid fa-plus" /> Add Appointment
            </Link>
            <DashboardAccountMenu name={role === "doctor" ? "Doctor" : "Super Administrator"} role="Clinical leadership · Full access" email={user?.email} onSignOut={handleSignOut} signingOut={signingOut} onProfileClick={() => setActiveTab("profile")} onSettingsClick={() => setActiveTab("settings")} />
          </div>
        </header>

        <div className="dk-body">
          {dataError && <p className="bk-form-error" role="alert">{dataError}</p>}
          {/* KPI cards — always visible */}
          <div className="dk-kpi-grid">
            <div className="dk-kpi-card">
              <div className="dk-kpi-top">
                <div className="dk-kpi-icon dk-kpi-icon-pink"><i className="fa-solid fa-peso-sign" /></div>
                <span className="dk-kpi-trend label">Recorded services</span>
              </div>
              <p className="dk-kpi-value">₱{totalRevenue.toLocaleString()}</p>
              <p className="dk-kpi-label">Service value</p>
            </div>

            <div className="dk-kpi-card">
              <div className="dk-kpi-top">
                <div className="dk-kpi-icon dk-kpi-icon-green"><i className="fa-solid fa-calendar-check" /></div>
                <span className="dk-kpi-trend label">Ready</span>
              </div>
              <p className="dk-kpi-value">{confirmedCount}</p>
              <p className="dk-kpi-label">Confirmed visits</p>
            </div>

            <div className="dk-kpi-card">
              <div className="dk-kpi-top">
                <div className="dk-kpi-icon dk-kpi-icon-amber"><i className="fa-solid fa-hourglass-half" /></div>
                <span className="dk-kpi-trend warn">Needs review</span>
              </div>
              <p className="dk-kpi-value">{pendingCount}</p>
              <p className="dk-kpi-label">Pending bookings</p>
            </div>

            <div className="dk-kpi-card">
              <div className="dk-kpi-top">
                <div className="dk-kpi-icon dk-kpi-icon-black"><i className="fa-solid fa-user-doctor" /></div>
                <span className="dk-kpi-trend label">On Duty</span>
              </div>
              <p className="dk-kpi-value" style={{ fontSize: "1.4rem" }}>Dr. Kharyl</p>
              <p className="dk-kpi-label">Attending Physician</p>
            </div>
          </div>

          {activeTab === "overview" && <DashboardInsights appointments={bookings} role="admin" />}

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="dk-grid-2">
              {/* Recent activity */}
              <div className="dk-panel">
                <div className="dk-panel-hdr">
                  <div className="dk-panel-title-wrap">
                    <i className="fa-solid fa-calendar-days" />
                    <div>
                      <p className="dk-panel-title">Recent Clinical Activity</p>
                      <p className="dk-panel-sub">Latest appointment requests and confirmations</p>
                    </div>
                  </div>
                  <button type="button" className="dk-btn dk-btn-outline dk-btn-sm" onClick={() => setActiveTab("bookings")}>
                    View All ?
                  </button>
                </div>
                <div className="dk-table-wrap">
                  <table className="dk-table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Procedure</th>
                        <th>Time</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.slice(0, 4).map((b) => (
                        <tr key={b.id}>
                          <td>
                            <p className="dk-cell-primary">{b.patient}</p>
                            <p className="dk-cell-secondary">{b.referenceNo}</p>
                          </td>
                          <td style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.service}</td>
                          <td>{b.time}</td>
                          <td>
                            <span className={`dk-badge dk-badge-${b.status}`}>
                              <i className={`fa-solid ${b.status === "confirmed" ? "fa-circle-check" : b.status === "completed" ? "fa-award" : "fa-hourglass-half"}`} />
                              <span style={{ textTransform: "capitalize" }}>{b.status}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Procedure demand */}
              <div className="dk-panel">
                <div className="dk-panel-hdr">
                  <div className="dk-panel-title-wrap">
                    <i className="fa-solid fa-chart-simple" />
                    <div>
                      <p className="dk-panel-title">Procedure Demand</p>
                      <p className="dk-panel-sub">Service distribution this month</p>
                    </div>
                  </div>
                </div>
                <div className="dk-panel-body">
                  {serviceBars.length ? serviceBars.map((bar) => (
                    <div key={bar.label} className={`dk-bar-row ${bar.cls}`}>
                      <div className="dk-bar-meta">
                        <span className="dk-bar-name">{bar.label}</span>
                        <span className="dk-bar-pct">{bar.pct}%</span>
                      </div>
                      <div className="dk-bar-track">
                        <div className="dk-bar-fill" style={{ width: `${bar.pct}%` }} />
                      </div>
                    </div>
                  )) : <div className="dk-empty"><p>No appointment data yet.</p></div>}
                </div>
              </div>
            </div>
          )}

          {/* Bookings Tab */}
          {activeTab === "bookings" && (
            <div className="dk-panel">
              <div className="dk-panel-hdr">
                <div className="dk-panel-title-wrap">
                  <i className="fa-solid fa-calendar-check" />
                  <div>
                    <p className="dk-panel-title">Master Booking Intake & Ledger</p>
                    <p className="dk-panel-sub">Review, verify deposits, confirm, or modify patient bookings</p>
                  </div>
                </div>
                <div className="dk-pill-row">
                  {["all", "confirmed", "pending", "completed"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`dk-pill ${filterStatus === s ? "active" : ""}`}
                      onClick={() => setFilterStatus(s)}
                    >
                      {s === "all" ? `All (${bookings.length})` : s === "pending" ? "Pending Deposit" : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dk-table-wrap">
                <table className="dk-table">
                  <thead>
                    <tr>
                      <th>Ref ID</th>
                      <th>Patient</th>
                      <th>Service</th>
                      <th>Date & Time</th>
                      <th>Fee</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.map((b) => (
                      <tr key={b.id}>
                        <td><span className="dk-cell-id">{b.referenceNo}</span></td>
                        <td>
                          <p className="dk-cell-primary">{b.patient}</p>
                          <p className="dk-cell-secondary">{b.phone}</p>
                        </td>
                        <td style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.service}</td>
                        <td>
                          <p className="dk-cell-primary">{b.time}</p>
                          <p className="dk-cell-secondary">{b.date}</p>
                        </td>
                        <td><strong>?{b.amount.toLocaleString()}</strong></td>
                        <td>
                          <span className={`dk-badge dk-badge-${b.status}`}>
                            <i className={`fa-solid ${b.status === "confirmed" ? "fa-circle-check" : b.status === "completed" ? "fa-award" : "fa-hourglass-half"}`} />
                            <span style={{ textTransform: "capitalize" }}>{b.status}</span>
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="dk-action-group">
                            {b.status === "pending" && (
                              <button type="button" className="dk-act-btn dk-act-verify" onClick={() => handleUpdateStatus(b.id, "confirmed")}>
                                <i className="fa-solid fa-check" /> Verify
                              </button>
                            )}
                            {b.status !== "completed" && (
                              <button type="button" className="dk-act-btn dk-act-complete" onClick={() => handleUpdateStatus(b.id, "completed")}>
                                <i className="fa-solid fa-receipt" /> Complete
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

          {/* Patients Tab */}
          {activeTab === "patients" && (
            <div className="dk-panel">
              <div className="dk-panel-hdr">
                <div className="dk-panel-title-wrap">
                  <i className="fa-solid fa-users" />
                  <div>
                    <p className="dk-panel-title">Registered Patient Directory</p>
                    <p className="dk-panel-sub">Patient contact profiles, lifetime aesthetic expenditure & visit counts</p>
                  </div>
                </div>
              </div>
              <div className="dk-table-wrap">
                <table className="dk-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Contact Info</th>
                      <th>Total Spend (LTV)</th>
                      <th>Sessions</th>
                      <th>Status Tier</th>
                      <th style={{ textAlign: "right" }}>Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((p) => (
                      <tr key={p.email}>
                        <td>
                          <div className="dk-patient-cell">
                            <div className="dk-patient-avatar">
                              {p.patient.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </div>
                            <span className="dk-cell-primary">{p.patient}</span>
                          </div>
                        </td>
                        <td>
                          <p className="dk-cell-primary">{p.email}</p>
                          <p className="dk-cell-secondary">{p.phone}</p>
                        </td>
                        <td><strong>?{p.totalSpent.toLocaleString()}</strong></td>
                        <td>{p.visits} visits</td>
                        <td>
                          <span className="dk-badge dk-badge-confirmed">
                            <i className="fa-solid fa-user-check" /> Active
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button type="button" className="dk-act-btn dk-act-view" onClick={() => { setSearchQuery(p.email); setActiveTab("bookings"); }}>
                            <i className="fa-solid fa-folder-open" /> Ledger
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Revenue Tab */}
          {activeTab === "revenue" && (
            <div className="dk-panel">
              <div className="dk-panel-hdr">
                <div className="dk-panel-title-wrap">
                  <i className="fa-solid fa-receipt" />
                  <div>
                    <p className="dk-panel-title">Financial Ledger & Procedure Sales</p>
                    <p className="dk-panel-sub">Audited clinic procedure receivables · Cagayan de Oro Branch</p>
                  </div>
                </div>
              </div>
              <div className="dk-panel-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                  <div className="dk-info-block">
                    <p className="dk-info-block-title">Revenue Summary (MTD)</p>
                    <div className="dk-info-row"><span>Completed Treatments:</span><strong>?{bookings.filter((booking) => booking.status === "completed").reduce((sum, booking) => sum + booking.amount, 0).toLocaleString()}</strong></div>
                    <div className="dk-info-row"><span>Pending Reservations:</span><strong>{pendingCount}</strong></div>
                    <div className="dk-info-row"><span>Confirmed Appointments:</span><strong>{confirmedCount}</strong></div>
                    <div className="dk-info-row total"><span>Total Gross Volume:</span><strong>?{totalRevenue.toLocaleString()}</strong></div>
                  </div>
                  <div className="dk-info-block">
                    <p className="dk-info-block-title">Deposit Verification Policy</p>
                    <p style={{ fontSize: "0.82rem", color: "#7a5060", lineHeight: "1.7" }}>
                      A standard reservation deposit of {RESERVATION_FEE_LABEL} is required per appointment slot. Deposits are deducted from the final treatment cost at the clinic checkout counter.
                    </p>
                    <div style={{ marginTop: "1.2rem" }}>
                      <Link href="/cancellation-policy" target="_blank" className="dk-btn dk-btn-outline">
                        <i className="fa-solid fa-file-contract" /> View Full Cancellation Terms
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(activeTab === "settings" || activeTab === "profile") && <StaffSettingsWorkspace key={activeTab} email={user?.email || ""} initialTab={activeTab === "profile" ? "profile" : "general"} />}

          {/* Legacy settings summary retained outside the active workspace. */}
          {false && (
            <div className="dk-panel">
              <div className="dk-panel-hdr">
                <div className="dk-panel-title-wrap">
                  <i className="fa-solid fa-sliders" />
                  <div>
                    <p className="dk-panel-title">Clinic Operating Parameters</p>
                    <p className="dk-panel-sub">Operating hours, location and doctor availability</p>
                  </div>
                </div>
              </div>
              <div className="dk-panel-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                  <div className="dk-info-block">
                    <p className="dk-info-block-title">Clinic Location</p>
                    <div className="dk-info-row"><span>City:</span><strong>Cagayan de Oro City</strong></div>
                    <div className="dk-info-row"><span>Province:</span><strong>Misamis Oriental</strong></div>
                    <div className="dk-info-row"><span>Region:</span><strong>Region X — Northern Mindanao</strong></div>
                    <div className="dk-info-row"><span>ZIP Code:</span><strong>9000</strong></div>
                  </div>
                  <div className="dk-info-block">
                    <p className="dk-info-block-title">Operating Hours</p>
                    <div className="dk-info-row"><span>In-Person Clinic:</span><strong>9:00 AM – 5:00 PM</strong></div>
                    <div className="dk-info-row"><span>Virtual Consult:</span><strong>8:00 AM – 8:00 PM</strong></div>
                    <div className="dk-info-row"><span>Walk-ins:</span><strong>Not Accepted</strong></div>
                    <div className="dk-info-row"><span>Attending Physician:</span><strong>Dr. Kharyl Dence, MD</strong></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
