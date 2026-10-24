"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Appointment } from "@/lib/appointments";
import { fetchNotifications, markNotificationRead, type AppNotification } from "@/lib/notifications";

interface AppointmentNotificationsProps {
  appointments?: Appointment[];
  onOpenSchedule?: () => void;
  onOpenNotification?: (href: string) => void;
}

export default function AppointmentNotifications({ onOpenSchedule, onOpenNotification }: AppointmentNotificationsProps) {
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
    if (onOpenNotification) onOpenNotification(item.href);
    else if (onOpenSchedule && !item.href.includes("view=")) onOpenSchedule();
    else router.push(item.href);
    if (item.href.includes("view=documents")) window.dispatchEvent(new Event("medical-documents-refresh"));
  }

  async function markAllRead() {
    await markNotificationRead();
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || now })));
  }

  return (
    <div className="dk-notification-menu">
      <button type="button" className="dk-notification-trigger" onClick={toggleNotifications} aria-label="Notifications" aria-expanded={open}>
        <i className="fa-solid fa-bell" />
        {unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="dk-notification-popover">
          <div className="dk-notification-head">
            <strong>Notifications</strong>
            {unreadCount > 0 && <button type="button" onClick={markAllRead}>Mark all read</button>}
          </div>
          <div className="dk-notification-list">
            {items.length ? items.map((item) => (
              <button key={item.id} type="button" className={`dk-notification-item ${item.read_at ? "read" : ""}`} onClick={() => openItem(item)}>
                <i aria-hidden="true" className={`fa-solid ${item.event?.startsWith("prescription_ready:") ? "fa-file-prescription" : item.event?.startsWith("appointment_reminder_") ? "fa-clock" : "fa-calendar-check"}`} />
                <span><strong>{item.title}</strong><small>{item.body}</small><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</time></span>
              </button>
            )) : <p className="dk-notification-empty">No notifications yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
