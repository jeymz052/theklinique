"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type CalendarEvent = { id: string; date: string; time: string; status: string; title: string; patient: string; reference: string; own: boolean };
type CalendarBlock = { id: string; blocked_date: string; reason: string | null };
const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const monday = (date: Date) => addDays(date, -((date.getDay() + 6) % 7));

export default function ClinicCalendar() {
  const [mode, setMode] = useState<"week" | "month">("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const range = useMemo(() => {
    if (mode === "week") { const start = monday(cursor); return { start, end: addDays(start, 6) }; }
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1); return { start, end: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0) };
  }, [cursor, mode]);
  const days = useMemo(() => {
    const start = mode === "month" ? monday(range.start) : range.start;
    const end = mode === "month" ? addDays(monday(range.end), 6) : range.end;
    return Array.from({ length: Math.round((end.getTime() - start.getTime()) / 86400000) + 1 }, (_, index) => addDays(start, index));
  }, [mode, range]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) throw new Error("Your session expired. Please sign in again.");
      const response = await fetch(`/api/calendar?start=${key(range.start)}&end=${key(range.end)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to load calendar.");
      if (active) { setEvents(result.events); setBlocks(result.blocks); }
    }).catch((value) => active && setError(value instanceof Error ? value.message : "Unable to load calendar.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [range]);

  const shift = (direction: number) => { setLoading(true); setError(""); setCursor((value) => mode === "week" ? addDays(value, direction * 7) : new Date(value.getFullYear(), value.getMonth() + direction, 1)); };
  const changeMode = (next: "week" | "month") => { setLoading(true); setError(""); setMode(next); };
  const goToday = () => { setLoading(true); setError(""); setCursor(new Date()); };
  const heading = mode === "week" ? `${range.start.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${range.end.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}` : cursor.toLocaleDateString("en-PH", { month: "long", year: "numeric" });

  return <section className="clinic-calendar"><header><div><p>SHARED CLINIC CALENDAR</p><h1>Bookings &amp; blocked dates</h1><span>See the clinic schedule at a glance. Patient information stays private.</span></div><div className="clinic-calendar__modes"><button className={mode === "week" ? "active" : ""} onClick={() => changeMode("week")}>Week</button><button className={mode === "month" ? "active" : ""} onClick={() => changeMode("month")}>Month</button></div></header><div className="clinic-calendar__legend"><span className="available"><i /> Available</span><span className="unavailable"><i /> Not available / Booked</span><span className="past"><i /> Past time</span><span className="blocked"><i /> Blocked date</span></div><div className="clinic-calendar__toolbar"><strong>{heading}</strong><div><button onClick={() => shift(-1)}><i className="fa-solid fa-chevron-left" /> Previous</button><button onClick={goToday}>Today</button><button onClick={() => shift(1)}>Next <i className="fa-solid fa-chevron-right" /></button></div></div>{error ? <p className="bk-form-error">{error}</p> : loading ? <div className="clinic-calendar__loading"><i className="fa-solid fa-spinner fa-spin" /> Loading calendar...</div> : <div className={`clinic-calendar__grid ${mode}`}><div className="clinic-calendar__weekdays">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day) => <span key={day}>{day}</span>)}</div><div className="clinic-calendar__days">{days.map((day) => { const dayKey = key(day); const dayEvents = events.filter((item) => item.date === dayKey); const block = blocks.find((item) => item.blocked_date === dayKey); const pastDay = dayKey < key(new Date()); return <article key={dayKey} className={`${day.getMonth() !== cursor.getMonth() && mode === "month" ? "outside" : ""} ${dayKey === key(new Date()) ? "today" : ""}`}><div className="clinic-calendar__date"><span>{mode === "week" ? day.toLocaleDateString("en-PH", { weekday: "short" }) : ""}</span><strong>{day.getDate()}</strong></div>{block && <div className="clinic-calendar__block"><i className="fa-solid fa-ban" /><span>Blocked date<small>{block.reason || "Clinic unavailable"}</small></span></div>}<div className="clinic-calendar__events">{dayEvents.map((event) => { const past = new Date(`${event.date}T${event.time}:00`).getTime() < Date.now(); return <div className={`clinic-calendar__event ${event.own ? "own" : ""} ${past ? "past" : "unavailable"}`} key={event.id}><time>{event.time}</time><strong>{past ? "Past time" : event.title}</strong>{!past && event.patient && <span>{event.patient}</span>}<small>{past ? event.title : `Not available · ${event.status}`}</small></div>; })}{!block && !dayEvents.length && <span className={`clinic-calendar__empty ${pastDay ? "past" : "available"}`}>{pastDay ? "Past date" : "Available"}</span>}</div></article>; })}</div></div>}</section>;
}
