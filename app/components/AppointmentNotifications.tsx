"use client";

import { useMemo, useRef, useState } from "react";
import type { Appointment } from "@/lib/appointments";

interface AppointmentNotificationsProps {
  appointments: Appointment[];
  onOpenSchedule: () => void;
}

export default function AppointmentNotifications({ appointments, onOpenSchedule }: AppointmentNotificationsProps) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = useMemo(
    () => appointments.filter((appointment) => appointment.status === "pending" || appointment.status === "confirmed").slice(0, 6),
    [appointments]
  );
  const unreadCount = items.filter((item) => !read.includes(item.id)).length;

  const openSchedule = () => {
    setRead(items.map((item) => item.id));
    setOpen(false);
    onOpenSchedule();
  };

  return (
    <div className="dk-notification-menu" ref={menuRef}>
      <button type="button" className="dk-notification-trigger" onClick={() => setOpen((value) => !value)} aria-label="Appointment notifications" aria-expanded={open}>
        <i className="fa-solid fa-bell" />
        {unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="dk-notification-popover">
          <div className="dk-notification-head">
            <strong>Appointment notifications</strong>
            {unreadCount > 0 && <button type="button" onClick={() => setRead(items.map((item) => item.id))}>Mark all read</button>}
          </div>
          <div className="dk-notification-list">
            {items.length ? items.map((appointment) => (
              <button key={appointment.id} type="button" className={`dk-notification-item ${read.includes(appointment.id) ? "read" : ""}`} onClick={openSchedule}>
                <i className={`fa-solid ${appointment.status === "pending" ? "fa-hourglass-half" : "fa-calendar-check"}`} />
                <span><strong>{appointment.patient}</strong><small>{appointment.status === "pending" ? "New booking awaiting review" : "Confirmed appointment"} · {appointment.date}</small></span>
              </button>
            )) : <p className="dk-notification-empty">No appointment notifications.</p>}
          </div>
          <button type="button" className="dk-notification-footer" onClick={openSchedule}>View schedule</button>
        </div>
      )}
    </div>
  );
}
