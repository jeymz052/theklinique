"use client";

import { useEffect, useMemo, useState } from "react";
import { appointmentStatusLabel, type Appointment } from "@/lib/appointments";
import type { RescheduleRequest } from "@/lib/rescheduleRequests";

type PatientAppointmentsProps = {
  appointments: Appointment[];
  payingAppointmentId: string | null;
  onBook: () => void;
  onPay: (appointmentId: string) => void;
  onVerify: (appointmentId: string) => void;
  rescheduleRequests: RescheduleRequest[];
  onCancel: (appointmentId: string, reason: string) => Promise<void>;
  onReschedule: (appointmentId: string, date: string, time: string, reason: string) => Promise<void>;
};

type AppointmentFilter = "upcoming" | "history";

type Slot = { time: string; label: string; status: "available" | "unavailable" | "past" };

export default function PatientAppointments({ appointments, payingAppointmentId, onBook, onPay, onVerify, rescheduleRequests, onCancel, onReschedule }: PatientAppointmentsProps) {
  const [filter, setFilter] = useState<AppointmentFilter>("upcoming");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<{ type: "cancel" | "reschedule"; appointment: Appointment } | null>(null);
  const [reason, setReason] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedTime, setRequestedTime] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const visible = useMemo(() => appointments.filter((appointment) => filter === "upcoming"
    ? ["pending", "confirmed"].includes(appointment.status) && appointment.date >= today
    : !(["pending", "confirmed"].includes(appointment.status) && appointment.date >= today)), [appointments, filter, today]);
  const selected = appointments.find((appointment) => appointment.id === selectedId) || null;

  useEffect(() => {
    if (action?.type !== "reschedule" || !requestedDate) return;
    fetch(`/api/booking-availability?date=${encodeURIComponent(requestedDate)}`)
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to load times."); return result; })
      .then((result) => setSlots(result.slots || []))
      .catch((error) => setActionError(error instanceof Error ? error.message : "Unable to load available times."));
  }, [action?.type, requestedDate]);

  function openAction(type: "cancel" | "reschedule", appointment: Appointment) {
    setAction({ type, appointment }); setReason(""); setRequestedDate(""); setRequestedTime(""); setSlots([]); setActionError("");
  }

  async function submitAction(event: React.FormEvent) {
    event.preventDefault();
    if (!action) return;
    setSaving(true); setActionError("");
    try {
      if (action.type === "cancel") await onCancel(action.appointment.id, reason);
      else await onReschedule(action.appointment.id, requestedDate, requestedTime, reason);
      setAction(null); setSelectedId(null);
    } catch (error) { setActionError(error instanceof Error ? error.message : "Unable to update the appointment."); }
    finally { setSaving(false); }
  }

  return (
    <div className="pa-workspace">
      <div className="pa-toolbar">
        <div className="pa-tabs" role="tablist" aria-label="Appointment groups">
          <button type="button" role="tab" aria-selected={filter === "upcoming"} className={filter === "upcoming" ? "active" : ""} onClick={() => setFilter("upcoming")}><i className="fa-regular fa-calendar-check" /> Upcoming</button>
          <button type="button" role="tab" aria-selected={filter === "history"} className={filter === "history" ? "active" : ""} onClick={() => setFilter("history")}><i className="fa-solid fa-clock-rotate-left" /> History</button>
        </div>
        <span>{visible.length} appointment{visible.length === 1 ? "" : "s"}</span>
      </div>

      {visible.length ? <div className="pa-list">
        {visible.map((appointment) => {
          const awaitingPayment = appointment.status === "pending" && appointment.paymentStatus === "awaiting_payment";
          const pendingReschedule = rescheduleRequests.find((request) => request.appointmentId === appointment.id && request.status === "pending");
          return <article className="pa-card" key={appointment.id}>
            <div className="pa-date"><strong>{new Date(`${appointment.date}T00:00:00`).toLocaleDateString("en-PH", { day: "2-digit" })}</strong><span>{new Date(`${appointment.date}T00:00:00`).toLocaleDateString("en-PH", { month: "short" })}</span></div>
            <div className="pa-card-main">
              <div className="pa-card-title"><div><small>{appointment.referenceNo}</small><h3>{appointment.service}</h3></div><span className={`dk-badge dk-badge-${appointment.status}`}>{appointmentStatusLabel(appointment)}</span></div>
              <div className="pa-meta"><span><i className="fa-regular fa-clock" /> {appointment.time}</span><span><i className="fa-solid fa-user-doctor" /> Dr. Kharyl Dence</span><span><i className="fa-solid fa-location-dot" /> The Klinique CDO</span></div>
              {awaitingPayment && <p className="pa-payment-note"><i className="fa-solid fa-circle-info" /> Your slot is reserved but becomes confirmed only after the reservation fee is paid.</p>}
              {pendingReschedule && <p className="pa-reschedule-note"><i className="fa-regular fa-clock" /> Reschedule requested for {new Date(`${pendingReschedule.requestedDate}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} at {pendingReschedule.requestedTime}. Your current schedule remains confirmed until approved.</p>}
            </div>
            <div className="pa-actions">
              {awaitingPayment && <button type="button" className="dk-btn dk-btn-pink dk-btn-sm" onClick={() => onVerify(appointment.id)}><i className="fa-solid fa-arrows-rotate" /> Verify payment</button>}
              {awaitingPayment && <button type="button" className="dk-btn dk-btn-outline dk-btn-sm" disabled={payingAppointmentId === appointment.id} onClick={() => onPay(appointment.id)}>{payingAppointmentId === appointment.id ? <><i className="fa-solid fa-spinner fa-spin" /> Opening</> : <><i className="fa-solid fa-qrcode" /> Pay again</>}</button>}
              {appointment.status === "confirmed" && !pendingReschedule && <button type="button" className="dk-btn dk-btn-outline dk-btn-sm" onClick={() => openAction("reschedule", appointment)}><i className="fa-solid fa-calendar-days" /> Reschedule</button>}
              {["pending", "confirmed"].includes(appointment.status) && <button type="button" className="dk-btn dk-btn-outline dk-btn-sm pa-cancel-btn" onClick={() => openAction("cancel", appointment)}><i className="fa-solid fa-ban" /> Cancel</button>}
              <button type="button" className="dk-btn dk-btn-outline dk-btn-sm" onClick={() => setSelectedId(appointment.id)}>View details</button>
            </div>
          </article>;
        })}
      </div> : <div className="dk-empty pa-empty"><div className="dk-empty-icon"><i className="fa-regular fa-calendar" /></div><h3>{filter === "upcoming" ? "No upcoming appointments" : "No appointment history"}</h3><p>{filter === "upcoming" ? "Choose a service and schedule your next clinic visit." : "Completed and cancelled appointments will appear here."}</p>{filter === "upcoming" && <button type="button" className="dk-cta-btn" onClick={onBook}><i className="fa-solid fa-calendar-plus" /> Book Appointment</button>}</div>}

      {selected && <div className="pa-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="pa-detail-title" onClick={(event) => event.target === event.currentTarget && setSelectedId(null)}>
        <section className="pa-detail-card">
          <header><div><small>Appointment {selected.referenceNo}</small><h2 id="pa-detail-title">{selected.service}</h2></div><button type="button" onClick={() => setSelectedId(null)} aria-label="Close details"><i className="fa-solid fa-xmark" /></button></header>
          <div className="pa-detail-status"><span className={`dk-badge dk-badge-${selected.status}`}>{appointmentStatusLabel(selected)}</span><p>{selected.status === "pending" ? "Complete payment or wait for clinic confirmation." : selected.status === "confirmed" ? "Your clinic visit is confirmed." : selected.status === "completed" ? "This appointment has been completed." : selected.status === "no_show" ? "The clinic marked this appointment as a no-show." : "This appointment was cancelled."}</p></div>
          <div className="pa-detail-grid"><div><span>Date</span><strong>{new Date(`${selected.date}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "long" })}</strong></div><div><span>Time</span><strong>{selected.time}</strong></div><div><span>Doctor</span><strong>Dr. Kharyl Dence</strong></div><div><span>Estimated treatment total</span><strong>₱{selected.amount.toLocaleString()}</strong></div></div>
          <div className="pa-lifecycle" aria-label="Appointment progress"><div className="done"><i className="fa-solid fa-check" /><span>Booked</span></div><i /><div className={["confirmed", "completed", "no_show"].includes(selected.status) ? "done" : selected.status === "pending" ? "current" : ""}><i className="fa-solid fa-qrcode" /><span>Confirmed</span></div><i /><div className={selected.status === "completed" ? "done" : ""}><i className="fa-solid fa-stethoscope" /><span>Visit complete</span></div></div>
          {selected.notes && <div className="pa-notes"><span>Your notes</span><p>{selected.notes}</p></div>}
          {selected.status === "pending" && selected.paymentStatus === "awaiting_payment" && <div className="pa-detail-actions"><button type="button" className="dk-btn dk-btn-pink" onClick={() => onVerify(selected.id)}><i className="fa-solid fa-arrows-rotate" /> Verify payment</button><button type="button" className="dk-btn dk-btn-outline" onClick={() => onPay(selected.id)}><i className="fa-solid fa-qrcode" /> Pay again</button></div>}
        </section>
      </div>}

      {action && <div className="pa-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="pa-action-title" onClick={(event) => event.target === event.currentTarget && !saving && setAction(null)}>
        <form className="pa-action-card" onSubmit={submitAction}>
          <header><div><small>{action.appointment.referenceNo}</small><h2 id="pa-action-title">{action.type === "cancel" ? "Cancel appointment" : "Request a new schedule"}</h2></div><button type="button" disabled={saving} onClick={() => setAction(null)} aria-label="Close"><i className="fa-solid fa-xmark" /></button></header>
          <p className="pa-action-copy">{action.type === "cancel" ? "This will cancel your appointment immediately. Reservation fee handling remains subject to the clinic cancellation policy." : "Your current appointment stays confirmed while Dr. Kharyl reviews the request. The schedule changes only after approval."}</p>
          {action.type === "reschedule" && <>
            <label className="pa-action-field"><span>Preferred date</span><input type="date" min={new Date().toISOString().slice(0, 10)} value={requestedDate} onChange={(event) => { setRequestedDate(event.target.value); setRequestedTime(""); setSlots([]); setActionError(""); }} required /></label>
            {requestedDate && <div className="pa-slot-picker"><span>Available times</span><div>{slots.filter((slot) => slot.status === "available").map((slot) => <button type="button" key={slot.time} className={requestedTime === slot.time ? "active" : ""} onClick={() => setRequestedTime(slot.time)}>{slot.label}</button>)}</div>{!slots.some((slot) => slot.status === "available") && <p>No available one-hour slots on this date.</p>}</div>}
          </>}
          <label className="pa-action-field"><span>{action.type === "cancel" ? "Reason for cancellation" : "Reason for rescheduling"}</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Tell the clinic briefly why you need this change." required /></label>
          {actionError && <p className="bk-form-error" role="alert">{actionError}</p>}
          <footer><button type="button" className="dk-btn dk-btn-outline" disabled={saving} onClick={() => setAction(null)}>Keep appointment</button><button type="submit" className={`dk-btn ${action.type === "cancel" ? "pa-danger-btn" : "dk-btn-pink"}`} disabled={saving || !reason.trim() || (action.type === "reschedule" && (!requestedDate || !requestedTime))}>{saving ? <><i className="fa-solid fa-spinner fa-spin" /> Saving</> : action.type === "cancel" ? "Confirm cancellation" : "Send for approval"}</button></footer>
        </form>
      </div>}
    </div>
  );
}
