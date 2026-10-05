"use client";

import type { Appointment } from "@/lib/appointments";

type DashboardRole = "admin" | "doctor" | "secretary" | "patient";

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#1f9d68",
  pending: "#e8a23a",
  completed: "#8b5cf6",
  cancelled: "#e35d6a",
};

function shortDay(date: Date) {
  return date.toLocaleDateString("en-PH", { weekday: "short" }).slice(0, 2);
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function DashboardInsights({ appointments, role }: { appointments: Appointment[]; role: DashboardRole }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = toDateKey(date);
    return { key, label: shortDay(date), value: appointments.filter((item) => item.date === key).length };
  });
  const maxDay = Math.max(1, ...days.map((day) => day.value));
  const statuses = (["confirmed", "pending", "completed", "cancelled"] as const).map((status) => ({
    status,
    count: appointments.filter((item) => item.status === status).length,
  }));
  const total = Math.max(1, appointments.length);
  const completionRate = Math.round((statuses.find((item) => item.status === "completed")!.count / total) * 100);
  const confirmationRate = Math.round(((statuses.find((item) => item.status === "confirmed")!.count + statuses.find((item) => item.status === "completed")!.count) / total) * 100);
  const topServices = Array.from(appointments.reduce((map, item) => map.set(item.service, (map.get(item.service) || 0) + 1), new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const upcoming = appointments.filter((item) => item.date >= toDateKey(today) && item.status === "confirmed").slice(0, 3);
  const activeValue = appointments.filter((item) => item.status === "confirmed" || item.status === "completed").reduce((sum, item) => sum + item.amount, 0);
  const averageValue = appointments.length ? Math.round(appointments.reduce((sum, item) => sum + item.amount, 0) / appointments.length) : 0;
  const busiestDay = days.reduce((best, day) => day.value > best.value ? day : best, days[0]);
  const statusStops = statuses.reduce<{ stop: number; parts: string[] }>((acc, item) => {
    const next = acc.stop + (item.count / total) * 100;
    acc.parts.push(`${STATUS_COLORS[item.status]} ${acc.stop}% ${next}%`);
    acc.stop = next;
    return acc;
  }, { stop: 0, parts: [] });

  const copy = {
    admin: { eyebrow: "Practice intelligence", title: "Clinic performance", sub: "Live operational signals from the appointment ledger.", rate: confirmationRate, rateLabel: "Conversion", rateSub: "Confirmed or completed" },
    doctor: { eyebrow: "Clinical pulse", title: "Care delivery snapshot", sub: "Patient flow and treatment demand at a glance.", rate: completionRate, rateLabel: "Completion", rateSub: "Visits completed" },
    secretary: { eyebrow: "Front desk pulse", title: "Booking operations", sub: "The queue, workload, and confirmation health for this week.", rate: confirmationRate, rateLabel: "Confirmation", rateSub: "Bookings secured" },
    patient: { eyebrow: "Your care activity", title: "Appointment journey", sub: "A simple view of your visits and booking progress.", rate: completionRate, rateLabel: "Completed", rateSub: "Treatment visits" },
  }[role];

  return (
    <section className={`dx-insights dx-insights--${role}`} aria-label={`${copy.title} analytics`}>
      <div className="dx-insights-head">
        <div><p className="dx-eyebrow">{copy.eyebrow}</p><h2>{copy.title}</h2><p>{copy.sub}</p></div>
        <span className="dx-live"><i /> Live data</span>
      </div>
      <div className="dx-insights-grid">
        <article className="dx-chart-card dx-chart-card--wide">
          <div className="dx-chart-title"><div><strong>7-day activity</strong><span>Appointments by scheduled date</span></div><i className="fa-solid fa-chart-column" /></div>
          <div className="dx-bars" role="img" aria-label={`Appointments in the last seven days: ${days.map((day) => `${day.label} ${day.value}`).join(", ")}`}>
            {days.map((day) => <div className="dx-bar-column" key={day.key}><span className="dx-bar-value">{day.value}</span><div className="dx-bar-track"><i style={{ height: `${Math.max(day.value ? 16 : 4, (day.value / maxDay) * 100)}%` }} /></div><small>{day.label}</small></div>)}
          </div>
        </article>

        <article className="dx-chart-card">
          <div className="dx-chart-title"><div><strong>Status mix</strong><span>{appointments.length} total bookings</span></div><i className="fa-solid fa-chart-pie" /></div>
          <div className="dx-donut-row">
            <div className="dx-donut" style={{ background: appointments.length ? `conic-gradient(${statusStops.parts.join(",")})` : "#f0e7ea" }}><div><strong>{copy.rate}%</strong><span>{copy.rateLabel}</span></div></div>
            <div className="dx-legend">{statuses.map((item) => <div key={item.status}><i style={{ background: STATUS_COLORS[item.status] }} /><span>{item.status}</span><strong>{item.count}</strong></div>)}</div>
          </div>
          <p className="dx-rate-note"><i className="fa-solid fa-circle-check" /> {copy.rateSub}</p>
        </article>

        <article className="dx-chart-card dx-chart-card--services">
          <div className="dx-chart-title"><div><strong>{role === "patient" ? "Treatment history" : "Treatment demand"}</strong><span>{role === "patient" ? "Your most booked services" : "Most requested services"}</span></div><i className="fa-solid fa-wand-magic-sparkles" /></div>
          {topServices.length ? <div className="dx-ranking">{topServices.map(([service, count], index) => <div key={service} className="dx-rank-row"><span className="dx-rank-number">{index + 1}</span><div><strong>{service}</strong><i><b style={{ width: `${(count / topServices[0][1]) * 100}%` }} /></i></div><span>{count}</span></div>)}</div> : <div className="dx-chart-empty"><i className="fa-regular fa-calendar-plus" /><strong>No treatment data yet</strong><span>Service demand appears after appointments are booked.</span></div>}
        </article>

        <article className="dx-chart-card dx-chart-card--upcoming">
          <div className="dx-chart-title"><div><strong>{role === "patient" ? "Coming up" : "Next in the diary"}</strong><span>Upcoming confirmed visits</span></div><i className="fa-regular fa-calendar" /></div>
          {upcoming.length ? <div className="dx-upcoming-list">{upcoming.map((item) => <div key={item.id}><span className="dx-date-tile"><strong>{new Date(`${item.date}T00:00:00`).toLocaleDateString("en-PH", { day: "2-digit" })}</strong><small>{new Date(`${item.date}T00:00:00`).toLocaleDateString("en-PH", { month: "short" })}</small></span><p><strong>{role === "patient" ? item.service : item.patient}</strong><small>{item.time} · {item.service}</small></p><i className={`fa-solid ${item.status === "confirmed" ? "fa-circle-check" : "fa-clock"}`} /></div>)}</div> : <div className="dx-chart-empty"><i className="fa-regular fa-calendar-check" /><strong>Schedule is clear</strong><span>New appointments will be shown here automatically.</span></div>}
        </article>
      </div>
      <div className="dx-micro-grid">
        <div><i className="fa-solid fa-calendar-week" /><span><small>Busiest day</small><strong>{busiestDay.value ? busiestDay.label : "—"}</strong></span></div>
        <div><i className="fa-solid fa-receipt" /><span><small>{role === "patient" ? "Average booking" : "Average service"}</small><strong>₱{averageValue.toLocaleString()}</strong></span></div>
        <div><i className="fa-solid fa-sack-dollar" /><span><small>{role === "patient" ? "Treatment value" : "Active value"}</small><strong>₱{activeValue.toLocaleString()}</strong></span></div>
        <div><i className="fa-solid fa-calendar-check" /><span><small>Upcoming</small><strong>{upcoming.length}</strong></span></div>
      </div>
    </section>
  );
}
