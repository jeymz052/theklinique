"use client";

import { useEffect, useState } from "react";
import { clinicalApi } from "@/lib/clinicalApi";
import ZoomCall from "./ZoomCall";

type OnlineVisit = { id: string; reference_no: string; appointment_date: string; appointment_time: string; status: string; meetingConfigured: boolean; joinAvailable: boolean };

export default function PatientOnlineConsultations({ onBook, onDocuments, onPay, onVerify, payingId }: { onBook: () => void; onDocuments: () => void; onPay: (id: string) => Promise<void>; onVerify: (id: string) => void; payingId: string | null }) {
  const [visits, setVisits] = useState<OnlineVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomVisit, setZoomVisit] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"upcoming" | "history">("upcoming");
  useEffect(() => {
    let active = true;
    async function refresh() {
      if (active) setNow(Date.now());
      try { const result = await clinicalApi("/api/online-consultations"); if (active) { setVisits(result.visits); setError(""); } }
      catch (error) { if (active) setError((error as Error).message); } finally { if (active) setLoading(false); }
    }
    void refresh(); const timer = window.setInterval(() => void refresh(), 30_000);
    const focus = () => void refresh(); window.addEventListener("focus", focus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, []);
  const upcoming = (visit: OnlineVisit) => ["pending", "confirmed"].includes(visit.status) && new Date(`${visit.appointment_date}T${visit.appointment_time.slice(0, 5)}:00+08:00`).getTime() + 60 * 60_000 > now;
  const visible = visits.filter(visit => filter === "upcoming" ? upcoming(visit) : !upcoming(visit)).sort((a, b) => filter === "upcoming" ? `${a.appointment_date}${a.appointment_time}`.localeCompare(`${b.appointment_date}${b.appointment_time}`) : `${b.appointment_date}${b.appointment_time}`.localeCompare(`${a.appointment_date}${a.appointment_time}`));
  function schedule(visit: OnlineVisit) {
    return new Date(`${visit.appointment_date}T${visit.appointment_time.slice(0, 5)}:00+08:00`);
  }
  function opensAt(visit: OnlineVisit) {
    return new Date(schedule(visit).getTime() - 15 * 60_000).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
  }
  return <div className="patient-online-workspace">
    <section className="pr-hero online-page-hero"><div><p className="dk-welcome-label">Patient portal / Online consultation</p><h1>Care, wherever you are</h1><span>Meet Dr. Kharyl through Zoom inside your patient portal.</span></div><button className="dk-btn dk-btn-pink" type="button" onClick={onBook}><i aria-hidden="true" className="fa-solid fa-plus" /> Book online consultation</button></section>
    <section className="online-consultation-guide"><span><i aria-hidden="true" className="fa-solid fa-video" /></span><div><h2>Your online visit</h2><p>₱600 per consultation · QR Ph via PayMongo · Same clinic hours</p><small>Join opens 15 minutes before your confirmed schedule. Allow camera and microphone access, then wait for the doctor to admit you.</small></div><button className="dk-btn dk-btn-outline" type="button" onClick={onDocuments}><i aria-hidden="true" className="fa-solid fa-file-prescription" /> Medical documents</button></section>
    <div className="clinical-filters" aria-label="Online visit groups"><button className={filter === "upcoming" ? "active" : ""} type="button" onClick={() => setFilter("upcoming")}>Upcoming visits</button><button className={filter === "history" ? "active" : ""} type="button" onClick={() => setFilter("history")}>Past visits</button></div>
    {error && <p className="bk-form-error" role="alert">{error}</p>}
    {loading ? <div className="pr-loading">Loading online consultations…</div> : visible.length ? <div className="online-visit-list">{visible.map(visit => <article key={visit.id}>
      <div className="online-visit-icon"><i aria-hidden="true" className="fa-solid fa-video" /></div>
      <div className="online-visit-details"><div className="online-visit-meta"><span className={`clinical-pill ${visit.status === "completed" ? "completed" : "online"}`}>{visit.status === "pending" ? "Awaiting payment" : visit.status.replaceAll("_", " ")}</span><small>{visit.reference_no}</small></div>
        <h2>Online consultation with Dr. Kharyl</h2>
        <div className="online-visit-schedule"><span><i aria-hidden="true" className="fa-regular fa-calendar" /> {schedule(visit).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" })}</span><span><i aria-hidden="true" className="fa-regular fa-clock" /> {schedule(visit).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", timeStyle: "short" })} PHT</span></div>
        <p>Zoom inside your portal · ₱600</p>
        {visit.joinAvailable ? <p className="online-join-ready"><i aria-hidden="true" className="fa-solid fa-circle-check" /> Your room is ready. Join and wait for the doctor to admit you.</p> : visit.status === "confirmed" && upcoming(visit) && visit.meetingConfigured ? <p className="online-join-schedule"><i aria-hidden="true" className="fa-solid fa-lock" /> Joining opens {opensAt(visit)} PHT.</p> : <p className="clinical-help">{visit.status === "pending" ? "Complete your payment to confirm this online consultation." : visit.status === "completed" ? "Your consultation is complete. Released prescriptions are in Medical Documents." : visit.status === "confirmed" && upcoming(visit) ? "Your Zoom consultation room is being prepared by the clinic." : "This visit is no longer available to join."}</p>}
      </div>
      <div className="online-visit-actions">{visit.status === "confirmed" && upcoming(visit) && <><button type="button" className="dk-btn dk-btn-pink" disabled={!visit.joinAvailable || Boolean(zoomVisit)} onClick={() => setZoomVisit(visit.id)}><i aria-hidden="true" className="fa-solid fa-video" /> {zoomVisit === visit.id ? "Call open" : "Join Zoom in portal"}</button>{!visit.joinAvailable && <span className="online-join-label">{visit.meetingConfigured ? "Available before your visit" : "Room being prepared"}</span>}</>}
        {visit.status === "pending" && upcoming(visit) && <><button type="button" className="dk-btn dk-btn-pink" disabled={payingId === visit.id} onClick={() => void onPay(visit.id)}>{payingId === visit.id ? "Opening…" : "Pay ₱600 via QR Ph"}</button><button type="button" className="dk-btn dk-btn-outline" onClick={() => onVerify(visit.id)}>Verify payment</button></>}
        {visit.status === "completed" && <button type="button" className="dk-btn dk-btn-outline" onClick={onDocuments}>View medical documents</button>}
      </div>
    </article>)}</div> : <div className="clinical-empty"><i aria-hidden="true" className="fa-solid fa-video" /><h2>{filter === "upcoming" ? "No upcoming online consultations" : "No past online consultations"}</h2><p>Book a video consultation and your schedule and meeting access will appear here.</p>{filter === "upcoming" && <button className="dk-btn dk-btn-pink" type="button" onClick={onBook}>Book online consultation</button>}</div>}
    {zoomVisit && <ZoomCall key={zoomVisit} appointmentId={zoomVisit} title="Consultation with Dr. Kharyl" onClose={() => setZoomVisit(null)} />}
  </div>;
}
