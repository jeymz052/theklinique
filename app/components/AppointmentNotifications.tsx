"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Appointment } from "@/lib/appointments";
import { fetchNotifications, markNotificationRead, type AppNotification } from "@/lib/notifications";

interface AppointmentNotificationsProps {
  appointments?: Appointment[];
  onOpenSchedule?: () => void;
}

export default function AppointmentNotifications({ onOpenSchedule }: AppointmentNotificationsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const unreadCount = items.filter((item) => !item.read_at).length;

  const refresh = () => fetchNotifications().then(setItems).catch(() => undefined);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(interval);
  }, []);

  function toggleNotifications() {
    if (!open) void refresh();
    setOpen((value) => !value);
  }

  async function openItem(item: AppNotification) {
    if (!item.read_at) {
      await markNotificationRead(item.id);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
    }
    setOpen(false);
    if (onOpenSchedule) onOpenSchedule();
    else router.push(item.href);
  }

  async function markAllRead() {
    await markNotificationRead();
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || now })));
  }

  return (
    <div className="dk-notification-menu">
      <button type="button" className="dk-notification-trigger" onClick={toggleNotifications} aria-label="Appointment notifications" aria-expanded={open}>
        <i className="fa-solid fa-bell" />
        {unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="dk-notification-popover">
          <div className="dk-notification-head">
            <strong>Booking notifications</strong>
            {unreadCount > 0 && <button type="button" onClick={markAllRead}>Mark all read</button>}
          </div>
          <div className="dk-notification-list">
            {items.length ? items.map((item) => (
              <button key={item.id} type="button" className={`dk-notification-item ${item.read_at ? "read" : ""}`} onClick={() => openItem(item)}>
                <i className="fa-solid fa-calendar-check" />
                <span><strong>{item.title}</strong><small>{item.body}</small></span>
              </button>
            )) : <p className="dk-notification-empty">No booking notifications.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
