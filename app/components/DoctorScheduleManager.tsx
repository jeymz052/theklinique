"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatSlotLabel, hourlyTimes, normalizeTime } from "@/lib/bookingAvailability";

type Schedule = { id: string; day_of_week: number; open_time: string; close_time: string; is_active: boolean };
type BlockedDate = { id: string; blocked_date: string; reason: string | null; created_at: string };
type Props = { doctorName: string; initialTab?: "schedule" | "blocks" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "18:00";

async function authorizedFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Your session expired. Please sign in again.");
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, ...init?.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The schedule request failed.");
  return result;
}

const dateValue = (date: string) => new Date(`${date}T00:00:00`);

export default function DoctorScheduleManager({ doctorName, initialTab = "schedule" }: Props) {
  const [tab, setTab] = useState(initialTab);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [blocks, setBlocks] = useState<BlockedDate[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [openTime, setOpenTime] = useState(DEFAULT_OPEN);
  const [closeTime, setCloseTime] = useState(DEFAULT_CLOSE);
  const [active, setActive] = useState(true);
  const [blockDate, setBlockDate] = useState("");
  const [blockEndDate, setBlockEndDate] = useState("");
  const [blockMode, setBlockMode] = useState<"single" | "range">("single");
  const [blockReason, setBlockReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await authorizedFetch("/api/doctor-schedule");
      setSchedules(result.schedules); setBlocks(result.blocks); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load schedule."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const byDay = useMemo(() => new Map(schedules.map((row) => [row.day_of_week, row])), [schedules]);
  const activeDays = schedules.filter((row) => row.is_active).length;
  const weeklyHours = schedules.reduce((sum, row) => {
    if (!row.is_active) return sum;
    const [oh, om] = normalizeTime(row.open_time).split(":").map(Number);
    const [ch, cm] = normalizeTime(row.close_time).split(":").map(Number);
    return sum + Math.max(0, (ch * 60 + cm - oh * 60 - om) / 60);
  }, 0);
  const slotPreview = active && openTime < closeTime ? hourlyTimes(openTime, closeTime) : [];
  const todayIndex = new Date().getDay();
  const todayKey = new Date().toLocaleDateString("en-CA");
  const nextBlock = blocks.find((block) => block.blocked_date >= todayKey);
  const blockRangeDays = blockDate && (blockMode === "single" || blockEndDate) && (blockMode === "single" || blockEndDate >= blockDate)
    ? Math.floor((Date.parse(`${blockMode === "single" ? blockDate : blockEndDate}T00:00:00Z`) - Date.parse(`${blockDate}T00:00:00Z`)) / 86_400_000) + 1
    : 0;

  const startEdit = (day: number) => {
    const row = byDay.get(day);
    setEditing(day); setOpenTime(row ? normalizeTime(row.open_time) : DEFAULT_OPEN); setCloseTime(row ? normalizeTime(row.close_time) : DEFAULT_CLOSE);
    setActive(row?.is_active ?? true); setError(""); setMessage("");
  };

  const saveSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editing === null) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await authorizedFetch("/api/doctor-schedule", { method: "PUT", body: JSON.stringify({ dayOfWeek: editing, openTime, closeTime, isActive: active }) });
      await load(); setMessage(`${DAYS[editing]} availability saved. Booking now uses these hours.`); setEditing(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save schedule."); }
    finally { setBusy(false); }
  };

  const addBlock = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await authorizedFetch("/api/doctor-schedule", { method: "POST", body: JSON.stringify({ startDate: blockDate, endDate: blockMode === "range" ? blockEndDate : blockDate, reason: blockReason }) });
      await load(); setBlockDate(""); setBlockEndDate(""); setBlockReason("");
      const skipped = result.requested - result.added;
      setMessage(`${result.added} ${result.added === 1 ? "date" : "dates"} blocked.${skipped > 0 ? ` ${skipped} already blocked and skipped.` : ""} Patients can no longer book ${result.added === 1 ? "that day" : "those days"}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to block date."); }
    finally { setBusy(false); }
  };

  const removeBlock = async (id: string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      await authorizedFetch(`/api/doctor-schedule?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load(); setMessage("Blocked date removed. Its normal weekly hours are available again.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to remove blocked date."); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="dk-empty"><i className="fa-solid fa-spinner fa-spin dk-schedule-spinner" /><p>Loading the booking schedule…</p></div>;

  return (
    <div className="dk-schedule-manager">
      <section className="dk-schedule-hero">
        <div className="dk-schedule-hero-copy">
          <span className="dk-schedule-live"><i /> Booking calendar live</span>
          <p className="dk-workspace-label">Doctor availability</p><h2>Shape your clinic week.</h2>
          <p>Set the rhythm once. Every date and time patients see is generated from this calendar.</p>
          <div className="dk-schedule-doctor"><span>{doctorName.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><div><small>Schedule owner</small><strong>{doctorName}</strong></div></div>
        </div>
        <div className="dk-schedule-hero-art" aria-hidden="true"><span className="dk-schedule-art-day"><small>Today</small><strong>{new Date().getDate()}</strong></span><i className="fa-regular fa-calendar-check" /><span className="dk-schedule-art-line one" /><span className="dk-schedule-art-line two" /><span className="dk-schedule-art-dot" /></div>
      </section>

      <div className="dk-schedule-summary">
        <span><i className="fa-solid fa-calendar-week" /><em><small>Active week</small><strong>{activeDays} of 7 days</strong></em></span>
        <span><i className="fa-regular fa-clock" /><em><small>Bookable capacity</small><strong>{weeklyHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hours / week</strong></em></span>
        <span><i className="fa-solid fa-ban" /><em><small>Calendar blocks</small><strong>{blocks.length} saved</strong></em></span>
        <span><i className="fa-solid fa-plane-departure" /><em><small>Next time away</small><strong>{nextBlock ? dateValue(nextBlock.blocked_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "Nothing planned"}</strong></em></span>
      </div>

      <div className="dk-schedule-toolbar">
        <div className="dk-schedule-tabs" role="tablist"><button type="button" className={tab === "schedule" ? "active" : ""} onClick={() => setTab("schedule")}><i className="fa-regular fa-calendar" /> Weekly schedule</button><button type="button" className={tab === "blocks" ? "active" : ""} onClick={() => setTab("blocks")}><i className="fa-solid fa-calendar-xmark" /> Blocked dates <b>{blocks.length}</b></button></div>
        <p><i className="fa-solid fa-circle-info" /> Changes update patient booking immediately</p>
      </div>
      {error && <p className="dk-schedule-alert error"><i className="fa-solid fa-circle-exclamation" /> {error}</p>}
      {message && <p className="dk-schedule-alert success"><i className="fa-solid fa-circle-check" /> {message}</p>}

      {tab === "schedule" ? <div className="dk-schedule-layout">
        <section className="dk-panel dk-schedule-week">
          <div className="dk-panel-hdr"><div><p className="dk-workspace-label">Recurring availability</p><p className="dk-panel-title">Your clinic week</p><p className="dk-panel-sub">Select a day to adjust its appointment window.</p></div><span className="dk-week-legend"><i /> Open for booking</span></div>
          <div className="dk-schedule-day-list">{DAYS.map((day, index) => {
            const row = byDay.get(index); const slots = row?.is_active ? hourlyTimes(row.open_time, row.close_time).length : 0;
            return <button type="button" key={day} className={`dk-schedule-day ${row?.is_active ? "open" : "closed"} ${editing === index ? "selected" : ""} ${todayIndex === index ? "today" : ""}`} onClick={() => startEdit(index)}>
              <span className="dk-schedule-day-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="dk-schedule-day-name"><span><strong>{day}</strong><small>{todayIndex === index ? "Today · " : ""}{row?.is_active ? `${slots} appointment slots` : "Rest day"}</small></span></span>
              <span className="dk-schedule-hours">{row?.is_active ? <><b>{formatSlotLabel(row.open_time)}</b><i /><b>{formatSlotLabel(row.close_time)}</b></> : <b>Closed</b>}</span>
              <span className="dk-schedule-row-action"><i className="fa-solid fa-arrow-right" /></span>
            </button>;
          })}</div>
        </section>
        <aside className="dk-panel dk-schedule-editor">
          <div className="dk-panel-hdr dk-editor-head"><div><p className="dk-workspace-label">Availability editor</p><p className="dk-panel-title">{editing === null ? "Choose a day" : DAYS[editing]}</p></div>{editing !== null && <span className={`dk-editor-state ${active ? "active" : ""}`}>{active ? "Open" : "Closed"}</span>}</div>
          {editing === null ? <div className="dk-empty dk-schedule-empty"><div className="dk-empty-icon"><i className="fa-solid fa-arrow-pointer" /></div><h3>Pick a day to begin</h3><p>Your changes are previewed here before they go live in patient booking.</p><div className="dk-empty-hint"><i className="fa-solid fa-shield-halved" /> Schedule changes are server-enforced</div></div> : <form className="dk-schedule-form" onSubmit={saveSchedule}>
            <label className="dk-schedule-switch"><span><strong>Accept bookings</strong><small>Turn off to close this entire weekday.</small></span><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><i /></label>
            <div className="dk-time-presets"><span>Quick set</span>{[["9–5", "09:00", "17:00"], ["9–6", "09:00", "18:00"], ["10–7", "10:00", "19:00"]].map(([label, start, end]) => <button type="button" key={label} disabled={!active} onClick={() => { setOpenTime(start); setCloseTime(end); }}>{label}</button>)}</div>
            <div className="dk-schedule-time-grid"><label>Opens<input type="time" step="1800" value={openTime} onChange={(event) => setOpenTime(event.target.value)} disabled={!active} required /></label><label>Closes<input type="time" step="1800" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} disabled={!active} required /></label></div>
            <div className={`dk-slot-preview ${active ? "" : "closed"}`}><div><span><i className="fa-solid fa-wand-magic-sparkles" /> Patient slot preview</span><small>{active ? `${slotPreview.length} bookable times` : "No times generated"}</small></div>{active && slotPreview.length ? <div className="dk-slot-chips">{slotPreview.map((slot) => <span key={slot}>{formatSlotLabel(slot)}</span>)}</div> : <p>{DAYS[editing]} will be hidden from booking availability.</p>}</div>
            <button className="dk-btn dk-btn-primary dk-schedule-save" disabled={busy}>{busy ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-floppy-disk" />} Save hours</button>
          </form>}
        </aside>
      </div> : <div className="dk-schedule-layout">
        <section className="dk-panel dk-schedule-week">
          <div className="dk-panel-hdr"><div><p className="dk-workspace-label">Exceptions</p><p className="dk-panel-title">Time away & closures</p><p className="dk-panel-sub">These dates override your recurring weekly schedule.</p></div><span className="dk-week-legend blocked"><i /> Booking disabled</span></div>
          <div className="dk-block-list">{blocks.length === 0 ? <div className="dk-empty"><div className="dk-empty-icon"><i className="fa-solid fa-calendar-check" /></div><h3>No blocked dates</h3><p>All dates currently follow the weekly schedule.</p></div> : blocks.map((block) => <article className="dk-block-row" key={block.id}>
            <span className="dk-block-date"><small>{dateValue(block.blocked_date).toLocaleDateString("en-PH", { month: "short" })}</small><b>{dateValue(block.blocked_date).getDate()}</b><em>{dateValue(block.blocked_date).toLocaleDateString("en-PH", { weekday: "short" })}</em></span>
            <span className="dk-block-copy"><small>Full-day block</small><strong>{block.reason || "Not available"}</strong><span><i className="fa-regular fa-calendar-xmark" /> Patients cannot select this date</span></span>
            <button type="button" aria-label="Remove blocked date" title="Remove block" disabled={busy} onClick={() => void removeBlock(block.id)}><i className="fa-regular fa-trash-can" /></button>
          </article>)}</div>
        </section>
        <aside className="dk-panel dk-schedule-editor">
          <div className="dk-panel-hdr dk-block-editor-head"><div className="dk-block-editor-icon"><i className="fa-solid fa-umbrella-beach" /></div><div><p className="dk-workspace-label">New exception</p><p className="dk-panel-title">Plan time away</p></div></div>
          <form className="dk-schedule-form" onSubmit={addBlock}>
            <div className="dk-block-mode" role="group" aria-label="Blocked date type"><button type="button" className={blockMode === "single" ? "active" : ""} onClick={() => { setBlockMode("single"); setBlockEndDate(""); }}><i className="fa-regular fa-calendar" /> Single day</button><button type="button" className={blockMode === "range" ? "active" : ""} onClick={() => setBlockMode("range")}><i className="fa-solid fa-calendar-days" /> Date range</button></div>
            <div className={blockMode === "range" ? "dk-block-date-grid" : ""}><label>{blockMode === "range" ? "From" : "Date"}<input type="date" value={blockDate} max={blockMode === "range" && blockEndDate ? blockEndDate : undefined} onChange={(event) => setBlockDate(event.target.value)} required /></label>{blockMode === "range" && <label>Up to<input type="date" value={blockEndDate} min={blockDate || undefined} onChange={(event) => setBlockEndDate(event.target.value)} required /></label>}</div>
            {blockMode === "range" && <div className={`dk-block-range-preview ${blockRangeDays ? "valid" : ""}`}><i className="fa-solid fa-arrow-right-long" /><span><strong>{blockRangeDays ? `${blockRangeDays} ${blockRangeDays === 1 ? "day" : "days"} selected` : "Select the end date"}</strong><small>{blockRangeDays ? `${dateValue(blockDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} through ${dateValue(blockEndDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}` : "The range includes both the start and end dates."}</small></span></div>}
            <label>Reason <small>(optional)</small><textarea value={blockReason} onChange={(event) => setBlockReason(event.target.value)} placeholder="e.g. Conference, holiday, clinic maintenance" rows={4} /></label><div className="dk-block-impact"><i className="fa-solid fa-circle-info" /><span><strong>What happens?</strong><small>All generated appointment slots are removed for {blockMode === "range" ? "every date in this range" : "this date"}. Existing appointments remain in your records.</small></span></div><button className="dk-btn dk-btn-primary dk-schedule-save" disabled={busy || !blockRangeDays}>{busy ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-calendar-xmark" />} {blockMode === "range" ? `Block ${blockRangeDays || "selected"} ${blockRangeDays === 1 ? "day" : "days"}` : "Block this date"}</button>
          </form>
        </aside>
      </div>}
    </div>
  );
}
