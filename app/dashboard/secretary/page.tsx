"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoleAuth } from "@/lib/rbac";
import { fetchAppointments, updateAppointmentStatus, type Appointment, type AppointmentStatus } from "@/lib/appointments";
import DashboardAccountMenu from "@/app/components/DashboardAccountMenu";
import AppointmentNotifications from "@/app/components/AppointmentNotifications";
import DashboardInsights from "@/app/components/DashboardInsights";
import BasicSettingsWorkspace from "@/app/components/BasicSettingsWorkspace";
import ClinicCalendar from "@/app/components/ClinicCalendar";
import WebsiteContentManager from "@/app/components/WebsiteContentManager";
import PatientRecordsWorkspace from "@/app/components/PatientRecordsWorkspace";
import StaffAppointmentModal from "@/app/components/StaffAppointmentModal";
import type { PatientRecord } from "@/lib/patients";

type SecretaryView = "overview" | "schedule" | "calendar" | "patients" | "website-content" | "profile" | "settings";

export default function SecretaryDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useRoleAuth(["secretary"]);
  const [view, setView] = useState<SecretaryView>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [dataError, setDataError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [bookingPatient, setBookingPatient] = useState<PatientRecord | null>(null);

  useEffect(() => {
    if (!authLoading) fetchAppointments().then(setAppointments).catch((error) => setDataError(error.message));
  }, [authLoading]);

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    const allowedViews: SecretaryView[] = ["overview", "schedule", "calendar", "patients", "website-content", "profile", "settings"];
    if (!requestedView || !allowedViews.includes(requestedView as SecretaryView)) return;
    window.history.replaceState({}, "", "/dashboard/secretary");
    queueMicrotask(() => setView(requestedView as SecretaryView));
  }, []);

  const todayKey = new Date().toISOString().slice(0, 10);
  const today = appointments.filter((appointment) => appointment.date === todayKey && appointment.status !== "cancelled");
  const pending = appointments.filter((appointment) => appointment.status === "pending");
  const patientCount = new Set(appointments.map((appointment) => appointment.email || appointment.patient)).size;
  const filtered = appointments.filter((appointment) => {
    const needle = query.trim().toLowerCase();
    return (status === "all" || appointment.status === status) && (!needle || [appointment.patient, appointment.referenceNo, appointment.service, appointment.phone].some((value) => value.toLowerCase().includes(needle)));
  });

  async function changeStatus(id: string, nextStatus: AppointmentStatus) {
    try {
      await updateAppointmentStatus(id, nextStatus);
      setAppointments((items) => items.map((item) => item.id === id ? { ...item, status: nextStatus } : item));
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Unable to update appointment.");
    }
  }

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/signin");
  }

  const displayName = (user?.user_metadata?.full_name as string) || "Clinic Secretary";
  if (authLoading) return <div className="dk-loading"><i className="fa-solid fa-spinner fa-spin fa-2x" /></div>;

  return (
    <div className={`dk-root ${mobileNavOpen ? "mobile-nav-open" : ""}`}>
      {bookingPatient&&<StaffAppointmentModal patient={bookingPatient} onClose={()=>setBookingPatient(null)} onCreated={async()=>setAppointments(await fetchAppointments())}/>} 
      <button type="button" className="dk-mobile-nav-overlay" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
      <aside className="dk-sidebar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <Link href="/" className="dk-logo"><img src="/images/the_klinique_logo-removebg-preview.png" alt="The Klinique" /></Link>
        <nav className="dk-nav">
          <div className="dk-nav-section">
            <div className="dk-nav-section-hdr dk-nav-section-hdr--solo"><span className="dk-nav-section-label"><i className="fa-solid fa-headset" /> Front Desk</span></div>
            <div className="dk-nav-items">
              {([
                ["overview", "fa-table-columns", "Desk overview"],
                ["schedule", "fa-calendar-check", "Appointments"],
                ["calendar", "fa-calendar", "Calendar View"],
                ["patients", "fa-address-book", "Patient directory"],
                ["website-content", "fa-wand-magic-sparkles", "Website Content"],
                ["settings", "fa-gear", "Settings"],
              ] as const).map(([key, icon, label]) => (
                <button key={key} className={`dk-nav-item ${view === key || (key === "settings" && view === "profile") ? "active" : ""}`} onClick={() => { setView(key); setMobileNavOpen(false); }}><i className={`fa-solid ${icon}`} /> {label}{key === "schedule" && <span className="dk-nav-pill">{pending.length}</span>}</button>
              ))}
            </div>
          </div>
        </nav>
        <div className="dk-availability">
          <p className="dk-availability-title"><i className="fa-solid fa-shield-halved" /> Secretary access</p>
          <p className="dk-avail-hours">Scheduling and patient coordination only. Clinical notes, revenue, settings, and user management stay protected.</p>
        </div>
      </aside>

      <main className="dk-main">
        <header className="dk-topbar">
          <div>
            <button type="button" className="dk-mobile-menu-trigger" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><i className="fa-solid fa-bars" /></button>
            <p className="dk-workspace-eyebrow">Front desk workspace</p>
            <p className="dk-workspace-title">Good day, {displayName}</p>
          </div>
          <div className="dk-topbar-actions">
            <AppointmentNotifications appointments={appointments} onOpenSchedule={() => setView("schedule")} />
            <DashboardAccountMenu name={displayName} role="Secretary" email={user?.email} onSignOut={signOut} signingOut={signingOut} onProfileClick={() => setView("profile")} onSettingsClick={() => setView("settings")} />
          </div>
        </header>

        <div className="dk-body">
          {dataError && <p className="bk-form-error" role="alert">{dataError}</p>}
          <div className="dk-welcome-card">
            <div><p className="dk-welcome-label">Front desk</p><p className="dk-welcome-title">Keep every clinic day moving</p><p className="dk-welcome-sub">Review new requests, confirm visits, and find patient contact details without exposing clinical or financial records.</p></div>
            <span className="dk-status-badge"><i className="fa-solid fa-lock" /> Role-protected workspace</span>
          </div>

          {view === "overview" && <>
            <div className="dk-kpi-grid">
              <div className="dk-kpi-card"><div className="dk-kpi-top"><span className="dk-kpi-icon dk-kpi-icon-pink"><i className="fa-solid fa-calendar-day" /></span><span className="dk-kpi-trend label">Today</span></div><p className="dk-kpi-value">{today.length}</p><p className="dk-kpi-label">Scheduled visits</p></div>
              <div className="dk-kpi-card"><div className="dk-kpi-top"><span className="dk-kpi-icon dk-kpi-icon-amber"><i className="fa-solid fa-hourglass-half" /></span><span className="dk-kpi-trend warn">Action needed</span></div><p className="dk-kpi-value">{pending.length}</p><p className="dk-kpi-label">Pending confirmation</p></div>
              <div className="dk-kpi-card"><div className="dk-kpi-top"><span className="dk-kpi-icon dk-kpi-icon-green"><i className="fa-solid fa-users" /></span><span className="dk-kpi-trend label">Directory</span></div><p className="dk-kpi-value">{patientCount}</p><p className="dk-kpi-label">Patients with appointments</p></div>
              <div className="dk-kpi-card"><div className="dk-kpi-top"><span className="dk-kpi-icon dk-kpi-icon-black"><i className="fa-solid fa-phone" /></span><span className="dk-kpi-trend label">Queue</span></div><p className="dk-kpi-value">{pending.length}</p><p className="dk-kpi-label">Follow-ups due</p></div>
            </div>
            <div className="dk-quick-grid" style={{ marginBottom: "1.5rem" }}>
              {[
                { icon: "fa-calendar-check", label: "Appointments", action: () => setView("schedule") },
                { icon: "fa-address-book", label: "Patient Directory", action: () => setView("patients") },
                { icon: "fa-hourglass-half", label: "Pending Queue", action: () => { setStatus("pending"); setView("schedule"); } },
                { icon: "fa-wand-magic-sparkles", label: "Website Content", action: () => setView("website-content") },
              ].map((item) => <button type="button" className="dk-quick-card" key={item.label} onClick={item.action}><i className={`fa-solid ${item.icon} dk-quick-icon`} /><span className="dk-quick-label">{item.label}</span><i className="fa-solid fa-arrow-right dk-quick-arrow" /></button>)}
            </div>
            <DashboardInsights appointments={appointments} role="secretary" />
            <AppointmentTable items={today.length ? today : pending.slice(0, 6)} onStatus={changeStatus} />
          </>}

          {view === "schedule" && <div className="dk-panel">
            <div className="dk-panel-hdr"><div className="dk-panel-title-wrap"><i className="fa-solid fa-calendar-check" /><div><p className="dk-panel-title">Appointment desk</p><p className="dk-panel-sub">Search, confirm, or cancel clinic visits</p></div></div><div className="dk-pill-row"><select className="dk-modal-select" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><div className="dk-search"><i className="fa-solid fa-magnifying-glass" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patient, phone, reference…" /></div></div></div>
            <AppointmentTable items={filtered} onStatus={changeStatus} />
          </div>}
          {view === "calendar" && <ClinicCalendar />}
          {view === "website-content" && <WebsiteContentManager />}

          {view === "patients" && <PatientRecordsWorkspace onBookPatient={setBookingPatient}/>} 
          {(view === "settings" || view === "profile") && <BasicSettingsWorkspace key={view} email={user?.email} initialTab={view === "profile" ? "profile" : "general"} />}
        </div>
      </main>
    </div>
  );
}

