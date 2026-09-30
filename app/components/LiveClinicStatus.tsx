"use client";

import { useEffect, useState } from "react";
import type { BookingSlot } from "@/lib/bookingAvailability";

type Availability = {
  isOpen: boolean;
  hours?: string;
  reason?: string | null;
  slots: BookingSlot[];
};

type LiveClinicStatusProps = {
  onAction?: () => void;
  actionLabel?: string;
};

function clinicDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default function LiveClinicStatus({ onAction, actionLabel = "Book a slot" }: LiveClinicStatusProps) {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/booking-availability?date=${clinicDate()}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (active) { setAvailability(result); setError(false); }
      } catch { if (active) setError(true); }
    };
    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [refreshKey]);

  const available = availability?.slots.filter((slot) => slot.status === "available") || [];
  const futureSlots = availability?.slots.filter((slot) => slot.status !== "past") || [];
  const nextSlot = available[0];
  const state = !availability?.isOpen ? "closed" : available.length ? "open" : futureSlots.length ? "full" : "finished";
  const title = error ? "Status unavailable" : state === "open" ? "Accepting appointments" : state === "full" ? "Fully booked today" : state === "finished" ? "Clinic day finished" : "Closed today";
  const detail = error ? "Refresh to check availability." : state === "open" ? `${available.length} slot${available.length === 1 ? "" : "s"} still available` : availability?.reason || (state === "full" ? "No open slots remain today." : "Check the booking calendar for the next clinic day.");
  const todayLabel = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());

  return <section className={`sidebar-clinic sidebar-clinic--${state}`} aria-label="Live clinic availability">
    <header className="sidebar-clinic__heading"><span>Available today</span><i className={`fa-solid ${state === "open" ? "fa-circle-check" : "fa-circle-minus"}`} /><button type="button" onClick={() => setRefreshKey((value) => value + 1)} aria-label="Refresh clinic status"><i className="fa-solid fa-rotate" /></button></header>
    <div className="sidebar-clinic__panel">
      <div className="sidebar-clinic__identity"><span><i className="fa-solid fa-house-medical" /></span><div><strong>The Klinique</strong><small>Medical Aesthetics</small></div></div>
      <div className="sidebar-clinic__summary"><p className="sidebar-clinic__state"><i /><strong>{availability ? title : "Checking…"}</strong></p>{availability?.hours && <p className="sidebar-clinic__hours"><i className="fa-regular fa-clock" /> {availability.hours}</p>}</div>
      <p className="sidebar-clinic__detail">{detail}</p>
      {state === "open" && <div className="sidebar-clinic__next"><span>Next available</span><strong>{nextSlot.label}</strong></div>}
      {onAction && <button type="button" className="sidebar-clinic__action" onClick={onAction}><i className="fa-regular fa-calendar-plus" /><span>{state === "open" ? actionLabel : "View calendar"}</span><i className="fa-solid fa-chevron-right" /></button>}
    </div>
    <footer><i className="fa-regular fa-calendar" /> {todayLabel}</footer>
  </section>;
}
