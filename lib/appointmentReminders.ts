export type ReminderKind = "24h" | "1h" | "online15m";
export type ReminderAppointment = { appointment_date: string; appointment_time: string; status: string; consultation_mode: string };

export function dueReminders(appointment: ReminderAppointment, now: number): ReminderKind[] {
  if (appointment.status !== "confirmed") return [];
  const start = Date.parse(`${appointment.appointment_date}T${appointment.appointment_time.slice(0, 5)}:00+08:00`);
  if (!Number.isFinite(start)) return [];
  const kinds: [ReminderKind, number][] = [["24h", 1440], ["1h", 60]];
  if (appointment.consultation_mode === "online") kinds.push(["online15m", 15]);
  return kinds.filter(([, minutes]) => now >= start - minutes * 60_000 && now < start - (minutes - 5) * 60_000).map(([kind]) => kind);
}

export function reminderEvent(appointment: Pick<ReminderAppointment, "appointment_date" | "appointment_time">, kind: ReminderKind) {
  return `appointment_reminder_${kind}:${appointment.appointment_date}:${appointment.appointment_time.slice(0, 5)}`;
}
