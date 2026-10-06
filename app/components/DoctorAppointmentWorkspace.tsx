"use client";

import { useMemo, useState } from "react";
import { appointmentStatusLabel, type Appointment, type AppointmentStatus } from "@/lib/appointments";
import type { RescheduleRequest } from "@/lib/rescheduleRequests";

type Props = {
  appointments: Appointment[];
  onStatusChange: (id: string, status: AppointmentStatus) => Promise<void>;
  rescheduleRequests: RescheduleRequest[];
  onReviewReschedule: (requestId: string, decision: "approved" | "rejected") => Promise<void>;
  onOpenClinicalWorkspace: (appointment: Appointment) => void;
};
type TimelineFilter = "today" | "upcoming" | "past" | "all";
type StatusFilter = "all" | AppointmentStatus;

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dateHeading(date: string, today: string) {
  const value = new Date(`${date}T00:00:00`);
  const tomorrow = new Date(`${today}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const label = date === today ? "Today" : date === tomorrow.toLocaleDateString("en-CA") ? "Tomorrow" : date < today ? "Past" : "Upcoming";
  return { label, date: value.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) };
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "PT";
}

export default function DoctorAppointmentWorkspace({ appointments, onStatusChange, rescheduleRequests, onReviewReschedule, onOpenClinicalWorkspace }: Props) {
  const today = localDateKey();
  const [query, setQuery] = useState("");
  const [timeline, setTimeline] = useState<TimelineFilter>("upcoming");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const summary = useMemo(() => ({
    today: appointments.filter((item) => item.date === today && !["cancelled", "no_show"].includes(item.status)).length,
    upcoming: appointments.filter((item) => item.date > today && item.status === "confirmed").length,
    confirmed: appointments.filter((item) => item.status === "confirmed").length,
    pending: appointments.filter((item) => item.status === "pending").length + rescheduleRequests.length,
  }), [appointments, rescheduleRequests.length, today]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return appointments.filter((item) => {
      const matchesTimeline = timeline === "all" || (timeline === "today" && item.date === today && item.status !== "pending") || (timeline === "upcoming" && item.date >= today && item.status === "confirmed") || (timeline === "past" && (item.date < today || ["completed", "cancelled", "no_show"].includes(item.status)));
      const matchesStatus = status === "all" || item.status === status;
      const matchesQuery = !needle || [item.patient, item.referenceNo, item.service, item.email, item.phone, item.notes].some((value) => value.toLowerCase().includes(needle));
      return matchesTimeline && matchesStatus && matchesQuery;
    }).sort((a, b) => timeline === "past" ? b.date.localeCompare(a.date) || b.time.localeCompare(a.time) : a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  }, [appointments, query, status, timeline, today]);

  const groups = useMemo(() => filtered.reduce<Record<string, Appointment[]>>((result, item) => {
    (result[item.date] ||= []).push(item);
    return result;
  }, {}), [filtered]);

  async function update(id: string, nextStatus: AppointmentStatus) {
    setUpdatingId(id);
    try { await onStatusChange(id, nextStatus); } finally { setUpdatingId(null); }
  }

  async function review(requestId: string, decision: "approved" | "rejected") {
    setReviewingId(requestId);
    try { await onReviewReschedule(requestId, decision); } finally { setReviewingId(null); }
  }

  function resetFilters() {
    setQuery(""); setTimeline("all"); setStatus("all");
  }

  return <div className="ma-workspace">
    <section className="ma-stats" aria-label="Appointment summary">
      <article><div><span>Today</span><strong>{summary.today}</strong><p>{summary.today ? `${summary.today} clinic visit${summary.today === 1 ? "" : "s"}` : "No bookings today"}</p></div><i className="fa-solid fa-calendar-day" /></article>
      <article><div><span>Upcoming</span><strong>{summary.upcoming}</strong><p>{summary.upcoming ? "Appointments on deck" : "Nothing on deck"}</p></div><i className="fa-solid fa-calendar-plus" /></article>
      <article><div><span>Confirmed</span><strong>{summary.confirmed}</strong><p>Ready for clinic</p></div><i className="fa-solid fa-circle-check" /></article>
      <article><div><span>Needs attention</span><strong>{summary.pending}</strong><p>Payments and approvals</p></div><i className="fa-solid fa-clock" /></article>
    </section>

    {rescheduleRequests.length > 0 && <section className="da-reschedule-panel">
      <header><div><p className="dk-welcome-label">Doctor Approval</p><h2>Reschedule requests</h2></div><span>{rescheduleRequests.length} pending</span></header>
      <div className="da-reschedule-list">{rescheduleRequests.map((request) => <article key={request.id}>
        <div className="da-reschedule-copy"><div><em>Patient request</em><em>Pending review</em></div><h3>{request.patient}</h3><p>Current: <strong>{new Date(`${request.currentDate}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} · {request.currentTime}</strong></p><p>Requested: <strong>{new Date(`${request.requestedDate}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} · {request.requestedTime}</strong></p>{request.reason && <blockquote>“{request.reason}”</blockquote>}</div>
        <div className="da-reschedule-actions"><button type="button" className="dk-btn dk-btn-outline" disabled={reviewingId === request.id} onClick={() => review(request.id, "rejected")}><i className="fa-solid fa-xmark" /> Reject</button><button type="button" className="dk-btn dk-btn-pink" disabled={reviewingId === request.id} onClick={() => review(request.id, "approved")}><i className={`fa-solid ${reviewingId === request.id ? "fa-spinner fa-spin" : "fa-circle-check"}`} /> Approve</button></div>
      </article>)}</div>
    </section>}

    <section className="ma-filters">
      <label className="ma-search"><i className="fa-solid fa-magnifying-glass" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient, email, phone, treatment, or reference..." /></label>
      <div className="ma-filter-row">
        <div className="ma-segmented" role="group" aria-label="Filter by date">{(["today", "upcoming", "past", "all"] as TimelineFilter[]).map((item) => <button type="button" key={item} className={timeline === item ? "active" : ""} onClick={() => setTimeline(item)}><i className={`fa-solid ${item === "today" ? "fa-calendar-day" : item === "upcoming" ? "fa-calendar-plus" : item === "past" ? "fa-calendar-xmark" : "fa-list"}`} /> {item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div>
        <span><i className="fa-solid fa-filter" /> {filtered.length} of {appointments.length}</span>
      </div>
      <div className="ma-status-row"><div><span>Status</span><div>{(["all", "pending", "confirmed", "completed", "cancelled", "no_show"] as StatusFilter[]).map((item) => <button type="button" key={item} className={status === item ? "active" : ""} onClick={() => setStatus(item)}>{item === "all" ? "All" : item === "no_show" ? "No show" : item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div></div><button type="button" className="ma-reset" onClick={resetFilters}><i className="fa-solid fa-xmark" /> Reset filters</button></div>
    </section>

    <section className="ma-timeline" aria-live="polite">
      {Object.entries(groups).map(([date, items]) => {
        const heading = dateHeading(date, today);
        return <div className="ma-date-group" key={date}>
          <header><div><span>{heading.label}</span><h2>{heading.date}</h2></div><em>{items.length} booking{items.length === 1 ? "" : "s"}</em></header>
          <div className="ma-booking-list">{items.map((appointment) => {
            const isUpdating = updatingId === appointment.id;
            const isExpanded = expandedId === appointment.id;
            return <article className={`ma-booking-card ${isExpanded ? "expanded" : ""}`} key={appointment.id}>
              <div className={`ma-time-card ma-time-${appointment.status}`}><span>Clinic</span><strong>{appointment.time}</strong><small>The Klinique</small></div>
              <div className="ma-patient-avatar">{initials(appointment.patient)}</div>
              <div className="ma-booking-main">
                <div className="ma-booking-title"><h3>{appointment.patient}</h3><span className="ma-visit-pill"><i className="fa-solid fa-hospital" /> Clinic</span><span className={`dk-badge dk-badge-${appointment.status}`}>{appointmentStatusLabel(appointment)}</span></div>
                <div className="ma-contact"><span><i className="fa-solid fa-user-doctor" /> Dr. Kharyl</span>{appointment.email && <span><i className="fa-solid fa-envelope" /> {appointment.email}</span>}{appointment.phone && <span><i className="fa-solid fa-phone" /> {appointment.phone}</span>}</div>
                <p className="ma-service"><strong>Service:</strong> {appointment.service}</p>
                {isExpanded && <div className="ma-extra"><div><span>Reference</span><strong>{appointment.referenceNo}</strong></div><div><span>Payment</span><strong>{appointment.paymentStatus === "paid" ? "Reservation paid" : appointment.paymentStatus === "awaiting_payment" ? "Awaiting reservation fee" : "Clinic booking"}</strong></div><div><span>Estimate</span><strong>₱{appointment.amount.toLocaleString()}</strong></div>{appointment.notes && <div className="wide"><span>Patient notes</span><strong>{appointment.notes}</strong></div>}</div>}
              </div>
              <div className="ma-actions">
                <button type="button" className="ma-detail-btn" onClick={() => setExpandedId(isExpanded ? null : appointment.id)}><i className={`fa-solid fa-chevron-${isExpanded ? "up" : "down"}`} /> {isExpanded ? "Less" : "Details"}</button>
                {["confirmed", "completed"].includes(appointment.status) && <button type="button" className="ma-primary-btn" onClick={() => onOpenClinicalWorkspace(appointment)}><i className={`fa-solid ${appointment.serviceCategory === "consultations" ? "fa-comment-medical" : "fa-syringe"}`} /> Open {appointment.serviceCategory === "consultations" ? "consultation" : "treatment"}</button>}
                {appointment.status === "confirmed" && <button type="button" className="ma-primary-btn" disabled={isUpdating} onClick={() => update(appointment.id, "completed")}><i className="fa-solid fa-check-double" /> Complete</button>}
                {appointment.status === "confirmed" && <button type="button" className="ma-detail-btn" disabled={isUpdating} onClick={() => update(appointment.id, "no_show")}><i className="fa-solid fa-user-slash" /> No show</button>}
                {["pending", "confirmed"].includes(appointment.status) && <button type="button" className="ma-cancel-btn" disabled={isUpdating} onClick={() => update(appointment.id, "cancelled")}><i className="fa-solid fa-xmark" /> Cancel</button>}
              </div>
            </article>;
          })}</div>
        </div>;
      })}
      {!filtered.length && <div className="ma-empty"><i className="fa-regular fa-calendar-xmark" /><h3>No matching appointments</h3><p>Try changing the date or status filters.</p><button type="button" onClick={resetFilters}>Show all appointments</button></div>}
    </section>
  </div>;
}