function AppointmentTable({ items, onStatus }: { items: Appointment[]; onStatus: (id: string, status: AppointmentStatus) => void }) {
  return <div className="dk-panel"><div className="dk-table-wrap"><table className="dk-table"><thead><tr><th>Patient</th><th>Service</th><th>Schedule</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.id}><td><p className="dk-cell-primary">{item.patient}</p><p className="dk-cell-secondary">{item.referenceNo} · {item.phone}</p></td><td>{item.service}</td><td>{item.date}<p className="dk-cell-secondary">{item.time}</p></td><td><span className={`dk-badge dk-badge-${item.status}`}>{item.status}</span></td><td><div className="dk-action-group">{item.status === "pending" && <button className="dk-act-btn dk-act-verify" onClick={() => onStatus(item.id, "confirmed")}><i className="fa-solid fa-check" /> Confirm</button>}{item.status !== "cancelled" && item.status !== "completed" && <button className="dk-act-btn dk-act-view" onClick={() => onStatus(item.id, "cancelled")}>Cancel</button>}</div></td></tr>) : <tr><td colSpan={5}><div className="dk-empty"><div className="dk-empty-icon"><i className="fa-regular fa-calendar-check" /></div><h3>Queue is clear</h3><p>No appointments match this view.</p></div></td></tr>}</tbody></table></div></div>;
}
